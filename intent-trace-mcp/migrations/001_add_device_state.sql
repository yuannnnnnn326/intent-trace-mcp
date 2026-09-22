CREATE TABLE IF NOT EXISTS device_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_app TEXT,
  active_since INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO device_state (id, active_app, active_since)
VALUES (1, NULL, NULL);
