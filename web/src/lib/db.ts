import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '..', 'collection.sqlite');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export interface Deck {
  id: number;
  name: string;
}

export interface Note {
  id: number;
  guid: string;
  mid: number;
  mod: number;
  tags: string;
  flds: string;
  sfld: string;
}

export interface Card {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
}

export interface CardWithNote extends Card {
  note_flds: string;
  note_tags: string;
  deck_name: string;
}

export function getDecks(): Deck[] {
  const db = getDb();
  // Use LOWER() to avoid unicase collation issues
  return db.prepare('SELECT id, name FROM decks ORDER BY LOWER(name)').all() as Deck[];
}

export function getCardsByDeck(deckId: number): CardWithNote[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    WHERE c.did = ?
    ORDER BY c.id
  `).all(deckId) as CardWithNote[];
}

export function getAllCards(): CardWithNote[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    ORDER BY c.id
  `).all() as CardWithNote[];
}

export function searchCards(query: string): CardWithNote[] {
  const db = getDb();
  const searchTerm = `%${query}%`;
  return db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    WHERE n.flds LIKE ? OR n.tags LIKE ? OR d.name LIKE ?
    ORDER BY c.id
  `).all(searchTerm, searchTerm, searchTerm) as CardWithNote[];
}

export function getNote(noteId: number): Note | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as Note | undefined;
}

export function updateNote(noteId: number, flds: string, tags: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE notes SET flds = ?, tags = ?, mod = ? WHERE id = ?').run(flds, tags, now, noteId);
}

export function createNote(mid: number, flds: string, tags: string): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const guid = generateGuid();
  const sfld = flds.split('\x1f')[0].replace(/<[^>]*>/g, '').substring(0, 60);
  const csum = checksumFirstField(sfld);

  const result = db.prepare(`
    INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
    VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')
  `).run(now * 1000, guid, mid, now, tags, flds, sfld, csum);

  return Number(result.lastInsertRowid);
}

export function createCard(noteId: number, deckId: number): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
    VALUES (?, ?, ?, 0, ?, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')
  `).run(now * 1000, noteId, deckId, now);

  return Number(result.lastInsertRowid);
}

export function deleteCard(cardId: number): void {
  const db = getDb();
  const card = db.prepare('SELECT nid FROM cards WHERE id = ?').get(cardId) as { nid: number } | undefined;
  if (card) {
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
    // Check if note has other cards
    const otherCards = db.prepare('SELECT COUNT(*) as count FROM cards WHERE nid = ?').get(card.nid) as { count: number };
    if (otherCards.count === 0) {
      db.prepare('DELETE FROM notes WHERE id = ?').run(card.nid);
    }
  }
}

export function moveCardToDeck(cardId: number, deckId: number): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE cards SET did = ?, mod = ? WHERE id = ?').run(deckId, now, cardId);
}

export function getNoteTypes() {
  const db = getDb();
  return db.prepare('SELECT id, name FROM notetypes').all();
}

function generateGuid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function checksumFirstField(field: string): number {
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    const char = field.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Task management review functions
export const URGENT_DECK_ID = 1740140533109; // "High importance or urgence tasks"

// Get collection creation timestamp (Unix seconds)
export function getCollectionCreation(): number {
  const db = getDb();
  const col = db.prepare('SELECT crt FROM col').get() as { crt: number } | undefined;
  return col?.crt || Math.floor(Date.now() / 1000);
}

// Get today as days since collection creation (for review card due dates)
export function getTodayDayNumber(): number {
  const crt = getCollectionCreation();
  const now = Math.floor(Date.now() / 1000);
  return Math.floor((now - crt) / 86400);
}

// Get today as days since Unix epoch (for scheduling)
export function getTodayAsDays(): number {
  return Math.floor(Date.now() / 1000 / 86400);
}

// Shuffle array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Get cards due for review with blocking logic
// Only returns cards that are actually due (today or earlier)
export function getReviewQueue(includeNonUrgent: boolean = false): CardWithNote[] {
  const db = getDb();
  const todayDayNum = getTodayDayNumber();
  const nowTimestamp = Math.floor(Date.now() / 1000);

  // Cards are due if:
  // - Review cards (type=2, queue=2): due <= todayDayNum (due is days since collection creation)
  // - Learning cards (queue=1 or 3): due <= nowTimestamp (due is Unix timestamp)
  // - New cards (queue=0): always available (we'll limit these separately if needed)

  // First check if there are urgent cards due TODAY OR EARLIER
  const urgentCards = db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    WHERE c.did = ?
      AND c.queue >= 0
      AND (
        (c.queue = 2 AND c.due <= ?) OR
        (c.queue IN (1, 3) AND c.due <= ?) OR
        (c.queue = 0)
      )
  `).all(URGENT_DECK_ID, todayDayNum, nowTimestamp) as CardWithNote[];

  // Shuffle urgent cards (overdue mixed with today)
  const shuffledUrgent = shuffleArray(urgentCards);

  // If there are urgent cards, return only those (blocking mode)
  if (shuffledUrgent.length > 0 && !includeNonUrgent) {
    return shuffledUrgent;
  }

  // Otherwise, return all cards due for review
  const allDueCards = db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    WHERE c.queue >= 0
      AND (
        (c.queue = 2 AND c.due <= ?) OR
        (c.queue IN (1, 3) AND c.due <= ?) OR
        (c.queue = 0)
      )
  `).all(todayDayNum, nowTimestamp) as CardWithNote[];

  // Shuffle all due cards (overdue mixed with today)
  return shuffleArray(allDueCards);
}

