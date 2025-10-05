const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'linkedin_automation.db');

// Token encryption key (must match server.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

function encryptToken(token) {
  if (!token || !ENCRYPTION_KEY) return token;

  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Token encryption failed:', error.message);
    return token;
  }
}

function decryptToken(encryptedToken) {
  if (!encryptedToken || !ENCRYPTION_KEY) return encryptedToken;

  try {
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) return encryptedToken;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Token decryption failed:', error.message);
    return encryptedToken;
  }
}

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initialize();
      }
    });
  }

  initialize() {
    this.db.serialize(() => {
      // Users table for storing tokens
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sub TEXT UNIQUE NOT NULL,
          name TEXT,
          email TEXT,
          picture TEXT,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          token_expires_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Posts table for tracking processed posts
      this.db.run(`
        CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id TEXT UNIQUE NOT NULL,
          author_id TEXT,
          author_name TEXT,
          content TEXT,
          timestamp INTEGER,
          processed INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Scheduled posts table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS scheduled_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_sub TEXT NOT NULL,
          content TEXT NOT NULL,
          image_url TEXT,
          publish_at INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          linkedin_post_id TEXT,
          error_message TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          published_at INTEGER,
          FOREIGN KEY (user_sub) REFERENCES users(sub)
        )
      `);

      // Reactions table for tracking reactions
      this.db.run(`
        CREATE TABLE IF NOT EXISTS reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id TEXT NOT NULL,
          reaction_type TEXT NOT NULL,
          success INTEGER DEFAULT 1,
          error_message TEXT,
          timestamp INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (post_id) REFERENCES posts(post_id)
        )
      `);

      // Settings table for configuration
      this.db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // API rate limit tracking
      this.db.run(`
        CREATE TABLE IF NOT EXISTS api_calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Activity log for visibility
      this.db.run(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_sub TEXT NOT NULL,
          action_type TEXT NOT NULL,
          action_data TEXT,
          status TEXT NOT NULL,
          timestamp INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (user_sub) REFERENCES users(sub)
        )
      `);

      // Initialize default settings
      this.initializeDefaultSettings();

      // Create indexes for performance
      this.db.run('CREATE INDEX IF NOT EXISTS idx_posts_processed ON posts(processed)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_posts_timestamp ON posts(timestamp DESC)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_reactions_timestamp ON reactions(timestamp DESC)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_scheduled_posts_publish_at ON scheduled_posts(publish_at)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp ON api_calls(timestamp DESC)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_activity_log_user_timestamp ON activity_log(user_sub, timestamp DESC)');
    });
  }

  initializeDefaultSettings() {
    const defaultSettings = {
      'automation_enabled': 'false',
      'poll_interval': '300000', // 5 minutes in milliseconds
      'reaction_types': JSON.stringify(['LIKE', 'CELEBRATE']),
      'whitelist_users': JSON.stringify([]),
      'keyword_filters': JSON.stringify([]),
      'daily_limit': '500',
      'daily_count': '0',
      'daily_reset_date': new Date().toISOString().split('T')[0]
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      this.db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }
  }

  // User operations
  saveUser(user, tokens) {
    return new Promise((resolve, reject) => {
      const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in || 5184000); // Default 60 days

      this.db.run(`
        INSERT OR REPLACE INTO users (sub, name, email, picture, access_token, refresh_token, token_expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `, [
        user.sub,
        user.name,
        user.email,
        user.picture,
        encryptToken(tokens.access_token),
        tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        expiresAt
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getUser(sub) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE sub = ?', [sub], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          // Decrypt tokens before returning
          row.access_token = decryptToken(row.access_token);
          if (row.refresh_token) {
            row.refresh_token = decryptToken(row.refresh_token);
          }
          resolve(row);
        } else {
          resolve(row);
        }
      });
    });
  }

  updateUserToken(sub, accessToken, expiresIn) {
    return new Promise((resolve, reject) => {
      const expiresAt = Math.floor(Date.now() / 1000) + (expiresIn || 5184000);

      this.db.run(`
        UPDATE users
        SET access_token = ?, token_expires_at = ?, updated_at = strftime('%s', 'now')
        WHERE sub = ?
      `, [encryptToken(accessToken), expiresAt, sub], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Post operations
  savePost(post) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR IGNORE INTO posts (post_id, author_id, author_name, content, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `, [
        post.post_id,
        post.author_id,
        post.author_name,
        post.content,
        post.timestamp
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  markPostProcessed(postId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE posts SET processed = 1 WHERE post_id = ?',
        [postId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  getUnprocessedPosts() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM posts WHERE processed = 0 ORDER BY timestamp DESC',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  isPostProcessed(postId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id FROM posts WHERE post_id = ? AND processed = 1',
        [postId],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }

  // Reaction operations
  saveReaction(reaction) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO reactions (post_id, reaction_type, success, error_message)
        VALUES (?, ?, ?, ?)
      `, [
        reaction.post_id,
        reaction.reaction_type,
        reaction.success ? 1 : 0,
        reaction.error_message || null
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getRecentReactions(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT r.*, p.author_name, p.content
        FROM reactions r
        LEFT JOIN posts p ON r.post_id = p.post_id
        ORDER BY r.timestamp DESC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getTodayReactionCount() {
    return new Promise((resolve, reject) => {
      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

      this.db.get(
        'SELECT COUNT(*) as count FROM reactions WHERE timestamp >= ? AND success = 1',
        [todayStart],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  // Settings operations
  getSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) reject(err);
        else resolve(row?.value || null);
      });
    });
  }

  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `, [key, value], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  getAllSettings() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT key, value FROM settings', (err, rows) => {
        if (err) reject(err);
        else {
          const settings = {};
          rows.forEach(row => {
            settings[row.key] = row.value;
          });
          resolve(settings);
        }
      });
    });
  }

  // Statistics
  getStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          (SELECT COUNT(*) FROM posts) as total_posts,
          (SELECT COUNT(*) FROM posts WHERE processed = 1) as processed_posts,
          (SELECT COUNT(*) FROM reactions WHERE success = 1) as total_reactions,
          (SELECT COUNT(*) FROM reactions WHERE timestamp >= strftime('%s', 'now', 'start of day') AND success = 1) as today_reactions
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0] || {});
      });
    });
  }

  // Scheduled posts operations
  createScheduledPost(userSub, content, imageUrl, publishAt) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO scheduled_posts (user_sub, content, image_url, publish_at)
        VALUES (?, ?, ?, ?)
      `, [userSub, content, imageUrl, publishAt], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getPendingScheduledPosts() {
    return new Promise((resolve, reject) => {
      const now = Math.floor(Date.now() / 1000);
      this.db.all(`
        SELECT * FROM scheduled_posts
        WHERE status = 'pending' AND publish_at <= ?
        ORDER BY publish_at ASC
      `, [now], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getScheduledPosts(userSub, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM scheduled_posts
        WHERE user_sub = ?
        ORDER BY publish_at DESC
        LIMIT ?
      `, [userSub, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  updateScheduledPostStatus(id, status, linkedinPostId = null, errorMessage = null) {
    return new Promise((resolve, reject) => {
      const publishedAt = status === 'published' ? Math.floor(Date.now() / 1000) : null;
      this.db.run(`
        UPDATE scheduled_posts
        SET status = ?, linkedin_post_id = ?, error_message = ?, published_at = ?
        WHERE id = ?
      `, [status, linkedinPostId, errorMessage, publishedAt, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  getTodayScheduledPostCount(userSub) {
    return new Promise((resolve, reject) => {
      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      this.db.get(`
        SELECT COUNT(*) as count FROM scheduled_posts
        WHERE user_sub = ? AND published_at >= ? AND status = 'published'
      `, [userSub, todayStart], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }

  deleteScheduledPost(id, userSub) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM scheduled_posts WHERE id = ? AND user_sub = ? AND status = \'pending\'',
        [id, userSub],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // API call tracking
  trackApiCall(endpoint, method, statusCode) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO api_calls (endpoint, method, status_code)
        VALUES (?, ?, ?)
      `, [endpoint, method, statusCode], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getTodayApiCallCount() {
    return new Promise((resolve, reject) => {
      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      this.db.get(
        'SELECT COUNT(*) as count FROM api_calls WHERE timestamp >= ?',
        [todayStart],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  getRecentApiCalls(limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM api_calls ORDER BY timestamp DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Analytics
  getPostsPerWeek(userSub, weeks = 8) {
    return new Promise((resolve, reject) => {
      const weeksAgo = Math.floor(Date.now() / 1000) - (weeks * 7 * 24 * 60 * 60);
      this.db.all(`
        SELECT
          strftime('%Y-%W', datetime(published_at, 'unixepoch')) as week,
          COUNT(*) as count
        FROM scheduled_posts
        WHERE user_sub = ? AND status = 'published' AND published_at >= ?
        GROUP BY week
        ORDER BY week ASC
      `, [userSub, weeksAgo], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Activity log operations
  logActivity(userSub, actionType, actionData, status) {
    return new Promise((resolve, reject) => {
      const dataJson = actionData ? JSON.stringify(actionData) : null;

      this.db.run(`
        INSERT INTO activity_log (user_sub, action_type, action_data, status)
        VALUES (?, ?, ?, ?)
      `, [userSub, actionType, dataJson, status], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  getRecentActivity(userSub, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT id, action_type, action_data, status, timestamp
        FROM activity_log
        WHERE user_sub = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, [userSub, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse JSON action_data
          const activities = rows.map(row => ({
            ...row,
            action_data: row.action_data ? JSON.parse(row.action_data) : null
          }));
          resolve(activities);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = new Database();
