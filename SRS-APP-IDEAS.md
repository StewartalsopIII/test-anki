# SRS App Ideas

Extracted from Anki cards tagged with "SRS app" - these are all the changes I want to make to Anki for my own thing.

---

## Algorithm & Scheduling

### Binary Review System
Instead of 4 buttons, just "right" or "wrong". If wrong, goes to future based on FSRS algorithm.

### 3-Option Alternative
- Repeat
- Future - sooner
- Future - later

### Signal-Based Scheduling
Move from time-based to signal-based repetition. Consider:
- **Context** - What other tasks/projects is this related to?
- **Urgency** - How time-sensitive?
- **Energy Level** - Does this require high mental energy?
- **Location** - Is this location-dependent?
- **Completion Signals** - Base on real-world triggers, not arbitrary intervals

### Smart Scheduling Features
- **Take days off** - Skip Sunday, redistribute cards to other days
- **Reschedule all** - If nothing done (meditation retreat, vacation), push everything forward
- **Deadline-aware** - Tell AI "done by X date" and let it decide reminder frequency
- **Repeat options** - Weekly, daily, custom intervals
- **Balance retrieval vs review** - Currently too review-heavy

### Adaptive Learning
Use ML to:
- Learn actual review patterns
- Identify consistently postponed items
- Recognize productive times of day for different task types
- Adjust spacing based on completion patterns, not just review intervals

---

## UI/UX

### Wheel Selector
Replace the 4 buttons with a wheel popup. Cycle through 10-30 day intervals. Option for "random" which uses the algorithm.

### Auto-Categorization
Just write the task, LLM assigns to correct deck automatically. Respects user-defined categories.

### Fewer Clicks
Simplify delete and deck change operations.
- Reference: https://www.loom.com/share/d521d1ad861d4768858338db1f4c2eb1

### Consistent Text Formatting
LLM reformats all cards the same way regardless of source. Make it nice on the eyes.

### Context Switching
Address the issue when two tasks are connected.
- Reference: https://www.loom.com/share/d9e3314456b149f0b882a1b723cd4fca

---

## Knowledge & Data

### Embedding Deduplication
Each query gets embedded and checked against whether it already exists before adding.

### Knowledge Graph
- Bi-directional linking between tasks, events, and reference materials
- Auto-surface relevant materials when viewing related tasks
- Convert completed tasks into reference materials
- Visualize connections between elements

### Entity Relationships
CRM-like tagging for people. Stable relationships between entities across decks.

### Link Cards Together
Auto and manual linking for related entities. See what you were studying when you made a new card (like the Timing app did).

### Private LLM
Feed it only with your own data - books, notes, journals, aspirations. Query it for answers based solely on your information.
- Reference: https://x.com/JonhernandezIA/status/1969054219647803765

### LLM Processing
Have LLM create tags for each note. Do a lot of processing on intake.

---

## Media & Files

### All File Types Supported
Native audio and video playback within the app.

### Every Card = Link
Turn into private internet. Every piece of internet touched becomes a link. Cache copy of every website. Consider linkding for link management.

### Incremental Reading
Small amounts with "read more" and automatic loading. Track to build data profiles on atoms of knowledge.

---

## Integrations

### Calendar Visualization
Incorporate visualization for planning on calendar.
- Reference: https://x.com/gonzaloorsi/status/1909630895684042871

### Time Tracking (like Timely)
Auto-track time per card. Get fine-grained unit economics:
- **Direct costs** - Time on billable task cards
- **Indirect costs** - Time on support tasks (email, invoicing, learning)
- **Tag, don't categorize** - Each task gets multiple weighted tags (70% client-work, 30% skill-building)
- **Vector embeddings** - Encode tasks in high-dimensional space, cluster later
- Reference: https://claude.ai/chat/be56023a-93ba-4f03-b5bb-8244e4e5c166

### Voice Conversation
Talk to agent before morning review. Gives context on the day to smartly arrange tasks.

### Blockchain Oracles
Auto-find relevant dates from the web for time-sensitive cards.

---

## Learning & Scoring

### Learning Score
Combination of:
- Self human grade
- Machine graded assessment

Build a score for how well you've learned each piece of atomic knowledge.

---

## Calendar + Task Integration

A unified system should:
- Merge time-based scheduling with task management
- Allow tasks to appear both on calendar and in spaced repetition
- Enable transformation of calendar events into reference materials
- Implement "time blocking" that respects both hard appointments and flexible tasks

---

## Technical Considerations

### Database Syncing Challenge
The biggest challenge in real-time database syncing is **handling concurrent changes** across multiple devices:
- **Concurrency & Conflict Resolution** - When devices update same record, decide which wins or how to merge
- **Offline Support** - Reconcile offline edits with online data
- **Latency & Performance** - Minimal delay as user base grows

### Separate Default from Tasks
Based on whether reading time is above or below 2 minutes. Test how long each card takes to read.

---

## Resources & References

### Lessons Learned Doc
From first attempt at building task manager for high importance/urgent deck:
https://www.dropbox.com/scl/fi/g5na3nvmlts1wz78mezhy/LESSONS_LEARNED.md?rlkey=12ibcpw8qmh4p2javi0vvkgrn&dl=0

### anki-llm GitHub
https://github.com/raine/anki-llm

### Claude Analysis - Full PRD
https://claude.ai/share/a13b6f3f-da97-423c-a9b1-b14a49a8b2bc

