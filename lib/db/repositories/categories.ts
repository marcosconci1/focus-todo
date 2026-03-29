import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import { categoryRowToCategory, categoryToRow } from "@/lib/db/types"
import type { CategoryRow } from "@/lib/db/types"
import type { Category } from "@/lib/types"
import { getByCategoryIdsWithDb } from "@/lib/db/repositories/tasks"
import { withTransaction } from "@/lib/db/repositories/transactions"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"
import { getDbLogger } from "@/lib/db/logger"

const CATEGORY_COLUMNS =
  "id, name, color, daily_goal_hours, project_type, is_habit_project, sort_order, created_at, updated_at"

function assertId(id: string, context: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${context} requires a valid id.`)
  }
}

function assertCategory(category: Category): void {
  if (!category.id || category.id.trim().length === 0) {
    throw new Error("Category id is required.")
  }
  if (!category.name || category.name.trim().length === 0) {
    throw new Error("Category name is required.")
  }
  if (!category.color || category.color.trim().length === 0) {
    throw new Error("Category color is required.")
  }
}

export async function getAll(): Promise<Category[]> {
  return withDbContext("categories.getAll", async () => {
    const db = await getDatabase()

    return getAllWithDb(db)
  })
}

export async function getAllWithDb(db: Database): Promise<Category[]> {
  return withDbContext("categories.getAllWithDb", async () => {
    const logger = getDbLogger()
    try {
      logger.logConnection("opened", {
        message: "Loading categories from database",
        timestamp: new Date().toISOString(),
      })
      const rows = (await db.all(
        `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY sort_order ASC`,
      )) as CategoryRow[]
      logger.logConnection("opened", {
        message: "Categories query completed",
        timestamp: new Date().toISOString(),
        rowCount: rows.length,
      })
      if (rows.length === 0) {
        console.warn("No categories exist in the database.")
        logger.logConnection("opened", {
          message: "No categories exist in the database",
          timestamp: new Date().toISOString(),
          rowCount: rows.length,
        })
      }
      return rows.map((row) => categoryRowToCategory(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch categories.", error)
    }
  })
}

export async function getAllWithTasks(): Promise<Category[]> {
  return withDbContext("categories.getAllWithTasks", async () => {
    const db = await getDatabase()

    return getAllWithTasksWithDb(db)
  })
}

export async function getAllWithTasksWithDb(db: Database): Promise<Category[]> {
  return withDbContext("categories.getAllWithTasksWithDb", async () => {
    const categories = await getAllWithDb(db)
    const categoryIds = categories.map((category) => category.id)
    const tasksByCategory = await getByCategoryIdsWithDb(db, categoryIds)

    return categories.map((category) => ({
      ...category,
      tasks: tasksByCategory.get(category.id) ?? [],
    }))
  })
}

export async function getById(id: string): Promise<Category | null> {
  return withDbContext("categories.getById", async () => {
    assertId(id, "getById")
    const db = await getDatabase()

    return getByIdWithDb(db, id)
  })
}

export async function getByIdWithDb(db: Database, id: string): Promise<Category | null> {
  return withDbContext("categories.getByIdWithDb", async () => {
    assertId(id, "getById")

    try {
      const row = (await db.get(
        `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ?`,
        [id],
      )) as
        | CategoryRow
        | undefined
      return row ? categoryRowToCategory(row) : null
    } catch (error) {
      throw wrapDbError("Failed to fetch category.", error)
    }
  })
}

export async function create(category: Category): Promise<void> {
  return withDbContext("categories.create", async () => {
    assertCategory(category)

    try {
      await withTransaction(async (db) => {
        await createWithDb(db, category)
      })
    } catch (error) {
      throw wrapDbError("Failed to create category.", error)
    }
  })
}

export async function createWithDb(db: Database, category: Category): Promise<void> {
  return withDbContext("categories.createWithDb", async () => {
    assertCategory(category)
    try {
      const row = categoryToRow(category)
      const nextSortOrderRow = (await db.get(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM categories",
      )) as { sort_order: number }

      await db.run(
        `INSERT INTO categories (id, name, color, daily_goal_hours, project_type, is_habit_project, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name,
          row.color,
          row.daily_goal_hours ?? null,
          row.project_type ?? null,
          row.is_habit_project ?? null,
          nextSortOrderRow.sort_order,
        ],
      )
    } catch (error) {
      throw wrapDbError("Failed to create category.", error)
    }
  })
}

