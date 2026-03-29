import assert from "node:assert/strict"
import test, { after } from "node:test"
import { DEFAULT_ALERT_TEMPLATES, DEFAULT_ALERT_TRACKING } from "../lib/alert-types"
import { closeDatabase, getDatabase, resetDatabase } from "../lib/db/connection"
import { checkAndResetDailyProjects, getDayWindowKey } from "../lib/daily-reset"
import { getDb, saveDb, type Database } from "../lib/storage"

after(async () => {
  await closeDatabase()
})

test("daily reset treats projectType habit as habit", () => {
  const categories = [
    {
      id: "habit-1",
      name: "Daily habit",
      color: "#ffffff",
      projectType: "habit" as const,
      isHabitProject: null as unknown as boolean,
      tasks: [
        {
          id: "habit-task-1",
          name: "Drink water",
          completed: true,
          dailyGoal: 1,
          currentProgress: 1,
          spentTime: 120,
          emoji: "water",
          completedAt: Date.now(),
          streak: 1,
        },
      ],
    },
  ]

  const result = checkAndResetDailyProjects(categories, "2000-01-01", "00:00")
  assert.equal(result.shouldSave, true)

  const task = result.categories[0].tasks[0]
  assert.equal(task.completed, false)
  assert.equal(task.spentTime, 0)
  assert.equal(task.completedAt, undefined)
  assert.equal(task.streak, 2)
})

test("daily reset updates metadata and resets tracking counters", () => {
  const alertTracking = {
    ...DEFAULT_ALERT_TRACKING,
    globalSessionCounter: 4,
    lastTaskCompletedAt: new Date("2024-01-01T10:00:00Z").toISOString(),
    lastBreakActivatedAt: new Date("2024-01-01T11:00:00Z").toISOString(),
    breakReminderRound: 2,
  }
  const endOfDayTime = "00:00"
  const result = checkAndResetDailyProjects([], "2000-01-01", endOfDayTime, {
    alertTracking,
    resetSessionCounterDaily: true,
  })
  assert.equal(result.shouldSave, true)

  assert.equal(result.alertTracking?.globalSessionCounter, 0)
  assert.equal(result.alertTracking?.lastTaskCompletedAt, null)
  assert.equal(result.alertTracking?.lastBreakActivatedAt, null)
  assert.equal(result.alertTracking?.breakReminderRound, 0)
})

test("alert cooldown persists across reloads", async () => {
  const lastAlertFiredAt = new Date("2024-02-02T12:34:56Z").toISOString()
  await resetDatabase()

  const payload: Database = {
    userSettings: {},
    categories: [],
    history: [],
    alertTemplates: DEFAULT_ALERT_TEMPLATES,
    alertTracking: {
      ...DEFAULT_ALERT_TRACKING,
      lastAlertFiredAt,
    },
    metadata: { lastResetDate: "2000-01-01" },
  }

  await saveDb(payload)
  await closeDatabase()

  const reloaded = await getDb()
  assert.equal(reloaded.alertTracking.lastAlertFiredAt, lastAlertFiredAt)
  await closeDatabase()
})

test("daily reset with empty projects updates metadata timestamps", async () => {
  await resetDatabase()
  const endOfDayTime = "00:00"
  const result = checkAndResetDailyProjects([], "2000-01-01", endOfDayTime, {
    alertTracking: DEFAULT_ALERT_TRACKING,
    resetSessionCounterDaily: false,
  })
  assert.equal(result.shouldSave, true)

  const nextResetDate = getDayWindowKey(new Date(), endOfDayTime)
  const payload: Database = {
    userSettings: {},
    categories: result.categories,
    history: [],
    alertTemplates: DEFAULT_ALERT_TEMPLATES,
    alertTracking: result.alertTracking ?? DEFAULT_ALERT_TRACKING,
    metadata: { lastResetDate: nextResetDate },
  }

  await saveDb(payload)

  const db = await getDatabase()
  const row = (await db.get("SELECT last_reset_date, updated_at FROM metadata WHERE id = 1")) as
    | { last_reset_date: string | null; updated_at: string | null }
    | undefined
  assert.ok(row)
  assert.equal(row.last_reset_date, nextResetDate)
  assert.ok(row.updated_at)
  const updatedAtRaw = String(row.updated_at)
  const hasTimezoneSuffix = /[zZ]|[+-]\d{2}:?\d{2}$/.test(updatedAtRaw)
  const withT = updatedAtRaw.replace(" ", "T")
  const normalizedUpdatedAt = hasTimezoneSuffix ? withT : `${withT}Z`
  const updatedAtMs = Date.parse(normalizedUpdatedAt)
  assert.ok(!Number.isNaN(updatedAtMs))
  const deltaMs = Math.abs(Date.now() - updatedAtMs)
  assert.ok(deltaMs < 10000)
})
