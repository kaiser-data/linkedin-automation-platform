require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const crypto = require('crypto');
const multer = require('multer');
const db = require('./database');
const scheduler = require('./scheduler');
const connections = require('./connections');

const app = express();
const PORT = process.env.PORT || 3000;

// Token encryption utilities (AES-256-GCM)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

if (!process.env.ENCRYPTION_KEY) {
  console.warn('⚠️  WARNING: ENCRYPTION_KEY not set in .env - using random key (tokens will be invalid after restart)');
  console.warn('   Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

function encryptToken(token) {
  if (!token) return null;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedToken) {
  if (!encryptedToken) return null;

  try {
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) {
      // Might be unencrypted token from before encryption was added
      console.warn('⚠️  Token not in encrypted format - migration needed');
      return encryptedToken;
    }

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
    return null;
  }
}

// LinkedIn OIDC endpoints
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_JWKS_URL = 'https://www.linkedin.com/oauth/openid/jwks';

// JWKS client for token verification
const client = jwksClient({
  jwksUri: LINKEDIN_JWKS_URL,
  cache: true,
  cacheMaxAge: 86400000 // 24 hours
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  }
}));

app.use(express.static('public'));
app.use(express.json());

// Configure multer for file uploads (memory storage for CSV)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Helper function to get signing key
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    }
  });
}

// Helper function to verify ID token
async function verifyIdToken(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, getKey, {
      algorithms: ['RS256'],
      issuer: 'https://www.linkedin.com',
      audience: process.env.LINKEDIN_CLIENT_ID
    }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Connections route
app.get('/connections', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(__dirname + '/public/connections.html');
});

// Root route - serve landing page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LinkedIn OIDC - Profile</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .profile-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .profile-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
          }
          .profile-picture {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin-right: 20px;
          }
          .profile-info p {
            margin: 5px 0;
          }
          .nav-links {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
          .nav-btn {
            background: #0073b1;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            transition: background 0.2s;
          }
          .nav-btn:hover {
            background: #005885;
          }
          .nav-btn.secondary {
            background: #6c757d;
          }
          .nav-btn.secondary:hover {
            background: #5a6268;
          }
        </style>
      </head>
      <body>
        <div class="profile-card">
          <h1>Profile Information</h1>
          <div class="profile-header">
            ${req.session.user.picture ? `<img src="${req.session.user.picture}" alt="Profile" class="profile-picture">` : ''}
            <div class="profile-info">
              <p><strong>Name:</strong> ${req.session.user.name || 'N/A'}</p>
              <p><strong>Email:</strong> ${req.session.user.email || 'N/A'}</p>
              <p><strong>Sub:</strong> ${req.session.user.sub || 'N/A'}</p>
            </div>
          </div>
          <div class="nav-links">
            <a href="/dashboard" class="nav-btn">📊 Dashboard</a>
            <a href="/connections" class="nav-btn">🔗 Connections</a>
            <a href="/logout" class="nav-btn secondary">Logout</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.sendFile(__dirname + '/public/index.html');
  }
});

// Login route - redirect to LinkedIn
app.get('/auth/linkedin', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  req.session.state = state;
  req.session.nonce = nonce;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'openid profile email',  // Basic scopes only - add w_member_social r_member_social after getting Community API access
    state: state,
    nonce: nonce
  });

  res.redirect(`${LINKEDIN_AUTH_URL}?${params.toString()}`);
});

