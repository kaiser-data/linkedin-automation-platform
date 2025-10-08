-- Migration 003: Add location/country field to connections

ALTER TABLE connections ADD COLUMN location TEXT;

CREATE INDEX IF NOT EXISTS idx_connections_location ON connections(location);