// Get count of urgent cards remaining (only those due today or earlier)
export function getUrgentCount(): number {
  const db = getDb();
  const todayDayNum = getTodayDayNumber();
  const nowTimestamp = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM cards
    WHERE did = ?
      AND queue >= 0
      AND (
        (queue = 2 AND due <= ?) OR
        (queue IN (1, 3) AND due <= ?) OR
        (queue = 0)
      )
  `).get(URGENT_DECK_ID, todayDayNum, nowTimestamp) as { count: number };
  return result.count;
}

// Update card schedule after review
export type ReviewAction = 'repeat' | 'soon' | 'later' | 'complete';

export function updateCardSchedule(cardId: number, action: ReviewAction): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const todayDayNum = getTodayDayNumber(); // Days since collection creation

  switch (action) {
    case 'repeat':
      // Due now (will show up again in same session as learning card)
      // Use Unix timestamp for learning queue
      db.prepare(`
        UPDATE cards SET due = ?, ivl = 0, mod = ?, reps = reps + 1, type = 1, queue = 1 WHERE id = ?
      `).run(now, now, cardId);
      break;
    case 'soon':
      // Due tomorrow (review card)
      db.prepare(`
        UPDATE cards SET due = ?, ivl = 1, mod = ?, reps = reps + 1, type = 2, queue = 2 WHERE id = ?
      `).run(todayDayNum + 1, now, cardId);
      break;
    case 'later':
      // Due in 7 days (review card)
      db.prepare(`
        UPDATE cards SET due = ?, ivl = 7, mod = ?, reps = reps + 1, type = 2, queue = 2 WHERE id = ?
      `).run(todayDayNum + 7, now, cardId);
      break;
    case 'complete':
      // Mark as suspended (done with this task)
      db.prepare(`
        UPDATE cards SET queue = -1, mod = ?, reps = reps + 1 WHERE id = ?
      `).run(now, cardId);
      break;
  }
}

// Get decks marked as task decks (for configuration)
export function getTaskDecks(): Deck[] {
  const db = getDb();
  // For now, return decks with "task" in name or the urgent deck
  return db.prepare(`
    SELECT id, name FROM decks
    WHERE LOWER(name) LIKE '%task%'
       OR id = ?
    ORDER BY LOWER(name)
  `).all(URGENT_DECK_ID) as Deck[];
}

// Get decks with due card counts
export function getDecksWithDueCounts(): Array<{ id: number; name: string; dueCount: number }> {
  const db = getDb();
  const todayDayNum = getTodayDayNumber();
  const nowTimestamp = Math.floor(Date.now() / 1000);

  return db.prepare(`
    SELECT
      d.id,
      d.name,
      COUNT(c.id) as dueCount
    FROM decks d
    LEFT JOIN cards c ON c.did = d.id
      AND c.queue >= 0
      AND (
        (c.queue = 2 AND c.due <= ?) OR
        (c.queue IN (1, 3) AND c.due <= ?) OR
        (c.queue = 0)
      )
    GROUP BY d.id
    HAVING dueCount > 0
    ORDER BY
      CASE WHEN d.id = ? THEN 0 ELSE 1 END,
      dueCount DESC,
      LOWER(d.name)
  `).all(todayDayNum, nowTimestamp, URGENT_DECK_ID) as Array<{ id: number; name: string; dueCount: number }>;
}

// Get review queue filtered by deck
export function getReviewQueueByDeck(deckId: number): CardWithNote[] {
  const db = getDb();
  const todayDayNum = getTodayDayNumber();
  const nowTimestamp = Math.floor(Date.now() / 1000);

  const cards = db.prepare(`
    SELECT
      c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
      n.flds as note_flds,
      n.tags as note_tags,
      d.name as deck_name
    FROM cards c
    JOIN notes n ON c.nid = n.id
    JOIN decks d ON c.did = d.id
    WHERE c.did = ?
      AND c.queue >= 0
      AND (
        (c.queue = 2 AND c.due <= ?) OR
        (c.queue IN (1, 3) AND c.due <= ?) OR
        (c.queue = 0)
      )
  `).all(deckId, todayDayNum, nowTimestamp) as CardWithNote[];

  return shuffleArray(cards);
}