// Callback route - handle OAuth callback
app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #d32f2f;
          }
          .error-card h1 {
            color: #d32f2f;
            margin-top: 0;
          }
          .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #0073b1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <h1>Authentication Failed</h1>
          <p><strong>Error:</strong> ${error}</p>
          <p><strong>Description:</strong> ${error_description || 'No additional details provided'}</p>
          <a href="/" class="back-link">← Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }

  // Verify state parameter
  if (!state || state !== req.session.state) {
    console.error('State mismatch - possible CSRF attack');
    return res.status(403).send('Invalid state parameter');
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await axios.post(LINKEDIN_TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, id_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token received');
    }

    // Verify ID token if present
    if (id_token) {
      try {
        const decoded = await verifyIdToken(id_token);

        // Verify nonce
        if (decoded.nonce !== req.session.nonce) {
          throw new Error('Nonce mismatch');
        }

        console.log('ID token verified successfully');
      } catch (err) {
        console.error('ID token verification failed:', err.message);
        // Continue anyway - we'll get user info from userinfo endpoint
      }
    }

    // Fetch user profile from userinfo endpoint
    const userInfoResponse = await axios.get(LINKEDIN_USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const userInfo = userInfoResponse.data;

    // Store user info in session
    req.session.user = {
      sub: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture
    };

    // Persist tokens to database for API calls
    await db.saveUser(userInfo, {
      access_token,
      refresh_token: refresh_token || null,
      expires_in: expires_in || 5184000  // Default 60 days if not provided
    });

    // Clean up state and nonce
    delete req.session.state;
    delete req.session.nonce;

    res.redirect('/');

  } catch (error) {
    console.error('Authentication error:', error.response?.data || error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .error-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #d32f2f;
          }
          .error-card h1 {
            color: #d32f2f;
            margin-top: 0;
          }
          .error-details {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
            font-family: monospace;
            font-size: 14px;
            overflow-x: auto;
          }
          .back-link {
            display: inline-block;
            margin-top: 20px;
            color: #0073b1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <h1>Authentication Error</h1>
          <p>An error occurred during the authentication process.</p>
          <div class="error-details">${error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message}</div>
          <a href="/" class="back-link">← Back to Home</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Rate limiter middleware
const rateLimiters = new Map();

// Cleanup old rate limiter entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const maxWindowMs = 86400000; // 24 hours

  for (const [key, requests] of rateLimiters.entries()) {
    const validRequests = requests.filter(time => now - time < maxWindowMs);
    if (validRequests.length === 0) {
      rateLimiters.delete(key);
    } else {
      rateLimiters.set(key, validRequests);
    }
  }

  console.log(`[Rate Limiter Cleanup] Cleaned up stale entries. Active keys: ${rateLimiters.size}`);
}, 5 * 60 * 1000); // Run every 5 minutes

function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.session.user?.sub || req.ip;
    const now = Date.now();

    if (!rateLimiters.has(key)) {
      rateLimiters.set(key, []);
    }

    const requests = rateLimiters.get(key).filter(time => now - time < windowMs);
    requests.push(now);
    rateLimiters.set(key, requests);

    if (requests.length > maxRequests) {
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs/1000} seconds.`
      });
    }

    next();
  };
}

// API: Get rate limit status
app.get('/api/rate-limit', requireAuth, async (req, res) => {
  try {
    const count = await db.getTodayApiCallCount();
    res.json({
      used: count,
      limit: 500,
      remaining: Math.max(0, 500 - count),
      resetAt: new Date().setHours(24, 0, 0, 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Input validation middleware
function validateSchedulePost(req, res, next) {
  const { content, image_url, publish_at } = req.body;

  // Content validation
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required and must be a string' });
  }

  if (content.trim().length === 0) {
    return res.status(400).json({ error: 'Content cannot be empty' });
  }

  if (content.length > 3000) {
    return res.status(400).json({ error: 'Content exceeds maximum length of 3000 characters' });
  }

  // Image URL validation (optional field)
  if (image_url !== null && image_url !== undefined && image_url !== '') {
    if (typeof image_url !== 'string') {
      return res.status(400).json({ error: 'Image URL must be a string' });
    }

    // Basic URL format validation
    try {
      new URL(image_url);
    } catch {
      return res.status(400).json({ error: 'Invalid image URL format' });
    }

    if (!image_url.match(/^https?:\/\/.+/i)) {
      return res.status(400).json({ error: 'Image URL must use HTTP or HTTPS protocol' });
    }
  }

  // Publish time validation
  if (!publish_at) {
    return res.status(400).json({ error: 'Publish time is required' });
  }

  const publishTime = new Date(publish_at);
  if (isNaN(publishTime.getTime())) {
    return res.status(400).json({ error: 'Invalid publish time format' });
  }

  const publishTimestamp = publishTime.getTime() / 1000;
  const now = Date.now() / 1000;

  if (publishTimestamp <= now) {
    return res.status(400).json({ error: 'Publish time must be in the future' });
  }

  // Don't allow scheduling more than 1 year in advance
  const oneYearFromNow = now + (365 * 24 * 60 * 60);
  if (publishTimestamp > oneYearFromNow) {
    return res.status(400).json({ error: 'Cannot schedule posts more than 1 year in advance' });
  }

  next();
}

// API: Create scheduled post
app.post('/api/posts/schedule', requireAuth, validateSchedulePost, async (req, res) => {
  try {
    const { content, image_url, publish_at } = req.body;

    // Check daily limit
    const todayCount = await db.getTodayScheduledPostCount(req.session.user.sub);
    if (todayCount >= 10) {
      return res.status(429).json({ error: 'Daily limit of 10 posts reached' });
    }

    // Convert to timestamp
    const publishTimestamp = new Date(publish_at).getTime() / 1000;

    const postId = await db.createScheduledPost(
      req.session.user.sub,
      content,
      image_url || null,
      publishTimestamp
    );

    // Log activity
    await db.logActivity(
      req.session.user.sub,
      'SCHEDULED_POST',
      { postId, contentLength: content.length, publishAt: publish_at },
      'success'
    );

    res.json({ success: true, id: postId });
  } catch (error) {
    // Log failed activity
    await db.logActivity(
      req.session.user?.sub,
      'SCHEDULED_POST',
      { error: error.message },
      'failed'
    ).catch(console.error);

    res.status(500).json({ error: error.message });
  }
});

// API: Get scheduled posts
app.get('/api/posts/scheduled', requireAuth, async (req, res) => {
  try {
    const posts = await db.getScheduledPosts(req.session.user.sub);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Delete scheduled post
app.delete('/api/posts/scheduled/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteScheduledPost(req.params.id, req.session.user.sub);
    if (deleted === 0) {
      return res.status(404).json({ error: 'Post not found or already published' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get user's published posts
app.get('/api/posts/published', requireAuth, rateLimit(20, 60000), async (req, res) => {
  try {
    const user = await db.getUser(req.session.user.sub);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: 'No access token found' });
    }

    // Track API call
    await db.trackApiCall('/rest/posts', 'GET', 200);

    // Fetch user's posts from LinkedIn
    const response = await axios.get('https://api.linkedin.com/rest/posts', {
      headers: {
        'Authorization': `Bearer ${user.access_token}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      params: {
        author: `urn:li:person:${user.sub}`,
        q: 'author',
        count: 20
      }
    });

    res.json(response.data);
  } catch (error) {
    await db.trackApiCall('/rest/posts', 'GET', error.response?.status || 500);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

// API: Get post comments
app.get('/api/posts/:postId/comments', requireAuth, rateLimit(20, 60000), async (req, res) => {
  try {
    const user = await db.getUser(req.session.user.sub);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: 'No access token found' });
    }

    // Track API call
    await db.trackApiCall('/rest/comments', 'GET', 200);

    const response = await axios.get(`https://api.linkedin.com/rest/comments`, {
      headers: {
        'Authorization': `Bearer ${user.access_token}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      params: {
        q: 'post',
        post: req.params.postId
      }
    });

    res.json(response.data);
  } catch (error) {
    await db.trackApiCall('/rest/comments', 'GET', error.response?.status || 500);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

// API: Like a comment
app.post('/api/comments/:commentId/like', requireAuth, rateLimit(3, 60000), async (req, res) => {
  try {
    const user = await db.getUser(req.session.user.sub);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: 'No access token found' });
    }

    // Track API call
    await db.trackApiCall('/rest/reactions', 'POST', 201);

    const response = await axios.post(
      'https://api.linkedin.com/rest/reactions',
      {
        root: req.params.commentId,
        reactionType: 'LIKE'
      },
      {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'LinkedIn-Version': '202405',
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    await db.trackApiCall('/rest/reactions', 'POST', error.response?.status || 500);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

// API: Get recent activity
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activities = await db.getRecentActivity(req.session.user.sub, limit);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get analytics data
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const postsPerWeek = await db.getPostsPerWeek(req.session.user.sub);
    const scheduledPosts = await db.getScheduledPosts(req.session.user.sub);

    const publishedCount = scheduledPosts.filter(p => p.status === 'published').length;
    const pendingCount = scheduledPosts.filter(p => p.status === 'pending').length;

    res.json({
      postsPerWeek,
      summary: {
        totalPublished: publishedCount,
        totalPending: pendingCount,
        totalScheduled: scheduledPosts.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Export analytics data
app.get('/api/analytics/export', requireAuth, async (req, res) => {
  try {
    const postsPerWeek = await db.getPostsPerWeek(req.session.user.sub, 52);
    const scheduledPosts = await db.getScheduledPosts(req.session.user.sub, 1000);
    const apiCalls = await db.getRecentApiCalls(1000);

    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        sub: req.session.user.sub,
        name: req.session.user.name,
        email: req.session.user.email
      },
      analytics: {
        postsPerWeek,
        totalPosts: scheduledPosts.length,
        publishedPosts: scheduledPosts.filter(p => p.status === 'published').length,
        pendingPosts: scheduledPosts.filter(p => p.status === 'pending').length,
        failedPosts: scheduledPosts.filter(p => p.status === 'failed').length
      },
      scheduledPosts,
      apiUsage: {
        totalCalls: apiCalls.length,
        recentCalls: apiCalls.slice(0, 100)
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=linkedin-analytics-${Date.now()}.json`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== CONNECTION MANAGEMENT ENDPOINTS ==========

// API: Upload and import connections CSV
app.post('/api/connections/import', requireAuth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    // Save the CSV file
    const filepath = await connections.saveUploadedCSV(req.file.buffer, req.session.user.sub);

    // Import connections from the file
    const result = await connections.importConnectionsFromFile(filepath, req.session.user.sub);

    // Log activity
    await db.logActivity(
      req.session.user.sub,
      'IMPORT_CONNECTIONS',
      { filename: req.file.originalname, ...result },
      'success'
    );

    res.json({
      success: true,
      ...result,
      message: `Imported ${result.imported} connections (${result.skipped} duplicates skipped)`
    });
  } catch (error) {
    await db.logActivity(
      req.session.user?.sub,
      'IMPORT_CONNECTIONS',
      { error: error.message },
      'failed'
    ).catch(console.error);

    res.status(500).json({ error: error.message });
  }
});

// API: Get connection statistics
app.get('/api/connections/stats', requireAuth, async (req, res) => {
  try {
    const stats = await connections.getConnectionStats(req.session.user.sub);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Search connections
app.get('/api/connections/search', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 50;

    const results = await connections.searchConnections(req.session.user.sub, query, limit);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get all connections
app.get('/api/connections', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const allConnections = await db.getAllConnections(req.session.user.sub, limit);
    res.json(allConnections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get connections without profile data
app.get('/api/connections/needs-data', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const needingData = await connections.getConnectionsNeedingData(req.session.user.sub, limit);
    res.json(needingData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Manually fetch profile data for a specific connection
app.post('/api/connections/:id/fetch-profile', requireAuth, rateLimit(10, 60000), async (req, res) => {
  try {
    const connection = await db.getConnectionById(req.params.id, req.session.user.sub);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Get user's access token
    const user = await db.getUser(req.session.user.sub);
    if (!user || !user.access_token) {
      return res.status(401).json({ error: 'No access token found' });
    }

    // Note: LinkedIn API doesn't provide direct profile lookup by email
    // This endpoint is prepared for when you have the profile URN or URL
    // For now, we'll return a message about manual data entry

    // Track API call attempt
    await db.trackApiCall('/profile-fetch', 'GET', 200);

    res.json({
      success: false,
      message: 'LinkedIn API does not support profile lookup by email. You can manually add data or use LinkedIn Sales Navigator API.',
      connection: {
        id: connection.id,
        name: `${connection.first_name} ${connection.last_name}`,
        email: connection.email,
        company: connection.company,
        position: connection.position
      }
    });

  } catch (error) {
    await db.trackApiCall('/profile-fetch', 'GET', error.response?.status || 500);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

// API: Manually update connection profile data
app.post('/api/connections/:id/update-profile', requireAuth, async (req, res) => {
  try {
    const { profileData } = req.body;

    if (!profileData || typeof profileData !== 'object') {
      return res.status(400).json({ error: 'Profile data is required' });
    }

    const updated = await db.updateConnectionProfileData(
      req.params.id,
      req.session.user.sub,
      profileData
    );

    if (updated === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Log activity
    await db.logActivity(
      req.session.user.sub,
      'UPDATE_CONNECTION_PROFILE',
      { connectionId: req.params.id },
      'success'
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update connection tags
app.post('/api/connections/:id/tags', requireAuth, async (req, res) => {
  try {
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }

    const updated = await db.updateConnectionTags(
      req.params.id,
      req.session.user.sub,
      tags
    );

    if (updated === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update connection notes
app.post('/api/connections/:id/notes', requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;

    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'Notes must be a string' });
    }

    const updated = await db.updateConnectionNotes(
      req.params.id,
      req.session.user.sub,
      notes
    );

    if (updated === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Centralized error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  // Log error to activity log if user is authenticated
  if (req.session?.user) {
    db.logActivity(
      req.session.user.sub,
      'ERROR',
      {
        message: err.message,
        path: req.path,
        method: req.method
      },
      'failed'
    ).catch(console.error);
  }

  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Send error response
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler (must be after error handler)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');

  // Start post scheduler
  scheduler.start();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  scheduler.stop();
  await db.close();
  process.exit(0);
});
