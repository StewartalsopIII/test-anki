# Building Apps with Anki: Developer Notes

## Overview

Anki stores all data in SQLite databases. The backup files (`.colpkg` and `.apkg`) are ZIP archives containing the database and media files. This makes it surprisingly accessible for building custom interfaces.

## File Formats

### Backup Files (.colpkg)

A `.colpkg` file is a ZIP archive containing:

```
backup-2026-01-06-12.43.20.colpkg
├── collection.anki2      # Legacy SQLite (often just a placeholder)
├── collection.anki21b    # Actual data (Zstandard compressed SQLite)
├── media                 # JSON mapping of media file numbers to names
└── meta                  # Metadata
```

### Extracting the Database

```bash
# Unzip the backup
unzip backup-2026-01-06-12.43.20.colpkg

# The .anki21b file is Zstandard compressed
zstd -d collection.anki21b -o collection.sqlite

# Now you have a standard SQLite database
sqlite3 collection.sqlite ".tables"
```

## Database Schema (Modern Anki 2.1+)

### Core Tables

| Table | Purpose |
|-------|---------|
| `notes` | The actual content (front/back fields) |
| `cards` | Card instances with scheduling data |
| `decks` | Deck names and settings |
| `notetypes` | Note type definitions (Basic, Cloze, etc.) |
| `fields` | Field definitions for each note type |
| `templates` | Card templates for each note type |
| `revlog` | Review history |
| `tags` | Tag definitions |

### Key Relationships

```
notes (content)
  ↓ one-to-many
cards (scheduling) → decks (organization)
  ↓
revlog (history)
```

### Notes Table

```sql
CREATE TABLE notes (
  id integer PRIMARY KEY,      -- Timestamp in milliseconds
  guid text NOT NULL,          -- Global unique ID (10 chars)
  mid integer NOT NULL,        -- Model/notetype ID
  mod integer NOT NULL,        -- Modification timestamp (seconds)
  usn integer NOT NULL,        -- Update sequence number
  tags text NOT NULL,          -- Space-separated tags
  flds text NOT NULL,          -- Fields separated by \x1f (unit separator)
  sfld integer NOT NULL,       -- Sort field (first field, stripped)
  csum integer NOT NULL,       -- Checksum for duplicate detection
  flags integer NOT NULL,
  data text NOT NULL
);
```

**Important**: The `flds` field contains all card content separated by the ASCII Unit Separator character (`\x1f`, character code 31):

```javascript
// Parsing fields
const fields = note.flds.split('\x1f');
const front = fields[0];  // First field (usually question)
const back = fields[1];   // Second field (usually answer)
```

### Cards Table

```sql
CREATE TABLE cards (
  id integer PRIMARY KEY,      -- Timestamp in milliseconds
  nid integer NOT NULL,        -- Note ID (foreign key)
  did integer NOT NULL,        -- Deck ID (foreign key)
  ord integer NOT NULL,        -- Card ordinal (for multi-card notes)
  mod integer NOT NULL,        -- Modification timestamp
  usn integer NOT NULL,
  type integer NOT NULL,       -- 0=new, 1=learning, 2=review, 3=relearning
  queue integer NOT NULL,      -- Queue status
  due integer NOT NULL,        -- Due date/position
  ivl integer NOT NULL,        -- Interval in days
  factor integer NOT NULL,     -- Ease factor (2500 = 250%)
  reps integer NOT NULL,       -- Total reviews
  lapses integer NOT NULL,     -- Times forgotten
  left integer NOT NULL,
  odue integer NOT NULL,
  odid integer NOT NULL,
  flags integer NOT NULL,
  data text NOT NULL
);
```

### Decks Table

```sql
CREATE TABLE decks (
  id integer PRIMARY KEY NOT NULL,
  name text NOT NULL COLLATE unicase,  -- Watch out for this!
  mtime_secs integer NOT NULL,
  usn integer NOT NULL,
  common blob NOT NULL,
  kind blob NOT NULL
);
```

## Gotchas and Solutions

### 1. Custom Collation: `unicase`

Anki uses a custom SQLite collation called `unicase` for case-insensitive sorting. Standard SQLite doesn't have this.

**Problem**:
```sql
-- This will fail with: "no such collation sequence: unicase"
SELECT * FROM decks ORDER BY name;
```

**Solution**: Use `LOWER()` instead:
```sql
SELECT id, name FROM decks ORDER BY LOWER(name);
```

### 2. HTML Content in Fields

Card content is stored as HTML, not plain text:

```html
<div>What is the capital of France?</div>
```

When displaying, either:
- Render as HTML (be careful of XSS if user-editable)
- Strip HTML for plain text: `text.replace(/<[^>]*>/g, '')`

### 3. ID Generation

Anki uses timestamps in milliseconds as IDs:

```javascript
const newId = Date.now();  // Works for new cards/notes
```

### 4. GUID Generation

Notes require a 10-character GUID:

```javascript
function generateGuid() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

### 5. Update Sequence Number (USN)

Set `usn = -1` for local changes. Anki will update this during sync.

### 6. Media Files

The `media` file in the backup is a JSON mapping:
```json
{"0": "image.png", "1": "audio.mp3"}
```

Media is referenced in fields as:
```html
<img src="image.png">
```

## Useful Queries

### Get all cards with their content and deck names

```sql
SELECT
  c.id,
  c.reps,
  c.lapses,
  n.flds,
  n.tags,
  d.name as deck_name
FROM cards c
JOIN notes n ON c.nid = n.id
JOIN decks d ON c.did = d.id
ORDER BY c.id;
```

### Search cards by content

```sql
SELECT * FROM notes
WHERE flds LIKE '%search term%';
```

### Get cards due today

```sql
SELECT * FROM cards
WHERE type = 2 AND queue = 2 AND due <= strftime('%s', 'now') / 86400;
```

### Count cards per deck

```sql
SELECT d.name, COUNT(c.id) as card_count
FROM decks d
LEFT JOIN cards c ON c.did = d.id
GROUP BY d.id
ORDER BY card_count DESC;
```

## Building a Web Interface

### Recommended Stack

- **Next.js** - React framework with API routes
- **better-sqlite3** - Fast, synchronous SQLite for Node.js
- **Tailwind CSS** - Rapid UI development

### Basic API Structure

```
/api/decks     GET         - List all decks
/api/cards     GET         - List cards (with ?deckId= or ?q= filters)
/api/cards     POST        - Create card
/api/cards     DELETE      - Delete card (?id=)
/api/cards     PATCH       - Move card to deck
/api/notes     GET         - Get note (?id=)
/api/notes     PUT         - Update note content
```

### Key Considerations

1. **Always work on a copy** - Don't modify your live Anki database
2. **Backup before testing** - SQLite changes are immediate
3. **Watch for sync conflicts** - If you modify the database while Anki is syncing, you may corrupt data
4. **Consider read-only first** - Build viewing functionality before editing

## Resources

- [Anki Source Code](https://github.com/ankitects/anki) - The official repo (Rust/Python/TypeScript)
- [Anki Database Structure](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure) - AnkiDroid wiki has good documentation
- [AnkiConnect](https://foosoft.net/projects/anki-connect/) - Add-on for real-time API access to running Anki

## What's Next?

Ideas for extending your Anki app:

- **Spaced repetition review** - Implement the SM-2 algorithm
- **Import/Export** - Support `.apkg` deck packages
- **Media handling** - Serve images and audio from the media folder
- **Statistics dashboard** - Visualize review history
- **Bulk editing** - Tag management, deck reorganization
- **AI-powered features** - Auto-generate cards from text, suggest edits
