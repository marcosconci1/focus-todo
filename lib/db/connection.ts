import "server-only"

import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { Database } from "sqlite-async"
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, CREATE_TRIGGERS_SQL } from "@/lib/db/schema"
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults"
import {
  DEFAULT_ADRIAN_AUTHOR,
  DEFAULT_ALERT_TEMPLATES,
  DEFAULT_ALERT_TRACKING,
  DEFAULT_ROCKY_AUTHOR,
} from "@/lib/alert-types"
import { classifySqliteError, logDbError } from "@/lib/db/errors"
import { getDbLogger } from "@/lib/db/logger"
import { instrumentDatabase } from "@/lib/db/instrumentation"

let database: Database | null = null
let openingPromise: Promise<Database> | null = null
let connectionErrorCount = 0
let lastConnectionError: Error | null = null
let connectionHealthy = true
let openConnections = 0
const DATABASE_VERSION = "2.0.0"
let schemaValidatedAt: number | null = null
let schemaValidationPromise: Promise<void> | null = null
const SCHEMA_CACHE_TTL_MS = 60_000
const REQUIRED_TABLES = [
  "categories",
  "tasks",
  "history",
  "settings",
  "alert_templates",
  "alert_tracking",
  "metadata",
  "google_calendar_tokens",
  "scream_mode_insults",
]
const DEBUG_DB_INIT = process.env.DEBUG_DB_INIT === "true"

function debugDbInitLog(message: string, details?: Record<string, unknown>): void {
  if (!DEBUG_DB_INIT) return
  const logger = getDbLogger()
  logger.logConnection("opened", {
    message,
    timestamp: new Date().toISOString(),
    ...(details ?? {}),
  })
}

function getFreshDatabaseState(dbPath: string): {
  exists: boolean
  sizeBytes: number
  isFresh: boolean
  mtimeMs: number | null
} {
  const exists = fs.existsSync(dbPath)
  if (!exists) {
    return { exists: false, sizeBytes: 0, isFresh: false, mtimeMs: null }
  }
  const stats = fs.statSync(dbPath)
  const mtimeMs = stats.mtimeMs
  const isFresh = Date.now() - mtimeMs <= 5_000
  return {
    exists: true,
    sizeBytes: stats.size,
    isFresh,
    mtimeMs,
  }
}

function resolveDatabasePath(): string {
  const logger = getDbLogger()
  const dbPath =
    process.env.NODE_ENV === "production"
      ? path.join(os.homedir(), ".focus-todo", "focus-todo.db")
      : path.join(process.cwd(), "public", "data", "focus-todo.db")
  const dbDir = path.dirname(dbPath)

  fs.mkdirSync(dbDir, { recursive: true })
  try {
    fs.accessSync(dbDir, fs.constants.W_OK)
  } catch (error) {
    logger.logError("resolveDatabasePath.permissions", error, {
      message: "Database directory is not writable",
      dbDir,
      dbPath,
      timestamp: new Date().toISOString(),
    })
    throw new Error(`Database directory is not writable: ${dbDir}`)
  }

  if (process.env.NODE_ENV === "production") {
    return dbPath
  }

  return dbPath
}

