/**
 * Intelligent Sync Engine for 5000+ Connections
 *
 * Features:
 * - Queue-based processing with priority
 * - Resumable after API limit hit
 * - Progressive sync (most important first)
 * - Multi-day sync support
 */

const axios = require('axios');
const db = require('./database');

class SyncEngine {
  constructor(options = {}) {
    this.dailyApiLimit = options.dailyApiLimit || 500;
    this.reservePool = options.reservePool || 50; // Reserve for manual actions
    this.usableLimit = this.dailyApiLimit - this.reservePool;
    this.batchSize = options.batchSize || 10;
    this.apiCallsUsed = 0;
    this.sessionId = null;
  }

  /**
   * Initialize sync session
   */
  async initialize(userSub) {
    this.userSub = userSub;

    // Check for existing session today
    const today = new Date().toISOString().split('T')[0];
    let session = await db.getSyncSession(today);

    if (!session) {
      // Create new session
      session = await db.createSyncSession({
        session_date: today,
        status: 'running',
        api_calls_limit: this.usableLimit,
        started_at: Date.now() / 1000
      });
    } else if (session.status === 'paused') {
      // Resume existing session
      console.log(`Resuming sync from checkpoint: ${session.connections_synced}/${session.total_connections}`);
      this.apiCallsUsed = session.api_calls_used;
    }

    this.sessionId = session.id;

    // Get current API usage
    const todayUsage = await db.getTodayApiCallCount();
    this.apiCallsUsed = todayUsage;

    return session;
  }

