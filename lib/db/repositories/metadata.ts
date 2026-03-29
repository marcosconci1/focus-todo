import { getDatabase } from "@/lib/db/connection"
import type { Database } from "sqlite-async"
import { metadataRowToMetadata, type Metadata, type MetadataRow } from "@/lib/db/types"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_METADATA_VERSION = "2.0.0"
const METADATA_COLUMNS =
  "id, last_reset_date, overtime_session_state, pending_calendar_updates, version, created_at, updated_at"

function assertIsoOrNull(value: string | null): void {
  if (value === null) {
    return
  }
  if (!ISO_DATE_PATTERN.test(value) && !DAY_KEY_PATTERN.test(value)) {
    throw new Error("lastResetDate must be ISO string, YYYY-MM-DD, or null.")
  }
}

function validateMetadata(metadata: Metadata): void {
  assertIsoOrNull(metadata.lastResetDate)
  if (!metadata.version || metadata.version.trim().length === 0) {
    throw new Error("version must be non-empty.")
  }
}

function assertIsoDateTime(value: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error("createdAt must be ISO string.")
  }
}

async function getWithDbInternal(db: Database): Promise<Metadata> {
  return withDbContext("metadata.getWithDbInternal", async () => {
    const row = (await db.get(
      `SELECT ${METADATA_COLUMNS} FROM metadata WHERE id = 1`,
    )) as MetadataRow | undefined
    if (!row) {
      const createdAt = new Date().toISOString()
      const updatedAt = new Date().toISOString()
      await db.run(
        "INSERT INTO metadata (id, last_reset_date, overtime_session_state, pending_calendar_updates, version, created_at, updated_at) VALUES (1, NULL, NULL, NULL, ?, ?, ?)",
        [DEFAULT_METADATA_VERSION, createdAt, updatedAt],
      )
      const inserted = (await db.get(
        `SELECT ${METADATA_COLUMNS} FROM metadata WHERE id = 1`,
      )) as MetadataRow | undefined
      if (!inserted) {
        throw new Error("Metadata row not found.")
      }

      const metadata = metadataRowToMetadata(inserted)
      validateMetadata(metadata)
      return metadata
    }

    try {
      const metadata = metadataRowToMetadata(row)
      validateMetadata(metadata)
      assertIsoDateTime(metadata.createdAt)
      return metadata
    } catch (error) {
      const safeLastResetDate =
        row.last_reset_date && (ISO_DATE_PATTERN.test(row.last_reset_date) || DAY_KEY_PATTERN.test(row.last_reset_date))
          ? row.last_reset_date
          : null
      const safeVersion = row.version && row.version.trim().length > 0 ? row.version : DEFAULT_METADATA_VERSION
      const safeCreatedAt = ISO_DATE_PATTERN.test(row.created_at) ? row.created_at : new Date().toISOString()
      const updatedAt = new Date().toISOString()

      await db.run(
        `INSERT INTO metadata (id, last_reset_date, overtime_session_state, pending_calendar_updates, version, created_at, updated_at)
         VALUES (1, ?, NULL, NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_reset_date = excluded.last_reset_date,
           version = excluded.version,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [safeLastResetDate, safeVersion, safeCreatedAt, updatedAt],
      )

      const repaired = (await db.get(
        `SELECT ${METADATA_COLUMNS} FROM metadata WHERE id = 1`,
      )) as MetadataRow | undefined
      if (!repaired) {
        throw new Error("Metadata row not found.")
      }

      const repairedMetadata = metadataRowToMetadata(repaired)
      validateMetadata(repairedMetadata)
      return repairedMetadata
    }
  })
}

export async function get(): Promise<Metadata> {
  return withDbContext("metadata.get", async () => {
    const db = await getDatabase()

    return getWithDb(db)
  })
}

export async function getWithDb(db: Database): Promise<Metadata> {
  return withDbContext("metadata.getWithDb", async () => {
    try {
      return await getWithDbInternal(db)
    } catch (error) {
      throw wrapDbError("Failed to fetch metadata.", error)
    }
  })
}

export async function updateLastResetDate(date: string | null): Promise<Metadata> {
  return withDbContext("metadata.updateLastResetDate", async () => {
    const db = await getDatabase()
    let operation: "update" | "insert" | "unknown" = "unknown"

    try {
      assertIsoOrNull(date)
      const current = await getWithDbInternal(db)
      assertIsoDateTime(current.createdAt)
      if (!current.version || current.version.trim().length === 0) {
        throw new Error("version must be non-empty.")
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug("metadata.updateLastResetDate", {
          lastResetDate: date,
          version: current.version,
          createdAt: current.createdAt,
        })
      }

      const updatedAt = new Date().toISOString()
      await db.run(
        `INSERT INTO metadata (id, last_reset_date, overtime_session_state, pending_calendar_updates, version, created_at, updated_at)
         VALUES (1, ?, NULL, NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_reset_date = excluded.last_reset_date, version = excluded.version, updated_at = excluded.updated_at`,
        [date, current.version, current.createdAt, updatedAt],
      )
      operation = "update"

      return await getWithDb(db)
    } catch (error) {
      throw wrapDbError(`Failed to update last reset date (${operation}).`, error)
    }
  })
}

export async function updateMetadata(updates: {
  lastResetDate?: string | null
  overtimeSessionState?: string | null
  pendingCalendarUpdates?: string | null
  version?: string
  createdAt?: string
}): Promise<Metadata> {
  return withDbContext("metadata.updateMetadata", async () => {
    const db = await getDatabase()

    return updateMetadataWithDb(db, updates)
  })
}

export async function updateMetadataWithDb(
  db: Database,
  updates: {
    lastResetDate?: string | null
    overtimeSessionState?: string | null
    pendingCalendarUpdates?: string | null
    version?: string
    createdAt?: string
  },
): Promise<Metadata> {
  return withDbContext("metadata.updateMetadataWithDb", async () => {
    let operation: "update" | "insert" | "unknown" = "unknown"

    try {
      const current = await getWithDbInternal(db)
      const nextLastResetDate = updates.lastResetDate ?? current.lastResetDate
      const nextOvertimeSessionState = updates.overtimeSessionState ?? current.overtimeSessionState
      const nextPendingCalendarUpdates = updates.pendingCalendarUpdates ?? current.pendingCalendarUpdates
      const nextVersion = updates.version ?? current.version
      const nextCreatedAt = updates.createdAt ?? current.createdAt

      assertIsoOrNull(nextLastResetDate)
      if (!nextVersion || nextVersion.trim().length === 0) {
        throw new Error("version must be non-empty.")
      }
      assertIsoDateTime(nextCreatedAt)

      if (process.env.NODE_ENV !== "production") {
        console.debug("metadata.updateMetadataWithDb", {
          lastResetDate: nextLastResetDate,
          version: nextVersion,
          createdAt: nextCreatedAt,
        })
      }

      const updatedAt = new Date().toISOString()
      await db.run(
        `INSERT INTO metadata (id, last_reset_date, overtime_session_state, pending_calendar_updates, version, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_reset_date = excluded.last_reset_date,
           overtime_session_state = excluded.overtime_session_state,
           pending_calendar_updates = excluded.pending_calendar_updates,
           version = excluded.version,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          nextLastResetDate,
          nextOvertimeSessionState ?? null,
          nextPendingCalendarUpdates ?? null,
          nextVersion,
          nextCreatedAt,
          updatedAt,
        ],
      )
      operation = "update"

      const updated = await getWithDbInternal(db)
      validateMetadata(updated)
      return updated
    } catch (error) {
      throw wrapDbError(`Failed to update metadata (${operation}).`, error)
    }
  })
}

export async function getLastResetDate(): Promise<string | null> {
  return withDbContext("metadata.getLastResetDate", async () => {
    const db = await getDatabase()

    try {
      const row = (await db.get("SELECT last_reset_date FROM metadata WHERE id = 1")) as
        | { last_reset_date: string | null }
        | undefined
      if (!row) {
        throw new Error("Metadata row not found.")
      }

      return row.last_reset_date
    } catch (error) {
      throw wrapDbError("Failed to fetch last reset date.", error)
    }
  })
}

export async function getVersion(): Promise<string> {
  return withDbContext("metadata.getVersion", async () => {
    const db = await getDatabase()

    try {
      const row = (await db.get("SELECT version FROM metadata WHERE id = 1")) as
        | { version: string | null }
        | undefined
      if (!row) {
        throw new Error("Metadata row not found.")
      }
      if (!row.version) {
        throw new Error("Metadata version is empty.")
      }
      return row.version
    } catch (error) {
      throw wrapDbError("Failed to fetch metadata version.", error)
    }
  })
}
