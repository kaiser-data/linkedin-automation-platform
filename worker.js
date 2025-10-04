const axios = require('axios');
const db = require('./database');

class LinkedInWorker {
  constructor() {
    this.isRunning = false;
    this.pollInterval = null;
    this.rateLimitRemaining = 500;
    this.rateLimitReset = null;
  }

  async start() {
    if (this.isRunning) {
      console.log('Worker already running');
      return;
    }

    const enabled = await db.getSetting('automation_enabled');
    if (enabled !== 'true') {
      console.log('Automation is disabled');
      return;
    }

    this.isRunning = true;
    console.log('LinkedIn automation worker started');

    // Run immediately on start
    await this.processFeed();

    // Then schedule regular polling
    const interval = parseInt(await db.getSetting('poll_interval')) || 300000;
    this.pollInterval = setInterval(() => this.processFeed(), interval);
  }

  async stop() {
    if (!this.isRunning) {
      console.log('Worker not running');
      return;
    }

    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('LinkedIn automation worker stopped');
  }

  async processFeed() {
    try {
      console.log('Processing LinkedIn feed...');

      // Get user with valid token
      const user = await this.getAuthenticatedUser();
      if (!user) {
        console.log('No authenticated user found');
        await db.setSetting('automation_enabled', 'false');
        this.stop();
        return;
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (user.token_expires_at && user.token_expires_at < now) {
        console.log('Access token expired');
        // In production, implement token refresh here
        await db.setSetting('automation_enabled', 'false');
        this.stop();
        return;
      }

      // Check daily limit
      const todayCount = await db.getTodayReactionCount();
      const dailyLimit = parseInt(await db.getSetting('daily_limit')) || 500;

      if (todayCount >= dailyLimit) {
        console.log(`Daily limit reached: ${todayCount}/${dailyLimit}`);
        return;
      }

      // Fetch recent posts from feed
      const posts = await this.fetchFeed(user.access_token);
      console.log(`Fetched ${posts.length} posts from feed`);

      // Process each post
      for (const post of posts) {
        // Check if already processed
        const isProcessed = await db.isPostProcessed(post.id);
        if (isProcessed) {
          continue;
        }

        // Save post to database
        await db.savePost({
          post_id: post.id,
          author_id: post.author.id,
          author_name: post.author.name,
          content: post.content || '',
          timestamp: Math.floor(new Date(post.createdAt).getTime() / 1000)
        });

        // Check if should react
        if (await this.shouldReact(post)) {
          await this.reactToPost(post, user.access_token);

          // Check if we've hit the limit
          const currentCount = await db.getTodayReactionCount();
          if (currentCount >= dailyLimit) {
            console.log('Daily limit reached during processing');
            break;
          }
        }

        // Mark as processed
        await db.markPostProcessed(post.id);
      }

      console.log('Feed processing completed');

    } catch (error) {
      console.error('Error processing feed:', error.message);

      // Handle rate limiting
      if (error.response?.status === 429) {
        console.log('Rate limit hit, pausing automation');
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
          console.log(`Retry after: ${retryAfter} seconds`);
        }
      }
    }
  }

  async fetchFeed(accessToken) {
    try {
      // LinkedIn UGC Posts API endpoint
      // Note: This uses the /v2/shares endpoint which may require additional permissions
      const response = await axios.get('https://api.linkedin.com/v2/shares', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          q: 'owners',
          owners: 'urn:li:person:CURRENT', // This needs to be replaced with actual person URN
          count: 20,
          sortBy: 'LAST_MODIFIED'
        }
      });

      // Transform response to standard format
      const posts = [];
      if (response.data.elements) {
        for (const share of response.data.elements) {
          posts.push({
            id: share.id || share.activity,
            author: {
              id: share.owner || 'unknown',
              name: share.owner || 'Unknown'
            },
            content: share.text?.text || '',
            createdAt: share.created?.time || Date.now()
          });
        }
      }

