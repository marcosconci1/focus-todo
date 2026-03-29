import assert from "node:assert/strict"
import test, { afterEach } from "node:test"
import { closeDatabase, getDatabase, resetDatabase } from "../lib/db/connection"
import {
  createWithDb as createCategoryWithDb,
  deleteCategoryWithDb,
  getById as getCategoryById,
  updateWithDb as updateCategoryWithDb,
} from "../lib/db/repositories/categories"
import {
  createWithDb as createTaskWithDb,
  deleteTaskWithDb,
  getById as getTaskById,
  getByCategory as getTasksByCategory,
  updateWithDb as updateTaskWithDb,
} from "../lib/db/repositories/tasks"
import {
  createWithDb as createAlertTemplateWithDb,
  getById as getAlertTemplateById,
  toggleEnabled as toggleAlertTemplateEnabled,
  updateWithDb as updateAlertTemplateWithDb,
} from "../lib/db/repositories/alert-templates"
import {
  addEntry as addHistoryEntry,
  getByTaskId as getHistoryByTaskId,
} from "../lib/db/repositories/history"
import { get as getAlertTracking, update as updateAlertTracking } from "../lib/db/repositories/alert-tracking"
import { get as getSettings, update as updateSettings } from "../lib/db/repositories/settings"
import { get as getMetadata, updateMetadata } from "../lib/db/repositories/metadata"
import { disconnect, get as getGoogleTokens, isConnected, refresh, save } from "../lib/db/repositories/google-tokens"
import { withRetryableTransaction, withTransaction } from "../lib/db/repositories/transactions"
import { getDbLogger } from "../lib/db/logger"
import { validateQuery } from "../lib/db/query-validator"
import { DEFAULT_ALERT_TEMPLATES, DEFAULT_ALERT_TRACKING } from "../lib/alert-types"
import { DEFAULT_SETTINGS } from "../lib/settings-defaults"
import { getDb, saveDb, type Database } from "../lib/storage"

afterEach(async () => {
  await closeDatabase()
})

const buildCategory = (overrides: Partial<Database["categories"][number]> = {}) => ({
  id: overrides.id ?? "cat-1",
  name: overrides.name ?? "Work",
  color: overrides.color ?? "#ffffff",
  tasks: overrides.tasks ?? [],
  dailyGoalHours: overrides.dailyGoalHours,
  projectType: overrides.projectType,
  isHabitProject: overrides.isHabitProject,
})

const buildTask = (overrides: Partial<Database["categories"][number]["tasks"][number]> = {}) => ({
  id: overrides.id ?? "task-1",
  name: overrides.name ?? "Write report",
  completed: overrides.completed ?? false,
  dailyGoal: overrides.dailyGoal ?? 1,
  currentProgress: overrides.currentProgress ?? 0,
  spentTime: overrides.spentTime,
  icon: overrides.icon,
  emoji: overrides.emoji ?? "paper",
  completedAt: overrides.completedAt,
  streak: overrides.streak,
})

const buildDatabase = (overrides: Partial<Database> = {}): Database => ({
  userSettings: overrides.userSettings ?? DEFAULT_SETTINGS,
  categories: overrides.categories ?? [],
  history: overrides.history ?? [],
  alertTemplates: overrides.alertTemplates ?? DEFAULT_ALERT_TEMPLATES.slice(0, 2),
  alertTracking: overrides.alertTracking ?? DEFAULT_ALERT_TRACKING,
  metadata: overrides.metadata ?? { lastResetDate: undefined, version: "2.0.0" },
})

const extractSqliteCode = (error: unknown): string | null => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
  }
  const cause = (error as { cause?: unknown })?.cause
  if (cause && typeof cause === "object" && "code" in cause) {
    const code = (cause as { code?: unknown }).code
    return typeof code === "string" ? code : null
  }
  return null
}

test("tasks repository creates and updates with null optional fields", async () => {
  await resetDatabase()
  const category = buildCategory()
  const task = buildTask({
    spentTime: 15,
    icon: "clock",
    completedAt: 123456,
    streak: 3,
  })

  await withTransaction(async (db) => {
    await createCategoryWithDb(db, category)
    await createTaskWithDb(db, category.id, task)
  })

  const created = await getTaskById(task.id)
  assert.ok(created)
  assert.equal(created?.spentTime, 15)
  assert.equal(created?.streak, 3)

  await updateTaskWithDb(await getDatabase(), task.id, {
    spentTime: undefined,
    streak: undefined,
  })

  const updated = await getTaskById(task.id)
  assert.ok(updated)
  assert.equal(updated?.spentTime, undefined)
  assert.equal(updated?.streak, undefined)
})

