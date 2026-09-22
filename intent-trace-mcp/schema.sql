PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'close')),
  event_time INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_app_events_time
ON app_events(event_time);

CREATE TABLE IF NOT EXISTS intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_text TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'cancelled')),
  resolved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_intents_status
ON intents(status);

CREATE TABLE IF NOT EXISTS intent_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id INTEGER NOT NULL,
  summary TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);

-- Tracks which monitored app is currently considered active.
-- This avoids stale iOS "close" automations closing the wrong app after a fast switch.
CREATE TABLE IF NOT EXISTS device_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_app TEXT,
  active_since INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO device_state (id, active_app, active_since)
VALUES (1, NULL, NULL);
