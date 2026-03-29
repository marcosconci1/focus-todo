import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import type { SettingsRow } from "@/lib/db/types"
import type { NudgeSettings } from "@/lib/settings-defaults"
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const SETTINGS_COLUMNS = "id, data, created_at, updated_at"

const END_OF_DAY_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function serializeSettings(settings: NudgeSettings): string {
  return JSON.stringify(settings)
}

function mergeSettings(settings: Partial<NudgeSettings>): NudgeSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    realityCheckSettings: {
      ...DEFAULT_SETTINGS.realityCheckSettings,
      ...settings.realityCheckSettings,
    },
    authors: settings.authors ?? DEFAULT_SETTINGS.authors,
  }
}

function validateSettings(settings: NudgeSettings): void {
  if (settings.pomodoroMinutes <= 0) {
    throw new Error("pomodoroMinutes must be greater than 0.")
  }
  if (settings.shortBreakMinutes <= 0) {
    throw new Error("shortBreakMinutes must be greater than 0.")
  }
  if (settings.longBreakMinutes <= 0) {
    throw new Error("longBreakMinutes must be greater than 0.")
  }
  if (!END_OF_DAY_TIME_PATTERN.test(settings.endOfDayTime)) {
    throw new Error("endOfDayTime must be in HH:MM format.")
  }
  if (!settings.authors || settings.authors.length === 0) {
    throw new Error("authors must not be empty.")
  }
}

function parseSettings(row: SettingsRow): NudgeSettings {
  let parsed: Partial<NudgeSettings> = {}
  try {
    parsed = JSON.parse(row.data) as Partial<NudgeSettings>
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse settings data. ${details}`)
  }

  const merged = mergeSettings(parsed)
  validateSettings(merged)
  return merged
}

export async function get(): Promise<NudgeSettings> {
  return withDbContext("settings.get", async () => {
    const db = await getDatabase()

    return getWithDb(db)
  })
}

export async function getWithDb(db: Database): Promise<NudgeSettings> {
  return withDbContext("settings.getWithDb", async () => {
    try {
      const row = (await db.get(
        `SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`,
      )) as SettingsRow | undefined
      if (!row) {
        const payload = DEFAULT_SETTINGS
        await db.run("INSERT INTO settings (id, data, updated_at) VALUES (1, ?, datetime('now'))", [
          serializeSettings(payload),
        ])
        return payload
      }

      try {
        if (typeof row.data !== "string" || row.data.length === 0) {
          throw new Error("Invalid settings payload.")
        }
        return parseSettings(row)
      } catch (error) {
        const payload = DEFAULT_SETTINGS
        await db.run("UPDATE settings SET data = ?, updated_at = datetime('now') WHERE id = 1", [
          serializeSettings(payload),
        ])
        return payload
      }
    } catch (error) {
      throw wrapDbError("Failed to fetch settings.", error)
    }
  })
}

export async function update(settings: Partial<NudgeSettings>): Promise<NudgeSettings> {
  return withDbContext("settings.update", async () => {
    const db = await getDatabase()

    return updateWithDb(db, settings)
  })
}

export async function updateWithDb(db: Database, settings: Partial<NudgeSettings>): Promise<NudgeSettings> {
  return withDbContext("settings.updateWithDb", async () => {
    try {
      const existing = await getWithDb(db)
      const merged = mergeSettings({
        ...existing,
        ...settings,
        realityCheckSettings: {
          ...existing.realityCheckSettings,
          ...settings.realityCheckSettings,
        },
        authors: settings.authors ?? existing.authors,
      })
      validateSettings(merged)

      const payload = serializeSettings(merged)
      await db.run(
        `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [payload],
      )

      return merged
    } catch (error) {
      throw wrapDbError("Failed to update settings.", error)
    }
  })
}

export async function reset(): Promise<NudgeSettings> {
  return withDbContext("settings.reset", async () => {
    const db = await getDatabase()

    try {
      validateSettings(DEFAULT_SETTINGS)
      const payload = serializeSettings(DEFAULT_SETTINGS)
      await db.run(
        `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [payload],
      )

      return DEFAULT_SETTINGS
    } catch (error) {
      throw wrapDbError("Failed to update settings.", error)
    }
  })
}
