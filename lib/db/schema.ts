export const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    daily_goal_hours REAL,
    project_type TEXT CHECK(project_type IN ('project', 'habit', 'work')),
    is_habit_project INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    daily_goal INTEGER DEFAULT 0,
    current_progress INTEGER DEFAULT 0,
    spent_time INTEGER DEFAULT 0,
    icon TEXT,
    emoji TEXT DEFAULT '📝',
    completed_at INTEGER,
    streak INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_at INTEGER NOT NULL,
    start_time INTEGER,
    duration INTEGER,
    overtime_duration INTEGER,
    calendar_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS alert_templates (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('INACTIVITY', 'HABITS_ENDING_DAY', 'END_OF_DAY_COUNTDOWN', 'REALITY_CHECKS', 'BREAK_REMINDER', 'ELAPSED_TIME')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    tone TEXT DEFAULT 'BITTERSWEET',
    enabled INTEGER DEFAULT 1,
    author_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS alert_tracking (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS metadata (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_reset_date TEXT,
    overtime_session_state TEXT,
    pending_calendar_updates TEXT,
    version TEXT DEFAULT '2.0.0',
    created_at TEXT DEFAULT (datetime('now')),
    initialized_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expiry_date INTEGER,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    user_email TEXT,
    connected_at TEXT DEFAULT (datetime('now')),
    last_refreshed TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS scream_mode_insults (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    punchline TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
]

export const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)",
  "CREATE INDEX IF NOT EXISTS idx_history_task_id ON history(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_history_completed_at ON history(completed_at)",
  "CREATE INDEX IF NOT EXISTS idx_alert_templates_type ON alert_templates(type)",
  "CREATE INDEX IF NOT EXISTS idx_alert_templates_author_id ON alert_templates(author_id)",
  "CREATE INDEX IF NOT EXISTS idx_scream_mode_insults_enabled ON scream_mode_insults(enabled)",
]

export const CREATE_TRIGGERS_SQL = [
  `CREATE TRIGGER IF NOT EXISTS categories_set_updated_at
  AFTER UPDATE ON categories
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS tasks_set_updated_at
  AFTER UPDATE ON tasks
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS settings_set_updated_at
  AFTER UPDATE ON settings
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE settings SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS alert_templates_set_updated_at
  AFTER UPDATE ON alert_templates
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE alert_templates SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS alert_tracking_set_updated_at
  AFTER UPDATE ON alert_tracking
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE alert_tracking SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS metadata_set_updated_at
  AFTER UPDATE ON metadata
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE metadata SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS google_calendar_tokens_set_updated_at
  AFTER UPDATE ON google_calendar_tokens
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE google_calendar_tokens SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS scream_mode_insults_set_updated_at
  AFTER UPDATE ON scream_mode_insults
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE scream_mode_insults SET updated_at = datetime('now') WHERE id = NEW.id;
  END`,
]
