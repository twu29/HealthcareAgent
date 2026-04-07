import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'conversations.db');

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create the messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertStmt = db.prepare(
  'INSERT INTO messages (sender, role, content) VALUES (?, ?, ?)'
);

const getRecentHistoryStmt = db.prepare(
  `SELECT role, content FROM (
    SELECT id, role, content FROM messages WHERE sender = ? ORDER BY id DESC LIMIT ?
  ) sub ORDER BY id ASC`
);

export function saveMessage(sender: string, role: string, content: string): void {
  insertStmt.run(sender, role, content);
}

export function getHistory(sender: string, limit: number = 30): { role: string; content: string }[] {
  return getRecentHistoryStmt.all(sender, limit) as { role: string; content: string }[];
}

export function closeDb(): void {
  db.close();
}