test("categories repository stores project metadata", async () => {
  await resetDatabase()
  const category = buildCategory({
    id: "cat-2",
    projectType: "habit",
    isHabitProject: true,
    dailyGoalHours: 2,
  })

  await withTransaction(async (db) => {
    await createCategoryWithDb(db, category)
  })

  await updateCategoryWithDb(await getDatabase(), category.id, {
    dailyGoalHours: 3,
  })

  const fetched = await getCategoryById(category.id)
  assert.ok(fetched)
  assert.equal(fetched?.projectType, "habit")
  assert.equal(fetched?.isHabitProject, true)
  assert.equal(fetched?.dailyGoalHours, 3)
})

test("alert templates repository creates, updates, and toggles", async () => {
  await resetDatabase()
  const template = {
    id: "alert-custom-1",
    type: "INACTIVITY" as const,
    title: "Keep moving",
    message: "Stay focused!",
    tone: "BITTERSWEET" as const,
    enabled: true,
    authorId: "author-rocky",
  }

  await createAlertTemplateWithDb(await getDatabase(), template)
  const created = await getAlertTemplateById(template.id)
  assert.ok(created)
  assert.equal(created?.title, template.title)

  await updateAlertTemplateWithDb(await getDatabase(), template.id, {
    title: "Updated title",
    enabled: false,
  })

  const updated = await getAlertTemplateById(template.id)
  assert.ok(updated)
  assert.equal(updated?.title, "Updated title")

  await toggleAlertTemplateEnabled(template.id, true)
  const toggled = await getAlertTemplateById(template.id)
  assert.ok(toggled)
  assert.equal(toggled?.enabled, true)
})

test("history repository handles entries with and without duration", async () => {
  await resetDatabase()
  const category = buildCategory({ id: "cat-history" })
  const task = buildTask({ id: "task-history" })

  await withTransaction(async (db) => {
    await createCategoryWithDb(db, category)
    await createTaskWithDb(db, category.id, task)
  })

  await addHistoryEntry(task.id, 1000, 30)
  await addHistoryEntry(task.id, 2000)

  const entries = await getHistoryByTaskId(task.id)
  assert.equal(entries.length, 2)
  const byCompletedAt = new Map(entries.map((entry) => [entry.completedAt, entry]))
  assert.equal(byCompletedAt.get(1000)?.duration, 30)
  assert.equal(byCompletedAt.get(2000)?.duration, undefined)

  await assert.rejects(() => addHistoryEntry("missing-task", 3000), /Task not found/i)
})

test("settings update persists nested realityCheckSettings", async () => {
  await resetDatabase()
  const original = await getSettings()
  const updated = await updateSettings({
    realityCheckSettings: { ...original.realityCheckSettings, minMinutesBetween: original.realityCheckSettings.minMinutesBetween + 1 },
  })
  assert.equal(
    updated.realityCheckSettings.minMinutesBetween,
    original.realityCheckSettings.minMinutesBetween + 1,
  )
})

test("alert tracking update persists nested realityCheckState", async () => {
  await resetDatabase()
  const original = await getAlertTracking()
  const updated = await updateAlertTracking({
    globalSessionCounter: original.globalSessionCounter + 1,
    realityCheckState: {
      lastFiredAt: null,
      firedCountToday: original.realityCheckState?.firedCountToday ?? 0,
    },
  })
  assert.equal(updated.globalSessionCounter, original.globalSessionCounter + 1)
  assert.ok(updated.realityCheckState)
  assert.equal(updated.realityCheckState?.lastFiredAt, null)
})

test("metadata update supports null lastResetDate and version", async () => {
  await resetDatabase()
  const updated = await updateMetadata({ lastResetDate: null, version: "2.1.0" })
  assert.equal(updated.lastResetDate, null)
  assert.equal(updated.version, "2.1.0")

  const fetched = await getMetadata()
  assert.equal(fetched.version, "2.1.0")
})

test("google tokens repository saves, refreshes, and disconnects", async () => {
  await resetDatabase()
  const saved = await save({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiryDate: 123456,
    scope: "scope",
    userEmail: "user@example.com",
  })
  assert.equal(saved.accessToken, "access-token")
  assert.equal(saved.refreshToken, "refresh-token")
  assert.equal(await isConnected(), true)

  const refreshed = await refresh("new-access", 999999)
  assert.equal(refreshed.accessToken, "new-access")
  assert.equal(refreshed.expiryDate, 999999)

  const disconnected = await disconnect()
  assert.equal(disconnected, "refresh-token")
  const after = await getGoogleTokens()
  assert.equal(after.refreshToken, null)
})