### Jessica Talisman Transcript
Take transcript and ask Claude how to adapt Anki open source to it.

---

## My Preferences (Implemented)

This section tracks decisions made while building the custom app.

### Review System
- **3-button system**: Repeat / Soon (1 day) / Later (7 days)
- **Complete action**: Separate button to mark tasks as done (removes from review entirely)

### Urgent/Blocking Mode
- **Blocking deck**: "High importance or urgence tasks" must be cleared before seeing other cards
- **Deck-based task detection**: Certain decks are task decks, others are knowledge decks

### Due Date & Ordering
- **Only show due cards**: Cards only appear when due date is today or earlier
- **Overdue handling**: Mixed with today - treat all overdue as equally urgent, interleave randomly (no oldest-first or newest-first priority)

### Embeddings & Vector Search
- **Embedding model**: BGE-M3 via DeepInfra API
- **Vector store**: Chroma (Docker on port 8100)
- **Features implemented**:
  - Semantic search (search by meaning, not just keywords)
  - Related cards (shows similar cards when viewing a card)
  - Deduplication API (checks for similar cards before adding)
- **7,794 cards embedded** out of 8,669 total

---

## Deck Priority & Workflow System

### The Core Problem
Anki's algorithm is designed for memory retention, not task management. Having 340+ cards due per day is overwhelming when tasks have different importance levels. Need an intelligent prioritization system.

### Deck Categories

#### 1. BLOCKING - Must Complete Daily
- **High importance or urgence tasks** - Absolutely must do every day. Blocks all other cards until cleared.

#### 2. TASK DECKS - Secondary Priority (in order)
These are task-oriented decks, shown after blocking deck is cleared:
1. Coding and Hardware (tasks)
2. Languages (Typing)
3. Movement (tasks)
4. Non-urgent promises for other people

#### 3. STUDY/KNOWLEDGE DECKS - Lowest Priority
Everything else is for learning/studying:
- Languages, Math, Coding (non-task), Business, AI whisperers, Quotes, etc.

#### 4. SPECIAL: Inbox/Note-Taking
- **Unorganized and miscellaneous tasks** - This is the NOTE-TAKING inbox
  - Capture notes quickly here
  - Later: review → process → distribute to appropriate decks
  - Not for direct task execution

### Context Considerations
- **Morning with free time** = Best for deep focus, tackle important tasks
- **Energy level** matters for different task types
- **Text content** may indicate urgency (deadlines, people waiting, etc.)
- **Embeddings/LLM** could potentially detect urgency from content

### Current Limitation
- No tagging system for priority levels yet
- Potential to build priority tagging into new system
- Could use LLM to analyze card content and suggest priority

### Open Question
What's the ideal daily review strategy?
- Fixed cap (e.g., max 30 cards/day)?
- Time-based (e.g., 20 minutes worth)?
- Category quotas (all tasks, limited study)?
- LLM-selected (AI picks most important)?

---

## Next Steps: AI-Powered Card Curation

### Overview
Replace "show all due cards" with intelligent curation that selects which cards to show based on user context, deck priorities, and modern scheduling.

### Components to Build

#### 1. FSRS Scheduler (ts-fsrs)
Replace Anki's SM-2 algorithm with FSRS (Free Spaced Repetition Scheduler).

- **Package**: `ts-fsrs` npm package
- **File**: `src/lib/fsrs.ts`
- **Map 3-button system to FSRS ratings**:
  - Repeat → `Rating.Again`
  - Soon → `Rating.Hard`
  - Later → `Rating.Good`
- **Key parameters**:
  - `request_retention: 0.85` (85% target retention)
  - `maximum_interval: 180` (max 6 months)
  - `enable_fuzz: true` (randomness to prevent clustering)

#### 2. OpenRouter LLM Integration
Claude 3.5 Sonnet via OpenRouter for intelligent card ranking.

- **File**: `src/lib/openrouter.ts`
- **Purpose**: Analyze card content for urgency signals (deadlines, people waiting)
- **Input**: Top 50 candidate cards + user context
- **Output**: Ranked card IDs by importance

#### 3. Morning Quick Form UI
Fast context collection (30 seconds) before daily review.

- **File**: `src/app/curate/page.tsx`
- **Inputs**:
  - Energy level: Low / Medium / High
  - Time available: 15 / 30 / 45 / 60+ minutes
  - Focus area: Optional deck preference
- **Output**: "15 cards selected for your 30-minute session"

#### 4. Curation API
Combines all signals to select optimal card set.

- **File**: `src/app/api/curate/route.ts`
- **Endpoint**: `POST /api/curate`
- **Algorithm**:
  1. Get all due cards
  2. Enforce deck priority (blocking → tasks → study)
  3. Calculate FSRS urgency scores
  4. Send top candidates to LLM for ranking
  5. Return curated set based on available time

### Database Addition
Track FSRS state per card:
```sql
CREATE TABLE fsrs_state (
  card_id INTEGER PRIMARY KEY,
  stability REAL,
  difficulty REAL,
  reps INTEGER,
  lapses INTEGER,
  last_review TEXT,
  state INTEGER
);
```

### Environment Variables Needed
```
OPENROUTER_API_KEY=<key>
```

### User Flow
1. Open `/curate` in the morning
2. Fill quick form (30 seconds)
3. Click "Curate My Day"
4. See: "15 cards selected for your 30-minute session"
5. Click "Start Review"
6. Review only curated cards with FSRS scheduling