      return posts;

    } catch (error) {
      if (error.response?.status === 404) {
        console.log('Using alternative feed endpoint...');
        // Fallback: Try to get user's own posts
        return await this.fetchUserPosts(accessToken);
      }
      throw error;
    }
  }

  async fetchUserPosts(accessToken) {
    // Alternative: Fetch user's own posts as a fallback
    // In production, you would use the correct LinkedIn API endpoints
    try {
      const response = await axios.get('https://api.linkedin.com/v2/ugcPosts', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          q: 'authors',
          authors: 'urn:li:person:CURRENT',
          count: 10
        }
      });

      const posts = [];
      if (response.data.elements) {
        for (const post of response.data.elements) {
          posts.push({
            id: post.id,
            author: {
              id: post.author,
              name: 'User'
            },
            content: post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '',
            createdAt: post.created?.time || Date.now()
          });
        }
      }

      return posts;
    } catch (error) {
      console.error('Error fetching user posts:', error.message);
      return [];
    }
  }

  async shouldReact(post) {
    // Get reaction rules from settings
    const whitelistStr = await db.getSetting('whitelist_users');
    const keywordsStr = await db.getSetting('keyword_filters');

    const whitelist = JSON.parse(whitelistStr || '[]');
    const keywords = JSON.parse(keywordsStr || '[]');

    // If whitelist is empty and no keywords, react to all
    if (whitelist.length === 0 && keywords.length === 0) {
      return true;
    }

    // Check whitelist
    if (whitelist.length > 0) {
      const isWhitelisted = whitelist.some(userId =>
        post.author.id.includes(userId) || post.author.name.toLowerCase().includes(userId.toLowerCase())
      );

      if (!isWhitelisted) {
        return false;
      }
    }

    // Check keywords
    if (keywords.length > 0) {
      const content = (post.content || '').toLowerCase();
      const hasKeyword = keywords.some(keyword =>
        content.includes(keyword.toLowerCase())
      );

      if (!hasKeyword) {
        return false;
      }
    }

    return true;
  }

  async reactToPost(post, accessToken) {
    try {
      // Get reaction type preference
      const reactionTypesStr = await db.getSetting('reaction_types');
      const reactionTypes = JSON.parse(reactionTypesStr || '["LIKE"]');

      // Pick a random reaction type from preferences
      const reactionType = reactionTypes[Math.floor(Math.random() * reactionTypes.length)];

      // LinkedIn Social Actions API - React to post
      // Note: The actual endpoint and payload structure may vary based on LinkedIn API version
      const response = await axios.post(
        'https://api.linkedin.com/v2/socialActions',
        {
          actor: 'urn:li:person:CURRENT', // Will be replaced with actual URN
          action: reactionType,
          object: post.id
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      // Log successful reaction
      await db.saveReaction({
        post_id: post.id,
        reaction_type: reactionType,
        success: true
      });

      console.log(`Reacted to post ${post.id} with ${reactionType}`);

    } catch (error) {
      console.error(`Error reacting to post ${post.id}:`, error.message);

      // Log failed reaction
      await db.saveReaction({
        post_id: post.id,
        reaction_type: 'LIKE',
        success: false,
        error_message: error.message
      });

      // Handle rate limiting
      if (error.response?.status === 429) {
        throw error; // Re-throw to stop processing
      }
    }
  }

  async getAuthenticatedUser() {
    // Get the first user from database (in production, handle multiple users)
    return new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM users ORDER BY updated_at DESC LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getStatus() {
    const stats = await db.getStats();
    const todayCount = await db.getTodayReactionCount();
    const dailyLimit = parseInt(await db.getSetting('daily_limit')) || 500;

    return {
      running: this.isRunning,
      todayReactions: todayCount,
      dailyLimit: dailyLimit,
      remaining: Math.max(0, dailyLimit - todayCount),
      ...stats
    };
  }
}

module.exports = new LinkedInWorker();