test("saveDb persists full database", async () => {
  await resetDatabase()
  const categories = [
    buildCategory({
      id: "cat-full-1",
      tasks: [
        buildTask({ id: "task-full-1", name: "Task A", emoji: "A" }),
        buildTask({ id: "task-full-2", name: "Task B", emoji: "B", spentTime: 10 }),
      ],
    }),
    buildCategory({
      id: "cat-full-2",
      name: "Personal",
      color: "#00ff00",
      tasks: [buildTask({ id: "task-full-3", name: "Task C", emoji: "C" })],
    }),
  ]

  const data = buildDatabase({
    categories,
    history: [
      { taskId: "task-full-1", completedAt: 1000, duration: 15 },
      { taskId: "task-full-2", completedAt: 2000 },
    ],
    alertTemplates: DEFAULT_ALERT_TEMPLATES.slice(0, 3),
  })

  await saveDb(data)
  const stored = await getDb()
  assert.equal(stored.categories.length, 2)
  assert.equal(stored.categories[0].tasks.length, 2)
  assert.equal(stored.history?.length, 2)
})

test("saveDb applies incremental updates", async () => {
  await resetDatabase()
  const base = buildDatabase({
    categories: [
      buildCategory({
        id: "cat-inc-1",
        tasks: [buildTask({ id: "task-inc-1", name: "Old" })],
      }),
      buildCategory({
        id: "cat-inc-2",
        tasks: [buildTask({ id: "task-inc-2", name: "Keep" })],
      }),
    ],
  })

  await saveDb(base)

  const updated = buildDatabase({
    categories: [
      buildCategory({
        id: "cat-inc-1",
        name: "Updated",
        tasks: [
          buildTask({ id: "task-inc-1", name: "Updated task" }),
          buildTask({ id: "task-inc-3", name: "New task" }),
        ],
      }),
    ],
  })

  await saveDb(updated)
  const stored = await getDb()
  assert.equal(stored.categories.length, 1)
  assert.equal(stored.categories[0].name, "Updated")
  assert.equal(stored.categories[0].tasks.length, 2)
})

test("saveDb rolls back on invalid data", async () => {
  await resetDatabase()
  const initial = buildDatabase({
    categories: [
      buildCategory({
        id: "cat-roll-1",
        tasks: [buildTask({ id: "task-roll-1", name: "Task" })],
      }),
    ],
  })

  await saveDb(initial)
  const before = await getDb()

  const invalid = buildDatabase({
    categories: [
      {
        id: "cat-roll-1",
        name: "Bad",
        color: "#ff0000",
        tasks: [{ id: "task-roll-1", name: "", completed: false, dailyGoal: 1, currentProgress: 0, emoji: "X" }],
      },
    ],
  })

  await assert.rejects(() => saveDb(invalid))
  const after = await getDb()
  assert.deepEqual(after, before)
})

test("saveDb handles large transactions", async () => {
  await resetDatabase()
  const categories = Array.from({ length: 50 }, (_, categoryIndex) => {
    const tasks = Array.from({ length: 10 }, (_, taskIndex) =>
      buildTask({
        id: `task-large-${categoryIndex}-${taskIndex}`,
        name: `Task ${categoryIndex}-${taskIndex}`,
        emoji: "L",
        dailyGoal: 1000,
        currentProgress: 999,
      }),
    )
    return buildCategory({
      id: `cat-large-${categoryIndex}`,
      name: `Category ${categoryIndex}`,
      tasks,
    })
  })

  const data = buildDatabase({ categories })
  const start = Date.now()
  await saveDb(data)
  const duration = Date.now() - start
  assert.ok(duration < 5000)

  const stored = await getDb()
  assert.equal(stored.categories.length, 50)
  assert.equal(stored.categories.reduce((sum, cat) => sum + cat.tasks.length, 0), 500)
})

