import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import { taskRowToTask, taskToRow } from "@/lib/db/types"
import type { TaskRow } from "@/lib/db/types"
import type { Task } from "@/lib/types"
import { withTransaction } from "@/lib/db/repositories/transactions"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

function assertId(id: string, context: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${context} requires a valid id.`)
  }
}

function assertTask(task: Task): void {
  if (!task.id || task.id.trim().length === 0) {
    throw new Error("Task id is required.")
  }
  if (!task.name || task.name.trim().length === 0) {
    throw new Error("Task name is required.")
  }
  if (!task.emoji || task.emoji.trim().length === 0) {
    throw new Error("Task emoji is required.")
  }
}

async function assertCategoryExists(db: Database, categoryId: string): Promise<void> {
  const row = (await db.get("SELECT 1 AS found FROM categories WHERE id = ?", [categoryId])) as
    | { found: number }
    | undefined
  if (!row) {
    throw new Error("Category not found.")
  }
}

export async function getByCategory(categoryId: string): Promise<Task[]> {
  return withDbContext("tasks.getByCategory", async () => {
    assertId(categoryId, "getByCategory")
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        "SELECT * FROM tasks WHERE category_id = ? ORDER BY sort_order ASC",
        [categoryId],
      )) as TaskRow[]
      return rows.map((row) => taskRowToTask(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch tasks for category.", error)
    }
  })
}

export async function getByCategoryIds(categoryIds: string[]): Promise<Map<string, Task[]>> {
  return withDbContext("tasks.getByCategoryIds", async () => {
    const db = await getDatabase()

    return getByCategoryIdsWithDb(db, categoryIds)
  })
}

export async function getByCategoryIdsWithDb(
  db: Database,
  categoryIds: string[],
): Promise<Map<string, Task[]>> {
  return withDbContext("tasks.getByCategoryIdsWithDb", async () => {
    const tasksByCategory = new Map<string, Task[]>()
    if (categoryIds.length === 0) {
      return tasksByCategory
    }

    const placeholders = categoryIds.map(() => "?").join(", ")

    try {
      const rows = (await db.all(
        `SELECT * FROM tasks WHERE category_id IN (${placeholders}) ORDER BY category_id ASC, sort_order ASC`,
        categoryIds,
      )) as TaskRow[]

      rows.forEach((row) => {
        const task = taskRowToTask(row)
        const list = tasksByCategory.get(row.category_id) ?? []
        list.push(task)
        tasksByCategory.set(row.category_id, list)
      })

      return tasksByCategory
    } catch (error) {
      throw wrapDbError("Failed to fetch tasks for categories.", error)
    }
  })
}

export async function getById(id: string): Promise<Task | null> {
  return withDbContext("tasks.getById", async () => {
    assertId(id, "getById")
    const db = await getDatabase()

    return getByIdWithDb(db, id)
  })
}

export async function getByIdWithDb(db: Database, id: string): Promise<Task | null> {
  return withDbContext("tasks.getByIdWithDb", async () => {
    assertId(id, "getById")

    try {
      const row = (await db.get("SELECT * FROM tasks WHERE id = ?", [id])) as TaskRow | undefined
      return row ? taskRowToTask(row) : null
    } catch (error) {
      throw wrapDbError("Failed to fetch task.", error)
    }
  })
}

export async function create(categoryId: string, task: Task): Promise<void> {
  return withDbContext("tasks.create", async () => {
    assertId(categoryId, "create")
    assertTask(task)

    try {
      await withTransaction(async (db) => {
        await createWithDb(db, categoryId, task)
      })
    } catch (error) {
      throw wrapDbError("Failed to create task.", error)
    }
  })
}

export async function createWithDb(db: Database, categoryId: string, task: Task): Promise<void> {
  return withDbContext("tasks.createWithDb", async () => {
    assertId(categoryId, "create")
    assertTask(task)
    await assertCategoryExists(db, categoryId)

    const row = taskToRow(task)
    const nextSortOrderRow = (await db.get(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM tasks WHERE category_id = ?",
      [categoryId],
    )) as { sort_order: number }

    await db.run(
      `INSERT INTO tasks
       (id, category_id, name, completed, daily_goal, current_progress, spent_time, icon, emoji, completed_at, streak, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        categoryId,
        row.name,
        row.completed,
        row.daily_goal,
        row.current_progress,
        row.spent_time ?? null,
        row.icon ?? null,
        row.emoji,
        row.completed_at ?? null,
        row.streak ?? null,
        nextSortOrderRow.sort_order,
      ],
    )
  })
}

export async function update(id: string, updates: Partial<Task>): Promise<void> {
  return withDbContext("tasks.update", async () => {
    assertId(id, "update")
    const db = await getDatabase()

    await updateWithDb(db, id, updates)
  })
}

export async function updateProgress(id: string, progress: number, spentTime?: number): Promise<void> {
  return withDbContext("tasks.updateProgress", async () => {
    assertId(id, "updateProgress")
    const db = await getDatabase()

    try {
      if (spentTime === undefined) {
        await db.run("UPDATE tasks SET current_progress = ? WHERE id = ?", [progress, id])
        return
      }

      await db.run("UPDATE tasks SET current_progress = ?, spent_time = ? WHERE id = ?", [
        progress,
        spentTime,
        id,
      ])
    } catch (error) {
      throw wrapDbError("Failed to update task progress.", error)
    }
  })
}

