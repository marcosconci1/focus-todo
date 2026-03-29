import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import type { AlertTemplate, AlertType } from "@/lib/alert-types"
import {
  alertTemplateRowToAlertTemplate,
  alertTemplateToRow,
  type AlertTemplateRow,
} from "@/lib/db/types"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const ALERT_TYPES: AlertType[] = [
  "INACTIVITY",
  "HABITS_ENDING_DAY",
  "END_OF_DAY_COUNTDOWN",
  "REALITY_CHECKS",
  "BREAK_REMINDER",
  "ELAPSED_TIME",
]
const ALERT_TEMPLATE_COLUMNS =
  "id, type, title, message, tone, enabled, author_id, created_at, updated_at"

function assertId(id: string, context: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${context} requires a valid id.`)
  }
}

function assertAlertType(type: string): asserts type is AlertType {
  if (!ALERT_TYPES.includes(type as AlertType)) {
    throw new Error("Invalid alert type.")
  }
}

function assertTemplate(template: AlertTemplate): void {
  if (!template.id || template.id.trim().length === 0) {
    throw new Error("Template id is required.")
  }
  if (!template.title || template.title.trim().length === 0) {
    throw new Error("Template title is required.")
  }
  if (!template.message || template.message.trim().length === 0) {
    throw new Error("Template message is required.")
  }
  if (!template.authorId || template.authorId.trim().length === 0) {
    throw new Error("Template authorId is required.")
  }
  assertAlertType(template.type)
}

function parseAlertTypesFromSql(sql: string | null | undefined): AlertType[] {
  if (!sql) {
    return ALERT_TYPES
  }
  const match = sql.match(/CHECK\s*\(\s*type\s+IN\s*\(([^)]+)\)\s*\)/i)
  if (!match || !match[1]) {
    return ALERT_TYPES
  }
  const rawValues = match[1]
    .split(",")
    .map((value) => value.trim().replace(/^'+|'+$/g, ""))
    .filter((value) => value.length > 0)
  const allowed = rawValues.filter((value): value is AlertType => ALERT_TYPES.includes(value as AlertType))
  return allowed.length > 0 ? allowed : ALERT_TYPES
}

export async function getSupportedAlertTypesWithDb(db: Database): Promise<AlertType[]> {
  return withDbContext("alertTemplates.getSupportedAlertTypesWithDb", async () => {
    try {
      const row = (await db.get(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'alert_templates'",
      )) as { sql?: string | null } | undefined
      return parseAlertTypesFromSql(row?.sql)
    } catch (error) {
      throw wrapDbError("Failed to read alert template schema.", error)
    }
  })
}

export async function getAll(): Promise<AlertTemplate[]> {
  return withDbContext("alertTemplates.getAll", async () => {
    const db = await getDatabase()

    return getAllWithDb(db)
  })
}

export async function getAllWithDb(db: Database): Promise<AlertTemplate[]> {
  return withDbContext("alertTemplates.getAllWithDb", async () => {
    try {
      const rows = (await db.all(
        `SELECT ${ALERT_TEMPLATE_COLUMNS} FROM alert_templates ORDER BY type ASC, created_at ASC`,
      )) as AlertTemplateRow[]
      return rows.map((row) => alertTemplateRowToAlertTemplate(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch alert templates.", error)
    }
  })
}

export async function getById(id: string): Promise<AlertTemplate | null> {
  return withDbContext("alertTemplates.getById", async () => {
    assertId(id, "getById")
    const db = await getDatabase()

    return getByIdWithDb(db, id)
  })
}

export async function getByIdWithDb(db: Database, id: string): Promise<AlertTemplate | null> {
  return withDbContext("alertTemplates.getByIdWithDb", async () => {
    assertId(id, "getByIdWithDb")

    try {
      const row = (await db.get(
        `SELECT ${ALERT_TEMPLATE_COLUMNS} FROM alert_templates WHERE id = ?`,
        [id],
      )) as
        | AlertTemplateRow
        | undefined
      return row ? alertTemplateRowToAlertTemplate(row) : null
    } catch (error) {
      throw wrapDbError("Failed to fetch alert template.", error)
    }
  })
}

export async function getByType(type: AlertType): Promise<AlertTemplate[]> {
  return withDbContext("alertTemplates.getByType", async () => {
    assertAlertType(type)
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT ${ALERT_TEMPLATE_COLUMNS} FROM alert_templates WHERE type = ? ORDER BY created_at ASC`,
        [type],
      )) as AlertTemplateRow[]
      return rows.map((row) => alertTemplateRowToAlertTemplate(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch alert templates by type.", error)
    }
  })
}

