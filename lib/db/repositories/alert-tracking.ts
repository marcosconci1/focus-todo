import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import type { AlertTracking } from "@/lib/alert-types"
import { DEFAULT_ALERT_TRACKING } from "@/lib/alert-types"
import type { AlertTrackingRow } from "@/lib/db/types"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ALERT_TRACKING_COLUMNS = "id, data, created_at, updated_at"

function isIsoOrNull(value: string | null): boolean {
  if (value === null) {
    return true
  }
  return ISO_TIMESTAMP_PATTERN.test(value)
}

function validateTracking(tracking: AlertTracking): void {
  const timestampFields: Array<keyof AlertTracking> = [
    "lastSessionStartedAt",
    "lastSessionEndedAt",
    "lastSessionCompletedAt",
    "lastAlertFiredAt",
    "lastRockyAlertAt",
    "lastAdrianAlertAt",
    "lastTimekeeperAlertAt",
    "lastTaskCompletedAt",
    "lastBreakActivatedAt",
    "screamModeActivatedAt",
    "screamModeLastAlertAt",
  ]

  timestampFields.forEach((field) => {
    const value = tracking[field] as string | null
    if (!isIsoOrNull(value)) {
      throw new Error(`Alert tracking field ${field} must be ISO string or null.`)
    }
  })

  if (tracking.globalSessionCounter < 0) {
    throw new Error("globalSessionCounter must be greater than or equal to 0.")
  }
  if (tracking.dismissedAlertsToday < 0) {
    throw new Error("dismissedAlertsToday must be greater than or equal to 0.")
  }
  if (tracking.distractionsToday < 0) {
    throw new Error("distractionsToday must be greater than or equal to 0.")
  }
  if (tracking.timeWasted < 0) {
    throw new Error("timeWasted must be greater than or equal to 0.")
  }
  if (!Array.isArray(tracking.firedAlertsToday)) {
    throw new Error("firedAlertsToday must be an array.")
  }

  if (tracking.realityCheckState) {
    if (tracking.realityCheckState.firedCountToday < 0) {
      throw new Error("realityCheckState.firedCountToday must be greater than or equal to 0.")
    }
    if (!isIsoOrNull(tracking.realityCheckState.lastFiredAt)) {
      throw new Error("realityCheckState.lastFiredAt must be ISO string or null.")
    }
  }
}

function parseTracking(row: AlertTrackingRow): AlertTracking {
  let parsed: Partial<AlertTracking> = {}
  try {
    parsed = JSON.parse(row.data) as Partial<AlertTracking>
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse alert tracking data. ${details}`)
  }

  const merged: AlertTracking = {
    ...DEFAULT_ALERT_TRACKING,
    ...parsed,
    realityCheckState: parsed.realityCheckState
      ? {
          ...DEFAULT_ALERT_TRACKING.realityCheckState,
          ...parsed.realityCheckState,
        }
      : DEFAULT_ALERT_TRACKING.realityCheckState,
  }

  validateTracking(merged)
  return merged
}

export async function get(): Promise<AlertTracking> {
  return withDbContext("alertTracking.get", async () => {
    const db = await getDatabase()

    return getWithDb(db)
  })
}

export async function getWithDb(db: Database): Promise<AlertTracking> {
  return withDbContext("alertTracking.getWithDb", async () => {
    try {
      const row = (await db.get(
        `SELECT ${ALERT_TRACKING_COLUMNS} FROM alert_tracking WHERE id = 1`,
      )) as
        | AlertTrackingRow
        | undefined
      if (!row) {
        await db.run("INSERT INTO alert_tracking (id, data, updated_at) VALUES (1, ?, datetime('now'))", [
          JSON.stringify(DEFAULT_ALERT_TRACKING),
        ])
        return DEFAULT_ALERT_TRACKING
      }

      try {
        return parseTracking(row)
      } catch (error) {
        await db.run("UPDATE alert_tracking SET data = ?, updated_at = datetime('now') WHERE id = 1", [
          JSON.stringify(DEFAULT_ALERT_TRACKING),
        ])
        return DEFAULT_ALERT_TRACKING
      }
    } catch (error) {
      throw wrapDbError("Failed to fetch alert tracking.", error)
    }
  })
}

export async function update(tracking: Partial<AlertTracking>): Promise<AlertTracking> {
  return withDbContext("alertTracking.update", async () => {
    const db = await getDatabase()

    return updateWithDb(db, tracking)
  })
}

export async function updateWithDb(
  db: Database,
  tracking: Partial<AlertTracking>,
): Promise<AlertTracking> {
  return withDbContext("alertTracking.updateWithDb", async () => {
    try {
      const existing = await getWithDb(db)
      const merged: AlertTracking = {
        ...existing,
        ...tracking,
        realityCheckState: {
          ...existing.realityCheckState,
          ...tracking.realityCheckState,
        } as AlertTracking["realityCheckState"],
      }

      validateTracking(merged)
      const payload = JSON.stringify(merged)
      await db.run(
        `INSERT INTO alert_tracking (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [payload],
      )

      return merged
    } catch (error) {
      throw wrapDbError("Failed to update alert tracking.", error)
    }
  })
}

export async function reset(): Promise<AlertTracking> {
  return withDbContext("alertTracking.reset", async () => {
    const db = await getDatabase()

    try {
      validateTracking(DEFAULT_ALERT_TRACKING)
      const payload = JSON.stringify(DEFAULT_ALERT_TRACKING)
      await db.run(
        `INSERT INTO alert_tracking (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [payload],
      )

      return DEFAULT_ALERT_TRACKING
    } catch (error) {
      throw wrapDbError("Failed to update alert tracking.", error)
    }
  })
}

export async function resetDailyCounters(): Promise<AlertTracking> {
  return withDbContext("alertTracking.resetDailyCounters", async () => {
    const existing = await get()

    const updated: AlertTracking = {
      ...existing,
      dismissedAlertsToday: 0,
      distractionsToday: 0,
      timeWasted: 0,
      firedAlertsToday: [],
      realityCheckState: {
        lastFiredAt: existing.realityCheckState?.lastFiredAt ?? null,
        firedCountToday: 0,
      },
    }

    return update(updated)
  })
}