export async function markCompleted(id: string, completedAt: number): Promise<void> {
  return withDbContext("tasks.markCompleted", async () => {
    assertId(id, "markCompleted")
    const db = await getDatabase()

    try {
      await db.run("UPDATE tasks SET completed = 1, completed_at = ? WHERE id = ?", [
        completedAt,
        id,
      ])
    } catch (error) {
      throw wrapDbError("Failed to mark task completed.", error)
    }
  })
}

export async function markIncomplete(id: string): Promise<void> {
  return withDbContext("tasks.markIncomplete", async () => {
    assertId(id, "markIncomplete")
    const db = await getDatabase()

    try {
      await db.run("UPDATE tasks SET completed = 0, completed_at = NULL WHERE id = ?", [id])
    } catch (error) {
      throw wrapDbError("Failed to mark task incomplete.", error)
    }
  })
}

export async function updateStreak(id: string, streak: number): Promise<void> {
  return withDbContext("tasks.updateStreak", async () => {
    assertId(id, "updateStreak")
    const db = await getDatabase()

    try {
      await db.run("UPDATE tasks SET streak = ? WHERE id = ?", [streak, id])
    } catch (error) {
      throw wrapDbError("Failed to update task streak.", error)
    }
  })
}

export async function deleteTask(id: string): Promise<void> {
  return withDbContext("tasks.deleteTask", async () => {
    assertId(id, "deleteTask")
    const db = await getDatabase()

    await deleteTaskWithDb(db, id)
  })
}

export async function updateWithDb(db: Database, id: string, updates: Partial<Task>): Promise<void> {
  return withDbContext("tasks.updateWithDb", async () => {
    try {
      const existing = await getByIdWithDb(db, id)
      if (!existing) {
        throw new Error("Task not found.")
      }

      if ("name" in updates && !updates.name) {
        throw new Error("Task name is required.")
      }
      if ("emoji" in updates && !updates.emoji) {
        throw new Error("Task emoji is required.")
      }

      const merged: Task = {
        ...existing,
        ...updates,
      }
      const row = taskToRow(merged)

      await db.run(
        `UPDATE tasks
         SET name = ?,
             completed = ?,
             daily_goal = ?,
             current_progress = ?,
             spent_time = ?,
             icon = ?,
             emoji = ?,
             completed_at = ?,
             streak = ?
         WHERE id = ?`,
        [
          row.name,
          row.completed,
          row.daily_goal,
          row.current_progress,
          row.spent_time ?? null,
          row.icon ?? null,
          row.emoji,
          row.completed_at ?? null,
          row.streak ?? null,
          id,
        ],
      )
    } catch (error) {
      throw wrapDbError("Failed to update task.", error)
    }
  })
}

export async function deleteTaskWithDb(db: Database, id: string): Promise<void> {
  return withDbContext("tasks.deleteTaskWithDb", async () => {
    assertId(id, "deleteTask")

    try {
      await db.run("DELETE FROM tasks WHERE id = ?", [id])
    } catch (error) {
      throw wrapDbError("Failed to delete task.", error)
    }
  })
}

export async function updateSortOrder(taskId: string, newSortOrder: number): Promise<void> {
  return withDbContext("tasks.updateSortOrder", async () => {
    assertId(taskId, "updateSortOrder")
    const db = await getDatabase()

    await updateSortOrderWithDb(db, taskId, newSortOrder)
  })
}

export async function updateSortOrderWithDb(
  db: Database,
  taskId: string,
  newSortOrder: number,
): Promise<void> {
  return withDbContext("tasks.updateSortOrderWithDb", async () => {
    try {
      await db.run("UPDATE tasks SET sort_order = ? WHERE id = ?", [newSortOrder, taskId])
    } catch (error) {
      throw wrapDbError("Failed to update task sort order.", error)
    }
  })
}

export async function reorderTasks(categoryId: string, orderedIds: string[]): Promise<void> {
  return withDbContext("tasks.reorderTasks", async () => {
    assertId(categoryId, "reorderTasks")
    if (orderedIds.length === 0) {
      return
    }

    try {
      await withTransaction(async (db) => {
        for (const [index, taskId] of orderedIds.entries()) {
          assertId(taskId, "reorderTasks")
          await db.run("UPDATE tasks SET sort_order = ? WHERE id = ? AND category_id = ?", [
            index,
            taskId,
            categoryId,
          ])
        }
      })
    } catch (error) {
      throw wrapDbError("Failed to reorder tasks.", error)
    }
  })
}

export async function resetProgressForCategory(categoryId: string): Promise<void> {
  return withDbContext("tasks.resetProgressForCategory", async () => {
    assertId(categoryId, "resetProgressForCategory")

    try {
      await withTransaction(async (db) => {
        await db.run(
          `UPDATE tasks
           SET completed = 0,
               completed_at = NULL,
               current_progress = 0,
               spent_time = 0
           WHERE category_id = ?`,
          [categoryId],
        )
      })
    } catch (error) {
      throw wrapDbError("Failed to reset task progress for category.", error)
    }
  })
}

export { deleteTask as delete }
