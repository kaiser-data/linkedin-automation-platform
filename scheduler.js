const cron = require('node-cron');
const axios = require('axios');
const db = require('./database');

class PostScheduler {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) {
      console.log('Scheduler already running');
      return;
    }

    // Run every minute to check for posts to publish
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processScheduledPosts();
    });

    this.isRunning = true;
    console.log('Post scheduler started');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('Post scheduler stopped');
  }

  async processScheduledPosts() {
    try {
      const pendingPosts = await db.getPendingScheduledPosts();

      if (pendingPosts.length === 0) {
        return;
      }

      console.log(`Found ${pendingPosts.length} posts to publish`);

      for (const post of pendingPosts) {
        await this.publishPost(post);
      }
    } catch (error) {
      console.error('Error processing scheduled posts:', error.message);
    }
  }

  async publishPost(post) {
    try {
      // Get user's access token
      const user = await db.getUser(post.user_sub);
      if (!user || !user.access_token) {
        throw new Error('User access token not found');
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (user.token_expires_at && user.token_expires_at < now) {
        throw new Error('Access token expired');
      }

      console.log(`Publishing post ${post.id}: "${post.content.substring(0, 50)}..."`);

      // Prepare post payload for LinkedIn API
      const payload = {
        author: `urn:li:person:${user.sub}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: post.content
            },
            shareMediaCategory: post.image_url ? 'IMAGE' : 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      // Add image if provided
      if (post.image_url) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            originalUrl: post.image_url
          }
        ];
      }

      // Publish to LinkedIn using REST API
      const response = await axios.post(
        'https://api.linkedin.com/rest/posts',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${user.access_token}`,
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202405',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      const linkedinPostId = response.data.id || response.headers['x-restli-id'];

      // Update post status
      await db.updateScheduledPostStatus(post.id, 'published', linkedinPostId);

      // Track API call
      await db.trackApiCall('/rest/posts', 'POST', response.status);

      console.log(`✓ Post ${post.id} published successfully`);

    } catch (error) {
      console.error(`✗ Failed to publish post ${post.id}:`, error.message);

      // Update post status to failed
      await db.updateScheduledPostStatus(
        post.id,
        'failed',
        null,
        error.response?.data?.message || error.message
      );

      // Track API call
      if (error.response) {
        await db.trackApiCall('/rest/posts', 'POST', error.response.status);
      }
    }
  }

  async getStatus() {
    const pendingPosts = await db.getPendingScheduledPosts();
    return {
      running: this.isRunning,
      pendingPosts: pendingPosts.length,
      nextRun: this.cronJob ? this.cronJob.nextDates(1).toString() : null
    };
  }
}

module.exports = new PostScheduler();
