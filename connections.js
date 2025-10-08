const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parse/sync');
const db = require('./database');

const DATA_DIR = path.join(__dirname, 'data');

/**
 * Detect CSV delimiter and structure
 */
function detectCSVFormat(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }

  const header = lines[0];

  // Detect delimiter (comma, semicolon, tab)
  const delimiters = [',', ';', '\t'];
  let detectedDelimiter = ',';
  let maxColumns = 0;

  for (const delimiter of delimiters) {
    const columnCount = header.split(delimiter).length;
    if (columnCount > maxColumns) {
      maxColumns = columnCount;
      detectedDelimiter = delimiter;
    }
  }

  return {
    delimiter: detectedDelimiter,
    columnCount: maxColumns,
    header: header,
    sampleRow: lines[1]
  };
}

/**
 * Parse LinkedIn Connections CSV
 * Supports multiple LinkedIn export formats:
 * - Standard: First Name, Last Name, Email Address, Company, Position, Connected On
 * - Extended: May include URL, Location, etc.
 */
async function parseConnectionsCSV(csvContent) {
  try {
    // LinkedIn exports often start with a "Notes:" section - skip it
    let cleanedContent = csvContent;
    const lines = csvContent.split('\n');

    // Find the actual header row (contains "First Name" or "first name")
    const headerIndex = lines.findIndex(line =>
      line.toLowerCase().includes('first name') ||
      line.toLowerCase().includes('firstname')
    );

    if (headerIndex !== -1 && headerIndex > 0) {
      // Skip everything before the actual header
      cleanedContent = lines.slice(headerIndex).join('\n');
      console.log(`Skipped ${headerIndex} introductory lines to find header`);
    }

    // Detect CSV format first
    const format = detectCSVFormat(cleanedContent);
    console.log(`Detected CSV format: ${format.columnCount} columns, delimiter: "${format.delimiter}"`);

    // Parse with detected delimiter and flexible options
    const records = csv.parse(cleanedContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Allow variable column counts
      skip_records_with_empty_values: false,
      bom: true, // Handle BOM (Byte Order Mark) if present
      delimiter: format.delimiter,
      quote: '"',
      escape: '"'
    });

    if (records.length === 0) {
      throw new Error('CSV file is empty or has no valid records');
    }

    // Log first record to help debug
    if (records.length > 0) {
      console.log('Sample record columns:', Object.keys(records[0]));
    }

    // Map records to our schema, handling various column name variations
    const connections = records.map((record, index) => {
      // LinkedIn uses different column names in different regions/formats
      const firstName = record['First Name'] || record['FirstName'] || record['first name'] || '';
      const lastName = record['Last Name'] || record['LastName'] || record['last name'] || '';
      const email = record['Email Address'] || record['Email'] || record['email'] || record['E-mail Address'] || '';
      const company = record['Company'] || record['company'] || record['Current Company'] || '';
      const position = record['Position'] || record['position'] || record['Job Title'] || record['Title'] || '';
      const connectedOn = record['Connected On'] || record['Connected'] || record['connected on'] || '';
      const linkedinUrl = record['URL'] || record['url'] || record['LinkedIn URL'] || record['Profile URL'] || '';
      const location = record['Location'] || record['location'] || record['Country'] || record['country'] || '';

      // Debug: Log first few records to see what we're getting
      if (index < 3) {
        console.log(`Row ${index}: firstName="${firstName}", lastName="${lastName}"`);
      }

      // Validate at least name exists (email is often missing in LinkedIn exports)
      if (!firstName && !lastName) {
        if (index < 5) {
          console.warn(`Skipping row ${index + 2}: Missing first and last name. Record keys:`, Object.keys(record));
        }
        return null;
      }

      return {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        company: company.trim(),
        position: position.trim(),
        connectedOn: connectedOn.trim(),
        linkedinUrl: linkedinUrl.trim(),
        location: location.trim()
      };
    }).filter(conn => conn !== null); // Remove null entries

    if (connections.length === 0) {
      throw new Error('No valid connections found in CSV. Please check the file format.');
    }

    return connections;
  } catch (error) {
    // Provide more helpful error message
    if (error.message.includes('Invalid Record Length')) {
      throw new Error(`CSV format error: The file appears to have inconsistent columns. Please ensure you're uploading the LinkedIn Connections export file. Details: ${error.message}`);
    }
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
 * Search connections by name, company, position, or location
 */
async function searchConnections(userId, query, category = 'all', limit = 100) {
  return await db.searchConnections(userId, query, category, limit);
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
