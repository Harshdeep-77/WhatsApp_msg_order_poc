const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DB_PATH || './data/app.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_sid TEXT UNIQUE,
    phone       TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    body        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages (phone, created_at);
`);

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO messages (message_sid, phone, direction, body)
   VALUES (@message_sid, @phone, @direction, @body)`
);

// Returns true if inserted, false if the message_sid already existed (duplicate delivery).
function saveMessage({ message_sid = null, phone, direction, body }) {
  return insertStmt.run({ message_sid, phone, direction, body }).changes > 0;
}

function listMessages(limit = 50) {
  return db
    .prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?')
    .all(limit);
}

module.exports = { db, saveMessage, listMessages };
