#!/usr/bin/env node

/**
 * Database Migration Runner
 * Usage: node migrate.js
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'linkedin_automation.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const db = new sqlite3.Database(DB_PATH);

// Track migrations
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
});

async function runMigrations() {
  return new Promise((resolve, reject) => {
    // Get applied migrations
    db.all('SELECT version FROM schema_migrations', async (err, appliedMigrations) => {
      if (err) {
        reject(err);
        return;
      }

      const applied = new Set(appliedMigrations.map(m => m.version));

      // Get migration files
      const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

      console.log(`Found ${files.length} migration files`);
      console.log(`Already applied: ${applied.size}`);

      let newMigrations = 0;

      for (const file of files) {
        const version = file.replace('.sql', '');

        if (applied.has(version)) {
          console.log(`⏭️  Skipping ${version} (already applied)`);
          continue;
        }

        console.log(`🔄 Running migration: ${version}`);

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

        try {
          await runMigration(sql, version);
          newMigrations++;
          console.log(`✅ Applied ${version}`);
        } catch (error) {
          console.error(`❌ Failed to apply ${version}:`, error);
          reject(error);
          return;
        }
      }

      console.log(`\n✅ Migrations complete! Applied ${newMigrations} new migrations.`);
      resolve(newMigrations);
    });
  });
}

function runMigration(sql, version) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Record migration
      db.run('INSERT INTO schema_migrations (version) VALUES (?)', [version], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// Run migrations
runMigrations()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    db.close();
    process.exit(1);
  });