  /**
   * Main sync orchestrator
   */
  async run(userSub) {
    console.log('🚀 Starting intelligent sync engine...');

    const session = await this.initialize(userSub);
    const user = await db.getUser(userSub);

    if (!user || !user.access_token) {
      throw new Error('No access token found');
    }

    try {
      // STEP 1: Sync recent posts (lightweight)
      await this.syncRecentPosts(user);

      // STEP 2: Mark AI-relevant connections
      await this.markAIRelevantConnections(userSub);

      // STEP 3: Build/update sync queue with priorities
      await this.buildSyncQueue(userSub);

      // STEP 4: Process queue until API limit
      await this.processQueue(user);

      // STEP 5: Calculate insights
      await this.calculateInsights(userSub);

      // Mark session as completed
      await db.updateSyncSession(this.sessionId, {
        status: 'completed',
        completed_at: Date.now() / 1000,
        api_calls_used: this.apiCallsUsed
      });

      console.log('✅ Sync completed successfully');

      return {
        success: true,
        apiCallsUsed: this.apiCallsUsed,
        remaining: this.usableLimit - this.apiCallsUsed
      };

    } catch (error) {
      // Save checkpoint and pause
      await db.updateSyncSession(this.sessionId, {
        status: 'paused',
        paused_at: Date.now() / 1000,
        api_calls_used: this.apiCallsUsed,
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Check if we can afford API calls
   */
  canAfford(calls) {
    return (this.apiCallsUsed + calls) <= this.usableLimit;
  }

  /**
   * Track API call usage
   */
  async consumeAPI(calls, endpoint = 'sync') {
    this.apiCallsUsed += calls;
    await db.trackApiCall(endpoint, 'GET', 200);

    console.log(`📊 API Budget: ${this.apiCallsUsed}/${this.usableLimit} (${Math.round(this.apiCallsUsed/this.usableLimit*100)}%)`);

    // Update session
    await db.updateSyncSession(this.sessionId, {
      api_calls_used: this.apiCallsUsed
    });
  }

  /**
   * STEP 1: Sync recent posts (1-3 API calls)
   */
  async syncRecentPosts(user) {
    if (!this.canAfford(1)) {
      console.log('⚠️  Insufficient budget for post sync, skipping');
      return;
    }

    console.log('📝 Syncing recent posts...');

    try {
      const response = await axios.get('https://api.linkedin.com/rest/posts', {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'LinkedIn-Version': '202405',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          author: `urn:li:person:${user.sub}`,
          q: 'author',
          count: 10,
          sortBy: 'LAST_MODIFIED'
        }
      });

      await this.consumeAPI(1, '/rest/posts');

      const posts = response.data.elements || [];

      for (const post of posts) {
        await db.saveTrackedPost({
          post_id: post.id,
          user_sub: user.sub,
          post_text: post.commentary || '',
          posted_at: post.created?.time || Date.now() / 1000,
          sync_priority: this.calculatePostPriority(post)
        });
      }

      console.log(`✅ Saved ${posts.length} recent posts`);

    } catch (error) {
      console.error('❌ Failed to sync posts:', error.message);
    }
  }

  /**
   * Calculate post sync priority (recent = higher)
   */
  calculatePostPriority(post) {
    const ageInDays = (Date.now() / 1000 - (post.created?.time || 0)) / 86400;

    if (ageInDays < 1) return 100;
    if (ageInDays < 7) return 80;
    if (ageInDays < 30) return 50;
    return 20;
  }

  /**
   * STEP 2: Mark AI-relevant connections (0 API calls)
   */
  async markAIRelevantConnections(userSub) {
    console.log('🤖 Identifying AI-relevant connections...');

    const aiKeywords = [
      'ai', 'artificial intelligence', 'machine learning', 'ml',
      'llm', 'large language', 'gpt', 'rag',
      'agentic', 'ai agent', 'automation',
      'data scien', 'nlp', 'deep learning', 'neural',
      'chatbot', 'generative', 'transformer',
      'embeddings', 'vector', 'semantic'
    ];

    const marked = await db.markAIRelevantByKeywords(userSub, aiKeywords);

    console.log(`✅ Marked ${marked} AI-relevant connections`);
  }

  /**
   * STEP 3: Build sync queue with intelligent prioritization
   */
  async buildSyncQueue(userSub) {
    console.log('📋 Building sync queue...');

    // Get all connections
    const connections = await db.getAllConnections(userSub, 10000);

    console.log(`Found ${connections.length} total connections`);

    // Calculate priority for each
    for (const conn of connections) {
      const priority = await this.calculateConnectionPriority(conn);

      // Add to queue if not already processed
      await db.addToSyncQueue({
        connection_id: conn.id,
        priority: priority,
        status: 'pending'
      });
    }

    await db.updateSyncSession(this.sessionId, {
      total_connections: connections.length
    });

    console.log(`✅ Queue built with ${connections.length} connections`);
  }

  /**
   * Calculate connection sync priority
   */
  async calculateConnectionPriority(connection) {
    let score = 0;

    // AI-relevant connections = highest priority
    const summary = await db.getEngagementSummary(connection.id);
    if (summary?.ai_relevant) {
      score += 50;
    }

    // Recent connections
    const connectedDaysAgo = (Date.now() / 1000 - (new Date(connection.connected_on).getTime() / 1000)) / 86400;
    if (connectedDaysAgo < 7) score += 30;
    else if (connectedDaysAgo < 30) score += 20;
    else if (connectedDaysAgo < 90) score += 10;

    // Has engagement history = higher priority
    if (summary?.total_engagements > 0) {
      score += 20;
    }

    // Recently active
    if (summary?.status === 'active') {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * STEP 4: Process queue in batches
   */
  async processQueue(user) {
    console.log('⚙️  Processing sync queue...');

    let processed = 0;
    let hasMore = true;

    while (hasMore && this.canAfford(5)) {
      // Get next batch from queue (highest priority first)
      const batch = await db.getNextSyncBatch(this.batchSize);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch of ${batch.length} connections...`);

      for (const item of batch) {
        if (!this.canAfford(2)) {
          console.log('⚠️  API limit reached, pausing sync');
          hasMore = false;
          break;
        }

        try {
          await this.syncConnectionEngagement(user, item.connection_id);

          await db.updateQueueItem(item.id, {
            status: 'completed',
            updated_at: Date.now() / 1000
          });

          processed++;

        } catch (error) {
          console.error(`Failed to sync connection ${item.connection_id}:`, error.message);

          await db.updateQueueItem(item.id, {
            status: 'failed',
            attempts: item.attempts + 1,
            error_message: error.message,
            next_retry: (Date.now() / 1000) + 3600, // Retry in 1 hour
            updated_at: Date.now() / 1000
          });
        }
      }
    }

    await db.updateSyncSession(this.sessionId, {
      connections_synced: processed
    });

    console.log(`✅ Processed ${processed} connections`);
  }

  /**
   * Sync engagement for a single connection
   * Uses engagement from YOUR recent posts
   */
  async syncConnectionEngagement(user, connectionId) {
    // Get recent posts that might have engagement
    const posts = await db.getTrackedPosts(user.sub, 5); // Last 5 posts

    for (const post of posts) {
      if (!this.canAfford(1)) break;

      // Get engagement for this post
      const engagement = await this.fetchPostEngagement(user.access_token, post.post_id);

      await this.consumeAPI(1, '/rest/socialActions');

      // Save engagement events for this connection
      await this.processEngagementForConnection(connectionId, post.post_id, engagement);
    }

    // Update engagement summary for this connection
    await db.updateEngagementSummary(connectionId);
  }

  /**
   * Fetch engagement for a post
   */
  async fetchPostEngagement(accessToken, postId) {
    try {
      const response = await axios.get('https://api.linkedin.com/rest/socialActions', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': '202405',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        params: {
          q: 'entity',
          entity: postId,
          count: 100
        }
      });

      return response.data.elements || [];

    } catch (error) {
      console.error(`Failed to fetch engagement for post ${postId}:`, error.message);
      return [];
    }
  }

  /**
   * Process engagement events for specific connection
   */
  async processEngagementForConnection(connectionId, postId, engagementData) {
    const connection = await db.getConnectionById(connectionId);
    if (!connection) return;

    // Match engagement by LinkedIn URN or URL
    for (const event of engagementData) {
      const actorUrn = event.actor;

      // Check if this engagement is from our connection
      // (This requires matching LinkedIn URN - we'll need to enhance connection data)
      const isMatch = await db.isEngagementFromConnection(actorUrn, connectionId);

      if (isMatch) {
        await db.saveEngagementEvent({
          connection_id: connectionId,
          post_id: postId,
          event_type: event.reactionType ? 'like' : 'comment',
          event_data: JSON.stringify(event),
          happened_at: event.created?.time || Date.now() / 1000
        });
      }
    }
  }

  /**
   * STEP 5: Calculate insights from engagement data
   */
  async calculateInsights(userSub) {
    console.log('💡 Calculating network insights...');

    const today = new Date().toISOString().split('T')[0];

    // Get AI-relevant active connections
    const topEngagers = await db.getTopEngagers(userSub, 10, true); // AI-relevant only

    // Get rising stars (accelerating engagement)
    const risingStars = await db.getRisingStars(userSub, 5, true);

    // Get at-risk connections
    const atRisk = await db.getAtRiskConnections(userSub, 5, true);

    // Save insights
    await db.saveInsight(userSub, today, 'top_engagers', topEngagers);
    await db.saveInsight(userSub, today, 'rising_stars', risingStars);
    await db.saveInsight(userSub, today, 'at_risk', atRisk);

    console.log(`✅ Generated insights: ${topEngagers.length} top engagers, ${risingStars.length} rising stars`);
  }
}

module.exports = SyncEngine;