async function backupBeforeSchemaInit(): Promise<void> {
  try {
    const dbPath = resolveDatabasePath()
    if (!fs.existsSync(dbPath)) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${dbPath}.backup-${timestamp}.db`
    await fs.promises.copyFile(dbPath, backupPath)
  } catch (error) {
    logDbError("backupBeforeSchemaInit", error)
  }
}

async function configureDatabase(db: Database): Promise<void> {
  try {
    await db.run("PRAGMA journal_mode = WAL")
  } catch (error) {
    console.warn("Failed to enable WAL mode. Falling back to DELETE mode.")
    await db.run("PRAGMA journal_mode = DELETE")
  }
  await db.run("PRAGMA foreign_keys = ON")
  await db.run("PRAGMA busy_timeout = 10000")
  await db.run("PRAGMA wal_autocheckpoint = 1000")
}

async function openDatabase(): Promise<Database> {
  if (database) {
    return database
  }
  if (openingPromise) {
    return openingPromise
  }

  const dbPath = resolveDatabasePath()
  const logger = getDbLogger()
  debugDbInitLog("openDatabase: resolved database file path", { dbPath })

  if (fs.existsSync(dbPath)) {
    const fileStats = fs.statSync(dbPath)
    debugDbInitLog("openDatabase: existing database file detected", {
      dbPath,
      sizeBytes: fileStats.size,
      mtime: fileStats.mtime.toISOString(),
    })
    if (fileStats.size === 0) {
      fs.unlinkSync(dbPath)
      debugDbInitLog("openDatabase: deleted 0-byte database file", { dbPath })
    }
  } else {
    debugDbInitLog("openDatabase: database file does not exist yet", { dbPath })
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  openingPromise = (async () => {
    let attempt = 0
    const maxAttempts = 3
    try {
      while (attempt < maxAttempts) {
        try {
          const opened = await Database.open(dbPath)
          await configureDatabase(opened)
          database = opened
          openConnections += 1
          connectionHealthy = true
          logger.logConnection("opened", { dbPath, timestamp: new Date().toISOString() })
          return opened
        } catch (error) {
          attempt += 1
          connectionErrorCount += 1
          lastConnectionError = error instanceof Error ? error : new Error(String(error))
          connectionHealthy = false
          logDbError("openDatabase", error, { attempt, dbPath })
          const classification = classifySqliteError(error)
          if (!classification.retryable || attempt >= maxAttempts) {
            logger.logConnection("error", {
              dbPath,
              attempt,
              code: classification.code,
            })
            throw new Error("Database connection failed.")
          }
          const backoff = 200 * Math.pow(2, attempt - 1) + Math.random() * 200
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      }
      throw new Error("Database connection failed.")
    } finally {
      openingPromise = null
    }
  })()
  return openingPromise
}

function isForceDbResetEnabled(): boolean {
  return process.env.FORCE_DB_RESET === "true"
}

async function hasAllRequiredTables(db: Database): Promise<boolean> {
  const placeholders = REQUIRED_TABLES.map(() => "?").join(", ")
  const rows = (await db.all(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
    REQUIRED_TABLES,
  )) as Array<{ name: string }>
  return rows.length === REQUIRED_TABLES.length
}

async function getMissingRequiredTables(db: Database): Promise<string[]> {
  const placeholders = REQUIRED_TABLES.map(() => "?").join(", ")
  const rows = (await db.all(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
    REQUIRED_TABLES,
  )) as Array<{ name: string }>
  const existing = new Set(rows.map((row) => row.name))
  return REQUIRED_TABLES.filter((table) => !existing.has(table))
}

async function tableExists(db: Database, tableName: string): Promise<boolean> {
  const row = (await db.get("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1", [
    tableName,
  ])) as { found?: number } | undefined
  return Number(row?.found ?? 0) === 1
}

async function tableHasRows(db: Database, tableName: string): Promise<boolean> {
  if (!(await tableExists(db, tableName))) {
    return false
  }
  const escapedTable = tableName.replace(/"/g, '""')
  const row = (await db.get(`SELECT EXISTS(SELECT 1 FROM "${escapedTable}" LIMIT 1) AS has_rows`)) as
    | { has_rows?: number }
    | undefined
  return Number(row?.has_rows ?? 0) === 1
}

async function hasUserData(db: Database): Promise<boolean> {
  if (await tableHasRows(db, "categories")) return true
  if (await tableHasRows(db, "tasks")) return true
  if (await tableHasRows(db, "history")) return true
  return false
}

async function getDatabaseVersion(db: Database): Promise<string | null> {
  if (!(await tableExists(db, "metadata"))) {
    return null
  }
  const row = (await db.get("SELECT version FROM metadata WHERE id = 1 LIMIT 1")) as { version?: unknown } | undefined
  return typeof row?.version === "string" && row.version.trim().length > 0 ? row.version : null
}

async function isDatabaseCompletelyEmpty(db: Database): Promise<boolean> {
  const row = (await db.get(
    "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )) as { table_count?: number } | undefined
  return Number(row?.table_count ?? 0) === 0
}

async function checkDatabaseInitialized(db: Database): Promise<boolean> {
  const hasTables = await hasAllRequiredTables(db)
  if (!hasTables) return false
  const version = await getDatabaseVersion(db)
  return Boolean(version)
}

async function initializeSchema(db: Database): Promise<void> {
  const logger = getDbLogger()
  const startedAt = Date.now()
  try {
    logger.logConnection("opened", {
      message: "Schema initialization started",
      timestamp: new Date().toISOString(),
    })
    if (!isForceDbResetEnabled() && (await hasUserData(db))) {
      throw new Error("Database contains user data. Set FORCE_DB_RESET=true to reset the database.")
    }
    await backupBeforeSchemaInit()
    await db.transaction(async (txDb) => {
      for (const statement of CREATE_TABLES_SQL) {
        await txDb.exec(statement)
      }
      for (const statement of CREATE_INDEXES_SQL) {
        await txDb.exec(statement)
      }
      for (const statement of CREATE_TRIGGERS_SQL) {
        await txDb.exec(statement)
      }
      await initializeDefaultData(txDb)
    })
    logger.logConnection("opened", {
      message: "Schema transaction committed successfully",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    })

    const categoriesCountRow = (await db.get("SELECT COUNT(*) AS count FROM categories")) as { count?: number } | undefined
    const categoryNamesRows = (await db.all("SELECT name FROM categories ORDER BY sort_order ASC")) as Array<{ name?: string }>
    const categoriesCount = Number(categoriesCountRow?.count ?? 0)
    const categoryNames = categoryNamesRows.map((row) => row.name).filter((name): name is string => Boolean(name))

    if (categoriesCount === 0) {
      logger.logError("initializeSchema.postVerification", new Error("Default categories were not created."), {
        categoriesCount,
      })
      throw new Error("Default categories were not created.")
    } else {
      logger.logConnection("opened", {
        message: "Post-initialization category verification succeeded",
        timestamp: new Date().toISOString(),
        categoriesCount,
        categoryNames,
      })
    }
    invalidateSchemaCache()
  } catch (error) {
    logger.logError("initializeSchema", error, {
      message: "Schema initialization failed and transaction may have rolled back",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    })
    console.error("Database schema initialization failed.", error)
    throw new Error("Database schema initialization failed.")
  }
}

async function initializeMissingTablesNonDestructive(db: Database): Promise<void> {
  try {
    await db.transaction(async (txDb) => {
      for (const statement of CREATE_TABLES_SQL) {
        await txDb.exec(statement)
      }
      for (const statement of CREATE_INDEXES_SQL) {
        await txDb.exec(statement)
      }
      for (const statement of CREATE_TRIGGERS_SQL) {
        await txDb.exec(statement)
      }
      const categoriesCountRow = (await txDb.get("SELECT COUNT(*) AS count FROM categories")) as
        | { count?: number }
        | undefined
      const categoriesCount = Number(categoriesCountRow?.count ?? 0)
      if (categoriesCount === 0) {
        await initializeDefaultData(txDb)
      }
    })
  } catch (error) {
    console.error("Non-destructive table initialization failed.", error)
    throw new Error("Non-destructive table initialization failed.")
  }
}

async function initializeDefaultData(db: Database): Promise<void> {
  const logger = getDbLogger()
  const now = new Date().toISOString()
  const settingsPayload = {
    ...DEFAULT_SETTINGS,
    authors: [DEFAULT_ROCKY_AUTHOR, DEFAULT_ADRIAN_AUTHOR],
  }

  await db.run("INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)", [
    JSON.stringify(settingsPayload),
  ])

  for (const template of DEFAULT_ALERT_TEMPLATES) {
    await db.run(
      `INSERT OR IGNORE INTO alert_templates (id, type, title, message, tone, enabled, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        template.id,
        template.type,
        template.title,
        template.message,
        template.tone,
        template.enabled ? 1 : 0,
        template.authorId,
      ],
    )
  }

  await db.run("INSERT OR IGNORE INTO alert_tracking (id, data) VALUES (1, ?)", [
    JSON.stringify(DEFAULT_ALERT_TRACKING),
  ])

  await db.run(
    "INSERT OR IGNORE INTO metadata (id, last_reset_date, version, created_at, initialized_at) VALUES (1, NULL, ?, ?, ?)",
    [DATABASE_VERSION, now, now],
  )

  await db.run(
    `INSERT OR IGNORE INTO google_calendar_tokens
       (id, access_token, refresh_token, expiry_date, token_type, scope, user_email, connected_at, last_refreshed)
       VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
  )

  const defaultCategories = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Personal",
      color: "#ef4444",
      projectType: "project",
      dailyGoalHours: null,
      sortOrder: 0,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Work",
      color: "#f97316",
      projectType: "work",
      dailyGoalHours: 8,
      sortOrder: 1,
    },
  ]

  logger.logConnection("opened", {
    message: "Creating default categories",
    timestamp: new Date().toISOString(),
    count: defaultCategories.length,
    categories: defaultCategories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      projectType: category.projectType,
    })),
  })

  const allowedProjectTypes = new Set(["project", "habit", "work"])
  const hexColorPattern = /^#[0-9a-fA-F]{6}$/

  for (const category of defaultCategories) {
    const validationErrors: string[] = []
    if (!category.name || category.name.trim().length === 0) {
      validationErrors.push("name must be a non-empty string")
    }
    if (!hexColorPattern.test(category.color)) {
      validationErrors.push("color must be a valid hex code")
    }
    if (!allowedProjectTypes.has(category.projectType)) {
      validationErrors.push("projectType must be one of 'project', 'habit', 'work'")
    }
    if (validationErrors.length > 0) {
      logger.logError("initializeDefaultData.validateCategory", new Error("Default category validation failed"), {
        category,
        validationErrors,
      })
    }

    await db.run(
      `INSERT OR IGNORE INTO categories
         (id, name, color, project_type, daily_goal_hours, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.name,
        category.color,
        category.projectType,
        category.dailyGoalHours,
        category.sortOrder,
      ],
    )

    const changeRow = (await db.get("SELECT changes() AS count")) as { count?: number } | undefined
    const insertedCount = Number(changeRow?.count ?? 0)
    logger.logConnection("opened", {
      message: `Inserted category: ${category.name}`,
      timestamp: new Date().toISOString(),
      insertedCount,
      category: {
        id: category.id,
        name: category.name,
        color: category.color,
        projectType: category.projectType,
      },
    })
  }

  const categoriesCountRow = (await db.get("SELECT COUNT(*) AS count FROM categories")) as { count?: number } | undefined
  const categoriesRows = (await db.all(
    "SELECT id, name, color, project_type FROM categories ORDER BY sort_order ASC",
  )) as Array<{ id: string; name: string; color: string; project_type: string }>
  logger.logConnection("opened", {
    message: "Default categories verification query completed",
    timestamp: new Date().toISOString(),
    categoriesCount: Number(categoriesCountRow?.count ?? 0),
    categories: categoriesRows,
  })
}

