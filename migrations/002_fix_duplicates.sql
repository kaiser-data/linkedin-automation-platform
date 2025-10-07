-- Migration 002: Fix duplicate connections and add unique constraint

-- Step 1: Create a new table with unique constraint
CREATE TABLE IF NOT EXISTS connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_sub TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  company TEXT,
  position TEXT,
  connected_on TEXT,
  linkedin_profile_url TEXT,
  profile_fetched INTEGER DEFAULT 0,
  profile_data TEXT,
  last_fetched_at INTEGER,
  tags TEXT,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_sub) REFERENCES users(sub),
  UNIQUE(user_sub, linkedin_profile_url, first_name, last_name)
);

-- Step 2: Copy unique connections (keeping the oldest by id for each duplicate set)
INSERT INTO connections_new (
  id, user_sub, first_name, last_name, email, company, position,
  connected_on, linkedin_profile_url, profile_fetched, profile_data,
  last_fetched_at, tags, notes, created_at, updated_at
)
SELECT
  MIN(id) as id,
  user_sub,
  first_name,
  last_name,
  MAX(email) as email,  -- Keep non-empty email if available
  MAX(company) as company,
  MAX(position) as position,
  connected_on,
  linkedin_profile_url,
  MAX(profile_fetched) as profile_fetched,
  MAX(profile_data) as profile_data,
  MAX(last_fetched_at) as last_fetched_at,
  MAX(tags) as tags,
  MAX(notes) as notes,
  MIN(created_at) as created_at,
  MAX(updated_at) as updated_at
FROM connections
GROUP BY user_sub,
         COALESCE(linkedin_profile_url, ''),
         COALESCE(first_name, ''),
         COALESCE(last_name, '');

-- Step 3: Drop old table
DROP TABLE connections;

-- Step 4: Rename new table
ALTER TABLE connections_new RENAME TO connections;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_connections_user_sub ON connections(user_sub);
CREATE INDEX IF NOT EXISTS idx_connections_email ON connections(email);
CREATE INDEX IF NOT EXISTS idx_connections_profile_fetched ON connections(profile_fetched);
CREATE INDEX IF NOT EXISTS idx_connections_linkedin_url ON connections(linkedin_profile_url);