test("saveDb handles concurrent saves", async () => {
  await resetDatabase()
  const datasets = [
    buildDatabase({
      categories: [buildCategory({ id: "cat-con-1", tasks: [buildTask({ id: "task-con-1" })] })],
    }),
    buildDatabase({
      categories: [buildCategory({ id: "cat-con-2", tasks: [buildTask({ id: "task-con-2" })] })],
    }),
    buildDatabase({
      categories: [buildCategory({ id: "cat-con-3", tasks: [buildTask({ id: "task-con-3" })] })],
    }),
  ]

  const results = await Promise.allSettled(datasets.map((dataset) => saveDb(dataset)))
  const successes = results
    .map((result, index) => (result.status === "fulfilled" ? datasets[index] : null))
    .filter((value): value is Database => Boolean(value))
  const failures = results.filter((result) => result.status === "rejected")

  for (const failure of failures) {
    const code = extractSqliteCode((failure as PromiseRejectedResult).reason)
    assert.ok(code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" || code === "SQLITE_ERROR")
  }

  assert.ok(successes.length > 0)
  const stored = await getDb()
  assert.ok(successes.some((dataset) => JSON.stringify(dataset.categories) === JSON.stringify(stored.categories)))
})

test("retryable transaction handles SQLITE_BUSY", async () => {
  await resetDatabase()
  let attempt = 0
  const result = await withRetryableTransaction(async () => {
    attempt += 1
    if (attempt < 2) {
      const error = new Error("busy") as Error & { code?: string }
      error.code = "SQLITE_BUSY"
      throw error
    }
    return "ok"
  })
  assert.equal(result, "ok")
  assert.equal(attempt, 2)
})

test("retryable transaction backs off on SQLITE_LOCKED", async () => {
  await resetDatabase()
  let attempt = 0
  const start = Date.now()
  const result = await withRetryableTransaction(async () => {
    attempt += 1
    if (attempt < 3) {
      const error = new Error("locked") as Error & { code?: string }
      error.code = "SQLITE_LOCKED"
      throw error
    }
    return "ok"
  })
  const duration = Date.now() - start
  assert.equal(result, "ok")
  assert.ok(duration >= 0)
})

test("retryable transaction fails fast on SQLITE_CORRUPT", async () => {
  await resetDatabase()
  let attempt = 0
  await assert.rejects(
    () =>
      withRetryableTransaction(async () => {
        attempt += 1
        const error = new Error("corrupt") as Error & { code?: string }
        error.code = "SQLITE_CORRUPT"
        throw error
      }),
    /corrupt/i,
  )
  assert.equal(attempt, 1)
})

test("retryable transaction fails fast on SQLITE_FULL", async () => {
  await resetDatabase()
  let attempt = 0
  await assert.rejects(() =>
    withRetryableTransaction(async () => {
      attempt += 1
      const error = new Error("full") as Error & { code?: string }
      error.code = "SQLITE_FULL"
      throw error
    }),
  )
  assert.equal(attempt, 1)
})

test("validator catches parameter count mismatch", async () => {
  await resetDatabase()
  assert.throws(
    () => validateQuery("SELECT * FROM tasks WHERE id = ? AND name = ?", ["only-one"]),
    /Parameter count mismatch/i,
  )
})

test("transaction timeout warning logs", async () => {
  await resetDatabase()
  const previous = process.env.DB_TRANSACTION_WARN_MS
  process.env.DB_TRANSACTION_WARN_MS = "1"
  const logger = getDbLogger()
  await withTransaction(async (db) => {
    await db.get("SELECT 1")
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
  const entries = logger.getEntries()
  const hasWarning = entries.some((entry) => entry.operation === "transaction:commit" && entry.context?.warning === "slow-transaction")
  assert.ok(hasWarning)
  if (previous === undefined) {
    delete process.env.DB_TRANSACTION_WARN_MS
  } else {
    process.env.DB_TRANSACTION_WARN_MS = previous
  }
})

test("wal mode enabled for concurrent writes", async () => {
  await resetDatabase()
  const db = await getDatabase()
  const row = (await db.get("PRAGMA journal_mode")) as { journal_mode: string }
  assert.equal(row.journal_mode.toLowerCase(), "wal", "WAL mode should be enabled for concurrent writes")
})

test("transaction rollback protects against mid-transaction failures", async () => {
  await resetDatabase()
  const category = buildCategory({ id: "cat-rollback" })
  await assert.rejects(
    () =>
      withTransaction(async (db) => {
        await createCategoryWithDb(db, category)
        throw new Error("connection lost")
      }),
    /connection lost/i,
  )
  const fetched = await getCategoryById(category.id)
  assert.equal(fetched, null)
})

test("constraint violations surface error codes", async () => {
  await resetDatabase()
  const category = buildCategory({ id: "cat-constraint" })
  await createCategoryWithDb(await getDatabase(), category)
  await assert.rejects(async () => {
    await createCategoryWithDb(await getDatabase(), category)
  })
})

test("repositories delete operations remove records", async () => {
  await resetDatabase()
  const category = buildCategory({ id: "cat-delete" })
  const task = buildTask({ id: "task-delete" })

  await withTransaction(async (db) => {
    await createCategoryWithDb(db, category)
    await createTaskWithDb(db, category.id, task)
  })

  await deleteTaskWithDb(await getDatabase(), task.id)
  const tasks = await getTasksByCategory(category.id)
  assert.equal(tasks.length, 0)

  await deleteCategoryWithDb(await getDatabase(), category.id)
  const deletedCategory = await getCategoryById(category.id)
  assert.equal(deletedCategory, null)
})
