import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import type { HistoryRow } from "@/lib/db/types"
import type { HistoryEntry } from "@/lib/types"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const HISTORY_COLUMNS =
  "id, task_id, completed_at, start_time, duration, overtime_duration, calendar_event_id, created_at"

export interface HistoryEntryWithDetails extends HistoryEntry {
  taskName: string
  categoryId: string
  categoryName: string
}

interface HistoryWithDetailsRow {
  id: number
  task_id: string
  completed_at: number
  start_time: number | null
  duration: number | null
  overtime_duration: number | null
  calendar_event_id: string | null
  task_name: string
  category_id: string
  category_name: string
}

function assertId(id: string, context: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${context} requires a valid id.`)
  }
}

async function assertTaskExistsWithDb(db: Database, taskId: string): Promise<void> {
  const row = (await db.get("SELECT 1 AS found FROM tasks WHERE id = ?", [taskId])) as
    | { found: number }
    | undefined
  if (!row) {
    throw new Error("Task not found.")
  }
}

function mapHistoryRow(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    completedAt: row.completed_at,
    startTime: row.start_time ?? undefined,
    duration: row.duration ?? undefined,
    overtimeDuration: row.overtime_duration ?? undefined,
    calendarEventId: row.calendar_event_id ?? undefined,
  }
}

export async function addEntry(
  taskId: string,
  completedAt: number,
  duration?: number,
  overtimeDuration?: number,
  startTime?: number,
  calendarEventId?: string,
): Promise<void> {
  return withDbContext("history.addEntry", async () => {
    assertId(taskId, "addEntry")
    const db = await getDatabase()

    await addEntryWithDb(db, taskId, completedAt, duration, overtimeDuration, startTime, calendarEventId)
  })
}

export async function addEntryWithDb(
  db: Database,
  taskId: string,
  completedAt: number,
  duration?: number,
  overtimeDuration?: number,
  startTime?: number,
  calendarEventId?: string,
): Promise<void> {
  return withDbContext("history.addEntryWithDb", async () => {
    assertId(taskId, "addEntry")

    try {
      await assertTaskExistsWithDb(db, taskId)
      await db.run(
        "INSERT INTO history (task_id, completed_at, duration, overtime_duration, start_time, calendar_event_id) VALUES (?, ?, ?, ?, ?, ?)",
        [taskId, completedAt, duration ?? null, overtimeDuration ?? null, startTime ?? null, calendarEventId ?? null],
      )
    } catch (error) {
      throw wrapDbError("Failed to add history entry.", error)
    }
  })
}

export async function getByTaskId(taskId: string): Promise<HistoryEntry[]> {
  return withDbContext("history.getByTaskId", async () => {
    assertId(taskId, "getByTaskId")
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT ${HISTORY_COLUMNS} FROM history WHERE task_id = ? ORDER BY completed_at DESC`,
        [taskId],
      )) as HistoryRow[]
      return rows.map((row) => mapHistoryRow(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch history for task.", error)
    }
  })
}

export async function getByDateRange(
  startDate: number,
  endDate: number,
): Promise<HistoryEntryWithDetails[]> {
  return withDbContext("history.getByDateRange", async () => {
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT h.id,
                  h.task_id,
                  h.completed_at,
                  h.start_time,
                  h.duration,
                  h.overtime_duration,
                  h.calendar_event_id,
                  t.name AS task_name,
                  t.category_id AS category_id,
                  c.name AS category_name
           FROM history h
           JOIN tasks t ON h.task_id = t.id
           JOIN categories c ON t.category_id = c.id
           WHERE h.completed_at BETWEEN ? AND ?
           ORDER BY h.completed_at DESC`,
        [startDate, endDate],
      )) as HistoryWithDetailsRow[]

      return rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        taskName: row.task_name,
        categoryId: row.category_id,
        categoryName: row.category_name,
        completedAt: row.completed_at,
        startTime: row.start_time ?? undefined,
        duration: row.duration ?? undefined,
        overtimeDuration: row.overtime_duration ?? undefined,
        calendarEventId: row.calendar_event_id ?? undefined,
      }))
    } catch (error) {
      throw wrapDbError("Failed to fetch history for date range.", error)
    }
  })
}

export async function getAll(): Promise<HistoryEntry[]> {
  return withDbContext("history.getAll", async () => {
    const db = await getDatabase()

    return getAllWithDb(db)
  })
}

export async function getAllWithDb(db: Database): Promise<HistoryEntry[]> {
  return withDbContext("history.getAllWithDb", async () => {
    try {
      const rows = (await db.all(
        `SELECT ${HISTORY_COLUMNS} FROM history ORDER BY completed_at DESC`,
      )) as HistoryRow[]
      return rows.map((row) => mapHistoryRow(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch history entries.", error)
    }
  })
}

export async function deleteByTaskId(taskId: string): Promise<void> {
  return withDbContext("history.deleteByTaskId", async () => {
    assertId(taskId, "deleteByTaskId")
    const db = await getDatabase()

    await deleteByTaskIdWithDb(db, taskId)
  })
}

export async function deleteByTaskIdWithDb(db: Database, taskId: string): Promise<void> {
  return withDbContext("history.deleteByTaskIdWithDb", async () => {
    assertId(taskId, "deleteByTaskId")

    try {
      await db.run("DELETE FROM history WHERE task_id = ?", [taskId])
    } catch (error) {
      throw wrapDbError("Failed to delete history entries.", error)
    }
  })
}

export async function getRecentSessions(limit: number): Promise<HistoryEntry[]> {
  return withDbContext("history.getRecentSessions", async () => {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("getRecentSessions requires a positive integer limit.")
    }
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT ${HISTORY_COLUMNS} FROM history ORDER BY completed_at DESC LIMIT ?`,
        [limit],
      )) as HistoryRow[]
      return rows.map((row) => mapHistoryRow(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch recent sessions.", error)
    }
  })
}
