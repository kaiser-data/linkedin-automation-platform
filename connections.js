const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parse/sync');
const db = require('./database');

const DATA_DIR = path.join(__dirname, 'data');

/**
 * Parse LinkedIn Connections CSV
 * Expected format from LinkedIn export:
 * First Name, Last Name, Email Address, Company, Position, Connected On
 */
async function parseConnectionsCSV(csvContent) {
  try {
    const records = csv.parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const connections = records.map(record => ({
      firstName: record['First Name'] || '',
      lastName: record['Last Name'] || '',
      email: record['Email Address'] || '',
      company: record['Company'] || '',
      position: record['Position'] || '',
      connectedOn: record['Connected On'] || ''
    }));

    return connections;
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

/**
 * Import connections from CSV file
 */
async function importConnectionsFromFile(filePath, userId) {
  try {
    const csvContent = await fs.readFile(filePath, 'utf-8');
    const connections = await parseConnectionsCSV(csvContent);

    // Import to database
    const imported = await db.importConnections(userId, connections);

    return {
      total: connections.length,
      imported: imported.successful,
      skipped: imported.skipped,
      errors: imported.errors
    };
  } catch (error) {
    throw new Error(`Import failed: ${error.message}`);
  }
}

/**
 * Save uploaded CSV to data directory
 */
async function saveUploadedCSV(fileBuffer, userId) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const timestamp = Date.now();
  const filename = `connections_${userId}_${timestamp}.csv`;
  const filepath = path.join(DATA_DIR, filename);

  await fs.writeFile(filepath, fileBuffer);

  return filepath;
}

/**
 * Get connection statistics for user
 */
async function getConnectionStats(userId) {
  return await db.getConnectionStats(userId);
}

/**
 * Search connections by name, company, or position
 */
async function searchConnections(userId, query) {
  return await db.searchConnections(userId, query);
}

/**
 * Get connections without profile data (need manual fetch)
 */
async function getConnectionsNeedingData(userId, limit = 50) {
  return await db.getConnectionsWithoutProfileData(userId, limit);
}

module.exports = {
  parseConnectionsCSV,
  importConnectionsFromFile,
  saveUploadedCSV,
  getConnectionStats,
  searchConnections,
  getConnectionsNeedingData
};
