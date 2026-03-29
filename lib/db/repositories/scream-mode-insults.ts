import "server-only"

import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import type { ScreamModeInsult } from "@/lib/alert-types"
import { DEFAULT_SCREAM_MODE_INSULTS } from "@/lib/scream-mode-insults-data"
import {
  screamModeInsultRowToScreamModeInsult,
  screamModeInsultToRow,
  type ScreamModeInsultRow,
} from "@/lib/db/types"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const SCREAM_MODE_INSULT_COLUMNS =
  "id, title, message, punchline, enabled, created_at, updated_at"

function assertId(id: string, context: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${context} requires a valid id.`)
  }
}

function assertInsult(insult: ScreamModeInsult): void {
  if (!insult.id || insult.id.trim().length === 0) {
    throw new Error("Insult id is required.")
  }
  if (!insult.title || insult.title.trim().length === 0) {
    throw new Error("Insult title is required.")
  }
  if (!insult.message || insult.message.trim().length === 0) {
    throw new Error("Insult message is required.")
  }
}

export async function getAll(): Promise<ScreamModeInsult[]> {
  return withDbContext("screamModeInsults.getAll", async () => {
    const db = await getDatabase()

    return getAllWithDb(db)
  })
}

export async function getAllWithDb(db: Database): Promise<ScreamModeInsult[]> {
  return withDbContext("screamModeInsults.getAllWithDb", async () => {
    try {
      const rows = (await db.all(
        `SELECT ${SCREAM_MODE_INSULT_COLUMNS} FROM scream_mode_insults ORDER BY created_at ASC`,
      )) as ScreamModeInsultRow[]
      return rows.map((row) => screamModeInsultRowToScreamModeInsult(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch scream mode insults.", error)
    }
  })
}

export async function getById(id: string): Promise<ScreamModeInsult | null> {
  return withDbContext("screamModeInsults.getById", async () => {
    assertId(id, "getById")
    const db = await getDatabase()

    return getByIdWithDb(db, id)
  })
}

export async function getByIdWithDb(db: Database, id: string): Promise<ScreamModeInsult | null> {
  return withDbContext("screamModeInsults.getByIdWithDb", async () => {
    assertId(id, "getByIdWithDb")

    try {
      const row = (await db.get(
        `SELECT ${SCREAM_MODE_INSULT_COLUMNS} FROM scream_mode_insults WHERE id = ?`,
        [id],
      )) as
        | ScreamModeInsultRow
        | undefined
      return row ? screamModeInsultRowToScreamModeInsult(row) : null
    } catch (error) {
      throw wrapDbError("Failed to fetch scream mode insult.", error)
    }
  })
}

export async function getEnabled(): Promise<ScreamModeInsult[]> {
  return withDbContext("screamModeInsults.getEnabled", async () => {
    const db = await getDatabase()

    return getEnabledWithDb(db)
  })
}

export async function getEnabledWithDb(db: Database): Promise<ScreamModeInsult[]> {
  return withDbContext("screamModeInsults.getEnabledWithDb", async () => {
    try {
      const rows = (await db.all(
        `SELECT ${SCREAM_MODE_INSULT_COLUMNS} FROM scream_mode_insults WHERE enabled = ? ORDER BY created_at ASC`,
        [1],
      )) as ScreamModeInsultRow[]
      return rows.map((row) => screamModeInsultRowToScreamModeInsult(row))
    } catch (error) {
      throw wrapDbError("Failed to fetch enabled scream mode insults.", error)
    }
  })
}

export async function create(insult: ScreamModeInsult): Promise<void> {
  return withDbContext("screamModeInsults.create", async () => {
    assertInsult(insult)
    const db = await getDatabase()

    await createWithDb(db, insult)
  })
}

export async function createWithDb(db: Database, insult: ScreamModeInsult): Promise<void> {
  return withDbContext("screamModeInsults.createWithDb", async () => {
    assertInsult(insult)

    try {
      const row = screamModeInsultToRow(insult)
      await db.run(
        `INSERT INTO scream_mode_insults (id, title, message, punchline, enabled) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           message = excluded.message,
           punchline = excluded.punchline,
           enabled = excluded.enabled,
           updated_at = datetime('now')`,
        [row.id, row.title, row.message, row.punchline, row.enabled],
      )
    } catch (error) {
      throw wrapDbError("Failed to create scream mode insult.", error)
    }
  })
}

export async function update(
  id: string,
  updates: Partial<ScreamModeInsult>,
): Promise<ScreamModeInsult> {
  return withDbContext("screamModeInsults.update", async () => {
    assertId(id, "update")
    const db = await getDatabase()

    return updateWithDb(db, id, updates)
  })
}

export async function updateWithDb(
  db: Database,
  id: string,
  updates: Partial<ScreamModeInsult>,
): Promise<ScreamModeInsult> {
  return withDbContext("screamModeInsults.updateWithDb", async () => {
    assertId(id, "updateWithDb")

    const existing = await getByIdWithDb(db, id)
    if (!existing) {
      throw new Error("Insult not found.")
    }

    if ("title" in updates && !updates.title) {
      throw new Error("Insult title is required.")
    }
    if ("message" in updates && !updates.message) {
      throw new Error("Insult message is required.")
    }

    const merged: ScreamModeInsult = { ...existing, ...updates }
    assertInsult(merged)
    const row = screamModeInsultToRow(merged)

    try {
      await db.run(
        "UPDATE scream_mode_insults SET title = ?, message = ?, punchline = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
        [row.title, row.message, row.punchline, row.enabled, id],
      )

      const updated = await getByIdWithDb(db, id)
      if (!updated) {
        throw new Error("Insult not found.")
      }
      return updated
    } catch (error) {
      throw wrapDbError("Failed to update scream mode insult.", error)
    }
  })
}

export async function toggleEnabled(id: string, enabled: boolean): Promise<void> {
  return withDbContext("screamModeInsults.toggleEnabled", async () => {
    assertId(id, "toggleEnabled")
    const db = await getDatabase()

    let result;
    try {
      result = await db.run(
        "UPDATE scream_mode_insults SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
        [enabled ? 1 : 0, id],
      )
    } catch (error) {
      throw wrapDbError("Failed to toggle scream mode insult.", error)
    }
    if (result.changes === 0) {
      throw new Error("Insult not found.")
    }
  })
}

export async function deleteInsult(id: string): Promise<void> {
  return withDbContext("screamModeInsults.delete", async () => {
    assertId(id, "delete")
    const db = await getDatabase()

    await deleteWithDb(db, id)
  })
}

export async function deleteWithDb(db: Database, id: string): Promise<void> {
  return withDbContext("screamModeInsults.deleteWithDb", async () => {
    assertId(id, "delete")

    let result;
    try {
      result = await db.run("DELETE FROM scream_mode_insults WHERE id = ?", [id])
    } catch (error) {
      throw wrapDbError("Failed to delete scream mode insult.", error)
    }
    if (result.changes === 0) {
      throw new Error("Insult not found.")
    }
  })
}

export async function seedDefaultInsults(): Promise<void> {
  return withDbContext("screamModeInsults.seedDefaultInsults", async () => {
    const db = await getDatabase()

    await seedDefaultInsultsWithDb(db)
  })
}

export async function seedDefaultInsultsWithDb(db: Database): Promise<void> {
  return withDbContext("screamModeInsults.seedDefaultInsultsWithDb", async () => {
    try {
      const row = (await db.get(
        "SELECT COUNT(*) as count FROM scream_mode_insults",
      )) as { count?: number } | undefined
      const count = row?.count ?? 0
      if (count > 0) return

      for (const insult of DEFAULT_SCREAM_MODE_INSULTS) {
        const rowData = screamModeInsultToRow(insult)
        await db.run(
          "INSERT OR IGNORE INTO scream_mode_insults (id, title, message, punchline, enabled) VALUES (?, ?, ?, ?, ?)",
          [rowData.id, rowData.title, rowData.message, rowData.punchline, rowData.enabled],
        )
      }
    } catch (error) {
      throw wrapDbError("Failed to seed scream mode insults.", error)
    }
  })
}