async function ensureHistoryColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "history", [
    { name: "start_time", definition: "start_time INTEGER" },
    { name: "duration", definition: "duration INTEGER" },
    { name: "overtime_duration", definition: "overtime_duration INTEGER" },
    { name: "calendar_event_id", definition: "calendar_event_id TEXT" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureMetadataColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "metadata", [
    { name: "last_reset_date", definition: "last_reset_date TEXT" },
    { name: "overtime_session_state", definition: "overtime_session_state TEXT" },
    { name: "pending_calendar_updates", definition: "pending_calendar_updates TEXT" },
    { name: "version", definition: "version TEXT DEFAULT '2.0.0'" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "initialized_at", definition: "initialized_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

/** Regex matching non-constant DEFAULT expressions that SQLite rejects in ALTER TABLE.
 *  Handles nested parens like DEFAULT (datetime('now')) by matching balanced outer parens. */
const NON_CONSTANT_DEFAULT_RE = /\s+DEFAULT\s+\((?:[^()]*|\([^()]*\))*\)/i

async function ensureTableColumns(
  db: Database,
  table: string,
  columns: Array<{ name: string; definition: string }>,
): Promise<void> {
  const escapedTable = table.replace(/"/g, '""')
  const rows = (await db.all(`PRAGMA table_info("${escapedTable}")`)) as Array<{ name: string }>
  const existing = new Set(rows.map((column) => column.name))
  const missing = columns.filter((column) => !existing.has(column.name))

  if (missing.length === 0) {
    return
  }

  // Separate columns that have non-constant defaults (e.g. datetime('now'))
  // For ALTER TABLE we strip the default and backfill with an UPDATE afterwards.
  const columnsToBackfill: Array<{ name: string; expression: string }> = []

  await db.transaction(async (txDb) => {
    for (const column of missing) {
      const match = column.definition.match(NON_CONSTANT_DEFAULT_RE)
      if (match) {
        // Strip the non-constant DEFAULT for the ALTER statement
        const safeDefinition = column.definition.replace(NON_CONSTANT_DEFAULT_RE, "")
        await txDb.exec(`ALTER TABLE "${escapedTable}" ADD COLUMN ${safeDefinition}`)
        // Extract the expression inside DEFAULT (...)
        const exprMatch = match[0].match(/DEFAULT\s+\(((?:[^()]*|\([^()]*\))*)\)/i)
        if (exprMatch) {
          columnsToBackfill.push({ name: column.name, expression: exprMatch[1] })
        } else {
          console.error(
            `ensureTableColumns: Failed to extract DEFAULT expression for column "${column.name}" in table "${escapedTable}". ` +
            `Matched DEFAULT clause "${match[0]}" but could not parse the expression. Existing rows will have NULL for this column.`,
          )
        }
      } else {
        await txDb.exec(`ALTER TABLE "${escapedTable}" ADD COLUMN ${column.definition}`)
      }
    }

    // Backfill non-constant defaults for existing rows
    for (const col of columnsToBackfill) {
      const escapedCol = col.name.replace(/"/g, '""')
      await txDb.exec(
        `UPDATE "${escapedTable}" SET "${escapedCol}" = ${col.expression} WHERE "${escapedCol}" IS NULL`,
      )
    }
  })
}

async function ensureCategoriesColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "categories", [
    { name: "daily_goal_hours", definition: "daily_goal_hours REAL" },
    { name: "project_type", definition: "project_type TEXT" },
    { name: "is_habit_project", definition: "is_habit_project INTEGER DEFAULT 0" },
    { name: "sort_order", definition: "sort_order INTEGER DEFAULT 0" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureTasksColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "tasks", [
    { name: "daily_goal", definition: "daily_goal INTEGER DEFAULT 0" },
    { name: "current_progress", definition: "current_progress INTEGER DEFAULT 0" },
    { name: "spent_time", definition: "spent_time INTEGER DEFAULT 0" },
    { name: "icon", definition: "icon TEXT" },
    { name: "emoji", definition: "emoji TEXT DEFAULT '📝'" },
    { name: "completed_at", definition: "completed_at INTEGER" },
    { name: "streak", definition: "streak INTEGER DEFAULT 0" },
    { name: "sort_order", definition: "sort_order INTEGER DEFAULT 0" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureSettingsColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "settings", [
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureAlertTemplatesColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "alert_templates", [
    { name: "tone", definition: "tone TEXT DEFAULT 'BITTERSWEET'" },
    { name: "enabled", definition: "enabled INTEGER DEFAULT 1" },
    { name: "author_id", definition: "author_id TEXT" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureAlertTrackingColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "alert_tracking", [
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureGoogleCalendarTokensColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "google_calendar_tokens", [
    { name: "access_token", definition: "access_token TEXT" },
    { name: "refresh_token", definition: "refresh_token TEXT" },
    { name: "expiry_date", definition: "expiry_date INTEGER" },
    { name: "token_type", definition: "token_type TEXT DEFAULT 'Bearer'" },
    { name: "scope", definition: "scope TEXT" },
    { name: "user_email", definition: "user_email TEXT" },
    { name: "connected_at", definition: "connected_at TEXT DEFAULT (datetime('now'))" },
    { name: "last_refreshed", definition: "last_refreshed TEXT" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

async function ensureScreamModeInsultsColumns(db: Database): Promise<void> {
  await ensureTableColumns(db, "scream_mode_insults", [
    { name: "punchline", definition: "punchline TEXT" },
    { name: "enabled", definition: "enabled INTEGER DEFAULT 1" },
    { name: "created_at", definition: "created_at TEXT DEFAULT (datetime('now'))" },
    { name: "updated_at", definition: "updated_at TEXT DEFAULT (datetime('now'))" },
  ])
}

export async function getDatabase(): Promise<Database> {
  let db = await openDatabase()
  const isValid = await validateConnection(db)
  if (!isValid) {
    await closeDatabase()
    db = await openDatabase()
    if (!(await validateConnection(db))) {
      await closeDatabase()
      throw new Error("Database connection failed validation.")
    }
  }

  // Skip schema checks if recently validated
  if (schemaValidatedAt && Date.now() - schemaValidatedAt < SCHEMA_CACHE_TTL_MS) {
    return instrumentDatabase(db)
  }

  // If another caller is already running schema validation, wait on it
  if (schemaValidationPromise) {
    await schemaValidationPromise
    return instrumentDatabase(db)
  }

  // Single-flight: only one schema validation runs at a time
  schemaValidationPromise = runSchemaValidation(db)
  try {
    await schemaValidationPromise
  } finally {
    schemaValidationPromise = null
  }

  return instrumentDatabase(db)
}

async function runSchemaValidation(db: Database): Promise<void> {
  const logger = getDbLogger()
  logger.logConnection("opened", {
    message: "Schema validation started",
    timestamp: new Date().toISOString(),
  })

  const dbPath = resolveDatabasePath()
  const freshStateAtStart = getFreshDatabaseState(dbPath)
  const tablesAtStart = (await db.all(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
  )) as Array<{ name: string; sql: string | null }>
  const tableCountsAtStart: Record<string, number> = {}
  for (const table of tablesAtStart) {
    const escapedTable = table.name.replace(/"/g, '""')
    const row = (await db.get(`SELECT COUNT(*) AS count FROM "${escapedTable}"`)) as { count?: number } | undefined
    tableCountsAtStart[table.name] = Number(row?.count ?? 0)
  }

  debugDbInitLog("runSchemaValidation: database state before initialization", {
    dbPath,
    databaseExists: freshStateAtStart.exists,
    databaseSizeBytes: freshStateAtStart.sizeBytes,
    databaseIsNew: !freshStateAtStart.exists || freshStateAtStart.isFresh,
    databaseMtimeMs: freshStateAtStart.mtimeMs,
    tables: tablesAtStart.map((table) => table.name),
    tableCounts: tableCountsAtStart,
  })

  const forceDbReset = isForceDbResetEnabled()
  const databaseInitialized = await checkDatabaseInitialized(db)
  const databaseHasUserData = await hasUserData(db)
  const hasRequiredTables = await hasAllRequiredTables(db)
  const databaseCompletelyEmpty = await isDatabaseCompletelyEmpty(db)
  const freshState = getFreshDatabaseState(dbPath)
  const isFreshDatabaseInitialization = !freshState.exists || freshState.isFresh

  if (isFreshDatabaseInitialization) {
    logger.logConnection("opened", {
      message: "FRESH DATABASE DETECTED - First initialization",
      timestamp: new Date().toISOString(),
      dbPath,
      databaseExists: freshState.exists,
      databaseSizeBytes: freshState.sizeBytes,
      databaseMtimeMs: freshState.mtimeMs,
    })
  }

  if (forceDbReset) {
    logger.logConnection("opened", {
      message: "Schema validation path selected: force reset",
      timestamp: new Date().toISOString(),
    })
    logger.logConnection("opened", {
      message: "FORCE_DB_RESET=true, resetting database",
      timestamp: new Date().toISOString(),
    })
    await initializeSchema(db)
  } else if (databaseInitialized) {
    logger.logConnection("opened", {
      message: "Schema validation path selected: already initialized",
      timestamp: new Date().toISOString(),
    })
    logger.logConnection("opened", {
      message: "Database already initialized, skipping schema creation",
      timestamp: new Date().toISOString(),
    })
  } else if (databaseHasUserData) {
    logger.logConnection("opened", {
      message: "Schema validation path selected: preserve user data",
      timestamp: new Date().toISOString(),
    })
    console.warn("Database contains user data, preserving existing data")
    logger.logConnection("opened", {
      message: "Database contains user data, preserving existing data",
      timestamp: new Date().toISOString(),
    })
    if (!hasRequiredTables) {
      const missingTables = await getMissingRequiredTables(db)
      logger.logConnection("opened", {
        message: "Missing required tables detected; creating tables non-destructively",
        timestamp: new Date().toISOString(),
        missingTables,
      })
      logger.logConnection("opened", {
        message: "Calling initializeMissingTablesNonDestructive",
        timestamp: new Date().toISOString(),
      })
      await initializeMissingTablesNonDestructive(db)
      logger.logConnection("opened", {
        message: "Missing tables created; user data preserved",
        timestamp: new Date().toISOString(),
      })
    } else {
      logger.logConnection("opened", {
        message: "All required tables present; user data preserved",
        timestamp: new Date().toISOString(),
      })
    }
  } else if (databaseCompletelyEmpty) {
    logger.logConnection("opened", {
      message: "Schema validation path selected: fresh database",
      timestamp: new Date().toISOString(),
      databaseCompletelyEmpty,
    })
    logger.logConnection("opened", {
      message: "Fresh database detected, initializing schema",
      timestamp: new Date().toISOString(),
    })
    logger.logConnection("opened", {
      message: "Calling initializeSchema for fresh database",
      timestamp: new Date().toISOString(),
    })
    await initializeSchema(db)
  } else {
    logger.logConnection("opened", {
      message: "Schema validation path selected: partial database",
      timestamp: new Date().toISOString(),
    })
    logger.logConnection("opened", {
      message: "Partial database state detected, skipping full schema creation",
      timestamp: new Date().toISOString(),
    })
  }

  if (!(await hasAllRequiredTables(db))) {
    const missingTables = await getMissingRequiredTables(db)
    logger.logConnection("opened", {
      message: "Required tables missing before column migrations; creating tables non-destructively",
      timestamp: new Date().toISOString(),
      missingTables,
    })
    logger.logConnection("opened", {
      message: "Calling initializeMissingTablesNonDestructive before column migrations",
      timestamp: new Date().toISOString(),
    })
    await initializeMissingTablesNonDestructive(db)
  }

  await ensureCategoriesColumns(db)
  await ensureTasksColumns(db)
  await ensureSettingsColumns(db)
  await ensureAlertTemplatesColumns(db)
  await ensureAlertTrackingColumns(db)
  await ensureHistoryColumns(db)
  await ensureMetadataColumns(db)
  await ensureGoogleCalendarTokensColumns(db)
  await ensureScreamModeInsultsColumns(db)

  logger.logConnection("opened", {
    message: "Post-validation category check started",
    timestamp: new Date().toISOString(),
  })
  debugDbInitLog("runSchemaValidation: querying sqlite_master for categories schema", {
    sql: "SELECT name, sql FROM sqlite_master WHERE type='table' AND name = 'categories'",
  })
  const categoriesTableSchema = (await db.all(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name = 'categories'",
  )) as Array<{ name: string; sql: string }>
  debugDbInitLog("runSchemaValidation: categories schema loaded", {
    categoriesTableSchema,
  })

  debugDbInitLog("runSchemaValidation: querying categories count before recovery", {
    sql: "SELECT COUNT(*) AS count FROM categories",
  })
  const categoriesCountRow = (await db.get("SELECT COUNT(*) AS count FROM categories")) as
    | { count?: number }
    | undefined
  const categoriesCount = Number(categoriesCountRow?.count ?? 0)
  let createdDefaultsInPostValidation = false

  if (categoriesCount === 0) {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      logger.logConnection("opened", {
        message: "Categories table is empty, creating defaults",
        timestamp: new Date().toISOString(),
        attempt,
        maxAttempts,
      })
      try {
        await db.transaction(async (txDb) => {
          debugDbInitLog("runSchemaValidation: executing default category recovery transaction", {
            attempt,
            sql: "initializeDefaultData(txDb); SELECT COUNT(*) AS count FROM categories",
          })
          await initializeDefaultData(txDb)
          const verifyInsideTxRow = (await txDb.get("SELECT COUNT(*) AS count FROM categories")) as
            | { count?: number }
            | undefined
          const verifyInsideTxCount = Number(verifyInsideTxRow?.count ?? 0)
          debugDbInitLog("runSchemaValidation: in-transaction category verification completed", {
            attempt,
            verifyInsideTxCount,
          })
          if (verifyInsideTxCount === 0) {
            const txSchema = (await txDb.all(
              "SELECT name, sql FROM sqlite_master WHERE type='table' AND name = 'categories'",
            )) as Array<{ name: string; sql: string }>
            logger.logError(
              "runSchemaValidation.postValidationCategoryCheck.transaction",
              new Error("Default category initialization failed inside transaction"),
              {
                attempt,
                verifyInsideTxCount,
                txSchema,
              },
            )
            throw new Error("Default category initialization failed inside transaction")
          }
        })
      } catch (error) {
        logger.logError("runSchemaValidation.postValidationCategoryCheck.attempt", error, {
          attempt,
          maxAttempts,
        })
      }

      const verifyCategoriesCountRow = (await db.get("SELECT COUNT(*) AS count FROM categories")) as
        | { count?: number }
        | undefined
      const verifyCategoriesCount = Number(verifyCategoriesCountRow?.count ?? 0)
      if (verifyCategoriesCount > 0) {
        logger.logConnection("opened", {
          message: "Default categories verified",
          timestamp: new Date().toISOString(),
          verifyCategoriesCount,
          attempt,
        })
        invalidateSchemaCache()
        debugDbInitLog("runSchemaValidation: schema cache invalidated after default category creation", {
          attempt,
        })
        createdDefaultsInPostValidation = true
        break
      }

      if (attempt < maxAttempts) {
        logger.logConnection("opened", {
          message: "Default categories still missing after attempt, retrying",
          timestamp: new Date().toISOString(),
          attempt,
          nextAttempt: attempt + 1,
        })
        invalidateSchemaCache()
        await new Promise((resolve) => setTimeout(resolve, 100))
      } else {
        logger.logError(
          "runSchemaValidation.postValidationCategoryCheck",
          new Error("Default category initialization failed"),
          {
            categoriesCount,
            verifyCategoriesCount,
            attempts: maxAttempts,
          },
        )
        throw new Error("Default category initialization failed: categories table remains empty.")
      }
    }
  } else {
    logger.logConnection("opened", {
      message: "Categories table has data, skipping default creation",
      timestamp: new Date().toISOString(),
      categoriesCount,
    })
  }

  if (createdDefaultsInPostValidation) {
    debugDbInitLog("runSchemaValidation: schema cache left invalidated for immediate re-verification", {
      schemaValidatedAt,
    })
    return
  }

  schemaValidatedAt = Date.now()
}

export function invalidateSchemaCache(): void {
  schemaValidatedAt = null
}

export function getSchemaCacheStatus(): {
  validatedAt: number | null
  ttlMs: number
  expiresInMs: number
  hasPendingValidation: boolean
} {
  const now = Date.now()
  const expiresInMs = schemaValidatedAt === null ? 0 : Math.max(0, SCHEMA_CACHE_TTL_MS - (now - schemaValidatedAt))
  return {
    validatedAt: schemaValidatedAt,
    ttlMs: SCHEMA_CACHE_TTL_MS,
    expiresInMs,
    hasPendingValidation: schemaValidationPromise !== null,
  }
}

export async function closeDatabase(): Promise<void> {
  if (!database) {
    return
  }

  await database.close()
  database = null
  openConnections = Math.max(0, openConnections - 1)
  getDbLogger().logConnection("closed", { timestamp: new Date().toISOString() })
}

export async function isDatabaseInitialized(): Promise<boolean> {
  const db = await openDatabase()
  return checkDatabaseInitialized(db)
}

export async function resetDatabase(): Promise<void> {
  const db = await openDatabase()

  try {
    const tables = (await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )) as Array<{ name: string }>

    for (const table of tables) {
      const escapedName = `"${table.name.replace(/"/g, '""')}"`
      await db.exec(`DROP TABLE IF EXISTS ${escapedName}`)
    }

    await initializeSchema(db)
    invalidateSchemaCache()
  } catch (error) {
    console.error("Database reset failed.", error)
    throw new Error("Database reset failed.")
  }
}

export async function validateConnection(db: Database): Promise<boolean> {
  try {
    await db.get("SELECT 1 AS ok")
    connectionHealthy = true
    return true
  } catch (error) {
    connectionErrorCount += 1
    lastConnectionError = error instanceof Error ? error : new Error(String(error))
    connectionHealthy = false
    logDbError("validateConnection", error)
    return false
  }
}

export function getConnectionHealth(): {
  isHealthy: boolean
  lastError: Error | null
  errorCount: number
  openConnections: number
} {
  return {
    isHealthy: connectionHealthy,
    lastError: lastConnectionError,
    errorCount: connectionErrorCount,
    openConnections,
  }
}