export async function getByAuthor(authorId: string): Promise<AlertTemplate[]> {
  return withDbContext("alertTemplates.getByAuthor", async () => {
    assertId(authorId, "getByAuthor")
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT ${ALERT_TEMPLATE_COLUMNS} FROM alert_templates WHERE author_id = ? ORDER BY created_at ASC`,
        [authorId],
      )) as AlertTemplateRow[]
      return rows.map((row) => alertTemplateRowToAlertTemplate(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch alert templates by author.", error)
    }
  })
}

export async function getEnabled(): Promise<AlertTemplate[]> {
  return withDbContext("alertTemplates.getEnabled", async () => {
    const db = await getDatabase()

    try {
      const rows = (await db.all(
        `SELECT ${ALERT_TEMPLATE_COLUMNS} FROM alert_templates WHERE enabled = 1 ORDER BY type ASC, created_at ASC`,
      )) as AlertTemplateRow[]
      return rows.map((row) => alertTemplateRowToAlertTemplate(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch enabled alert templates.", error)
    }
  })
}

export async function create(template: AlertTemplate): Promise<void> {
  return withDbContext("alertTemplates.create", async () => {
    assertTemplate(template)
    const db = await getDatabase()

    await createWithDb(db, template)
  })
}

export async function createWithDb(db: Database, template: AlertTemplate): Promise<void> {
  return withDbContext("alertTemplates.createWithDb", async () => {
    assertTemplate(template)

    try {
      const row = alertTemplateToRow(template)
      await db.run(
        `INSERT INTO alert_templates (id, type, title, message, tone, enabled, author_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.type, row.title, row.message, row.tone, row.enabled, row.author_id],
      )
    } catch (error) {
      throw wrapDbError("Failed to create alert template.", error)
    }
  })
}

export async function update(id: string, updates: Partial<AlertTemplate>): Promise<AlertTemplate> {
  return withDbContext("alertTemplates.update", async () => {
    assertId(id, "update")
    const db = await getDatabase()

    return updateWithDb(db, id, updates)
  })
}

export async function toggleEnabled(id: string, enabled: boolean): Promise<void> {
  return withDbContext("alertTemplates.toggleEnabled", async () => {
    assertId(id, "toggleEnabled")
    const db = await getDatabase()

    try {
      const result = await db.run("UPDATE alert_templates SET enabled = ? WHERE id = ?", [
        enabled ? 1 : 0,
        id,
      ])
      if (result.changes === 0) {
        throw new Error("Template not found.")
      }
    } catch (error) {
      throw wrapDbError("Failed to toggle alert template.", error)
    }
  })
}

export async function deleteTemplate(id: string): Promise<void> {
  return withDbContext("alertTemplates.delete", async () => {
    assertId(id, "delete")
    const db = await getDatabase()

    await deleteWithDb(db, id)
  })
}

export async function updateWithDb(
  db: Database,
  id: string,
  updates: Partial<AlertTemplate>,
): Promise<AlertTemplate> {
  return withDbContext("alertTemplates.updateWithDb", async () => {
    assertId(id, "updateWithDb")

    const existing = await getByIdWithDb(db, id)
    if (!existing) {
      throw new Error("Template not found.")
    }

    if ("title" in updates && !updates.title) {
      throw new Error("Template title is required.")
    }
    if ("message" in updates && !updates.message) {
      throw new Error("Template message is required.")
    }
    if ("authorId" in updates && !updates.authorId) {
      throw new Error("Template authorId is required.")
    }
    if ("type" in updates && updates.type) {
      assertAlertType(updates.type)
    }

    const merged: AlertTemplate = { ...existing, ...updates }
    assertTemplate(merged)
    const row = alertTemplateToRow(merged)

    try {
      await db.run(
        `UPDATE alert_templates
         SET type = ?,
             title = ?,
             message = ?,
             tone = ?,
             enabled = ?,
             author_id = ?
         WHERE id = ?`,
        [row.type, row.title, row.message, row.tone, row.enabled, row.author_id, id],
      )

      return merged
    } catch (error) {
      throw wrapDbError("Failed to update alert template.", error)
    }
  })
}


export async function deleteWithDb(db: Database, id: string): Promise<void> {
  return withDbContext("alertTemplates.deleteWithDb", async () => {
    assertId(id, "delete")

    try {
      const result = await db.run("DELETE FROM alert_templates WHERE id = ?", [id])
      if (result.changes === 0) {
        throw new Error("Template not found.")
      }
    } catch (error) {
      throw wrapDbError("Failed to delete alert template.", error)
    }
  })
}

export { deleteTemplate as delete }
