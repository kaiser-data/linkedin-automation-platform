-- Migration 001: Engagement Tracking System for 5000+ Connections
-- Designed for scalability and progressive sync with API limits

-- ========== CORE ENGAGEMENT TABLES ==========

-- Simple engagement events (millions of rows)
CREATE TABLE IF NOT EXISTS engagement_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER,
  post_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'like', 'comment', 'share'
  event_data TEXT, -- JSON for comment text, etc.
  happened_at INTEGER NOT NULL,
  synced_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (connection_id) REFERENCES connections(id)
);

-- Aggregated engagement summary (one row per connection)
CREATE TABLE IF NOT EXISTS engagement_summary (
  connection_id INTEGER PRIMARY KEY,
  first_engagement INTEGER,
  last_engagement INTEGER,
  total_engagements INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  last_7_days INTEGER DEFAULT 0,
  last_30_days INTEGER DEFAULT 0,
  status TEXT DEFAULT 'unknown', -- 'active', 'quiet', 'cold', 'unknown'
  ai_relevant BOOLEAN DEFAULT 0,
  priority_score REAL DEFAULT 0,
  last_calculated INTEGER,
  FOREIGN KEY (connection_id) REFERENCES connections(id)
);

-- ========== SYNC QUEUE SYSTEM ==========

-- Track which connections need syncing (queue-based)
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER UNIQUE,
  priority INTEGER DEFAULT 50, -- 0-100, higher = more important
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  last_attempt INTEGER,
  next_retry INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (connection_id) REFERENCES connections(id)
);

-- Track sync sessions (for resumability)
CREATE TABLE IF NOT EXISTS sync_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date DATE UNIQUE,
  status TEXT DEFAULT 'running', -- 'running', 'paused', 'completed', 'failed'
  total_connections INTEGER DEFAULT 0,
  connections_synced INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  api_calls_limit INTEGER DEFAULT 500,
  started_at INTEGER,
  paused_at INTEGER,
  completed_at INTEGER,
  resume_from_id INTEGER, -- Resume from this connection_id
  error_message TEXT
);

-- Daily sync checkpoints (for multi-day sync of large datasets)
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  checkpoint_type TEXT, -- 'posts', 'engagement', 'profiles'
  last_processed_id TEXT, -- Last post_id or connection_id processed
  records_processed INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (session_id) REFERENCES sync_sessions(id)
);

-- ========== UNKNOWN ENGAGERS (People not in your connections) ==========

CREATE TABLE IF NOT EXISTS unknown_engagers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linkedin_urn TEXT UNIQUE,
  name TEXT,
  headline TEXT,
  profile_url TEXT,
  total_engagements INTEGER DEFAULT 1,
  ai_relevant BOOLEAN DEFAULT 0,
  first_seen INTEGER DEFAULT (strftime('%s', 'now')),
  last_seen INTEGER DEFAULT (strftime('%s', 'now')),
  suggested_import BOOLEAN DEFAULT 0
);

-- ========== POST TRACKING (Cache your posts) ==========

CREATE TABLE IF NOT EXISTS tracked_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT UNIQUE NOT NULL,
  user_sub TEXT NOT NULL,
  post_text TEXT,
  posted_at INTEGER,
  total_reactions INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_shares INTEGER DEFAULT 0,
  last_synced INTEGER,
  sync_priority INTEGER DEFAULT 50, -- Recent posts = higher priority
  FOREIGN KEY (user_sub) REFERENCES users(sub)
);

-- ========== INDEXES FOR PERFORMANCE ==========

-- Engagement events (fast lookups)
CREATE INDEX IF NOT EXISTS idx_engagement_events_connection ON engagement_events(connection_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_post ON engagement_events(post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_happened ON engagement_events(happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_events_type ON engagement_events(event_type);

-- Sync queue (priority-based processing)
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry);

-- Engagement summary (fast filtering)
CREATE INDEX IF NOT EXISTS idx_engagement_summary_status ON engagement_summary(status);
CREATE INDEX IF NOT EXISTS idx_engagement_summary_ai ON engagement_summary(ai_relevant);
CREATE INDEX IF NOT EXISTS idx_engagement_summary_priority ON engagement_summary(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_summary_last_engagement ON engagement_summary(last_engagement DESC);

-- Unknown engagers
CREATE INDEX IF NOT EXISTS idx_unknown_engagers_urn ON unknown_engagers(linkedin_urn);
CREATE INDEX IF NOT EXISTS idx_unknown_engagers_ai ON unknown_engagers(ai_relevant);
CREATE INDEX IF NOT EXISTS idx_unknown_engagers_engagements ON unknown_engagers(total_engagements DESC);

-- Tracked posts
CREATE INDEX IF NOT EXISTS idx_tracked_posts_user ON tracked_posts(user_sub);
CREATE INDEX IF NOT EXISTS idx_tracked_posts_posted ON tracked_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_posts_priority ON tracked_posts(sync_priority DESC);

-- ========== EXTENSIBLE METADATA STORAGE ==========

-- Store arbitrary key-value data without schema changes
CREATE TABLE IF NOT EXISTS connection_metadata (
  connection_id INTEGER,
  key TEXT,
  value TEXT,
  data_type TEXT, -- 'string', 'number', 'boolean', 'json'
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (connection_id, key),
  FOREIGN KEY (connection_id) REFERENCES connections(id)
);

CREATE INDEX IF NOT EXISTS idx_connection_metadata_key ON connection_metadata(key);

-- ========== ANALYTICS & INSIGHTS CACHE ==========

-- Pre-computed insights (updated daily, fast reads)
CREATE TABLE IF NOT EXISTS network_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_sub TEXT NOT NULL,
  insight_date DATE NOT NULL,
  insight_type TEXT NOT NULL, -- 'top_engagers', 'rising_stars', 'at_risk'
  insight_data TEXT NOT NULL, -- JSON payload
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_sub, insight_date, insight_type),
  FOREIGN KEY (user_sub) REFERENCES users(sub)
);

CREATE INDEX IF NOT EXISTS idx_network_insights_date ON network_insights(user_sub, insight_date DESC);
CREATE INDEX IF NOT EXISTS idx_network_insights_type ON network_insights(insight_type);