export async function update(id: string, updates: Partial<Category>): Promise<void> {
  return withDbContext("categories.update", async () => {
    assertId(id, "update")
    const db = await getDatabase()

    await updateWithDb(db, id, updates)
  })
}

export async function deleteCategory(id: string): Promise<void> {
  return withDbContext("categories.deleteCategory", async () => {
    assertId(id, "deleteCategory")
    const db = await getDatabase()

    await deleteCategoryWithDb(db, id)
  })
}

export async function updateWithDb(db: Database, id: string, updates: Partial<Category>): Promise<void> {
  return withDbContext("categories.updateWithDb", async () => {
    try {
      const existing = await getByIdWithDb(db, id)
      if (!existing) {
        throw new Error("Category not found.")
      }

      const { tasks: _ignoredTasks, ...categoryUpdates } = updates
      if ("name" in categoryUpdates && !categoryUpdates.name) {
        throw new Error("Category name is required.")
      }
      if ("color" in categoryUpdates && !categoryUpdates.color) {
        throw new Error("Category color is required.")
      }

      const merged: Category = {
        ...existing,
        ...categoryUpdates,
        tasks: existing.tasks,
      }
      const row = categoryToRow(merged)

      await db.run(
        `UPDATE categories
         SET name = ?,
             color = ?,
             daily_goal_hours = ?,
             project_type = ?,
             is_habit_project = ?
         WHERE id = ?`,
        [
          row.name,
          row.color,
          row.daily_goal_hours ?? null,
          row.project_type ?? null,
          row.is_habit_project ?? null,
          id,
        ],
      )
    } catch (error) {
      throw wrapDbError("Failed to update category.", error)
    }
  })
}

export async function updateSortOrder(categoryId: string, newSortOrder: number): Promise<void> {
  return withDbContext("categories.updateSortOrder", async () => {
    assertId(categoryId, "updateSortOrder")
    const db = await getDatabase()

    await updateSortOrderWithDb(db, categoryId, newSortOrder)
  })
}

export async function deleteCategoryWithDb(db: Database, id: string): Promise<void> {
  return withDbContext("categories.deleteCategoryWithDb", async () => {
    assertId(id, "deleteCategory")

    try {
      await db.run("DELETE FROM categories WHERE id = ?", [id])
    } catch (error) {
      throw wrapDbError("Failed to delete category.", error)
    }
  })
}

export async function updateSortOrderWithDb(
  db: Database,
  categoryId: string,
  newSortOrder: number,
): Promise<void> {
  return withDbContext("categories.updateSortOrderWithDb", async () => {
    assertId(categoryId, "updateSortOrder")

    try {
      await db.run("UPDATE categories SET sort_order = ? WHERE id = ?", [newSortOrder, categoryId])
    } catch (error) {
      throw wrapDbError("Failed to update category sort order.", error)
    }
  })
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  return withDbContext("categories.reorderCategories", async () => {
    if (orderedIds.length === 0) {
      return
    }

    try {
      await withTransaction(async (db) => {
        for (const [index, categoryId] of orderedIds.entries()) {
          assertId(categoryId, "reorderCategories")
          await db.run("UPDATE categories SET sort_order = ? WHERE id = ?", [index, categoryId])
        }
      })
    } catch (error) {
      throw wrapDbError("Failed to reorder categories.", error)
    }
  })
}

export { deleteCategory as delete }
