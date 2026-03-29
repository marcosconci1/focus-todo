import { getDatabase } from "@/lib/db/connection"
import type { GoogleCalendarTokensRow } from "@/lib/db/types"
import { decryptToken, encryptToken } from "@/lib/google-auth-utils"
import { wrapDbError } from "@/lib/db/errors"
import { withDbContext } from "@/lib/db/context"

export interface GoogleTokens {
  accessToken: string | null
  refreshToken: string | null
  expiryDate: number | null
  tokenType: string | null
  scope: string | null
  userEmail: string | null
  connectedAt: string | null
  lastRefreshed: string | null
}

function mapRow(row: GoogleCalendarTokensRow): GoogleTokens {
  const accessToken = row.access_token ? decryptToken(row.access_token) : null
  const refreshToken = row.refresh_token ? decryptToken(row.refresh_token) : null

  return {
    accessToken: accessToken ?? null,
    refreshToken: refreshToken ?? null,
    expiryDate: row.expiry_date ?? null,
    tokenType: row.token_type ?? null,
    scope: row.scope ?? null,
    userEmail: row.user_email ?? null,
    connectedAt: row.connected_at ?? null,
    lastRefreshed: row.last_refreshed ?? null,
  }
}

async function insertEmptyRow(): Promise<void> {
  await withDbContext("googleTokens.insertEmptyRow", async () => {
    const db = await getDatabase()
    await db.run(
      `INSERT OR IGNORE INTO google_calendar_tokens
       (id, access_token, refresh_token, expiry_date, token_type, scope, user_email, connected_at, last_refreshed, updated_at)
       VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now'))`,
    )
  })
}

export async function get(): Promise<GoogleTokens> {
  return withDbContext("googleTokens.get", async () => {
    const db = await getDatabase()

    try {
      const row = (await db.get("SELECT * FROM google_calendar_tokens WHERE id = 1")) as
        | GoogleCalendarTokensRow
        | undefined
      if (!row) {
        await insertEmptyRow()
        const inserted = (await db.get("SELECT * FROM google_calendar_tokens WHERE id = 1")) as
          | GoogleCalendarTokensRow
          | undefined
        if (!inserted) {
          throw new Error("Google tokens row not found.")
        }
        return mapRow(inserted)
      }

      return mapRow(row)
    } catch (error) {
      throw wrapDbError("Failed to fetch Google tokens.", error)
    }
  })
}

export async function save(params: {
  accessToken: string
  refreshToken: string
  expiryDate: number | null
  scope: string | null
  userEmail: string | null
}): Promise<GoogleTokens> {
  return withDbContext("googleTokens.save", async () => {
    const db = await getDatabase()

    try {
      const existing = (await db.get("SELECT * FROM google_calendar_tokens WHERE id = 1")) as
        | GoogleCalendarTokensRow
        | undefined
      const encryptedAccessToken = encryptToken(params.accessToken)
      const encryptedRefreshToken = encryptToken(params.refreshToken)
      const connectedAt =
        existing?.connected_at && existing.refresh_token ? existing.connected_at : new Date().toISOString()

      await db.run(
        `INSERT INTO google_calendar_tokens
         (id, access_token, refresh_token, expiry_date, token_type, scope, user_email, connected_at, last_refreshed, updated_at)
         VALUES (1, ?, ?, ?, NULL, ?, ?, ?, NULL, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expiry_date = excluded.expiry_date,
           token_type = NULL,
           scope = excluded.scope,
           user_email = excluded.user_email,
           connected_at = excluded.connected_at,
           last_refreshed = NULL,
           updated_at = datetime('now')`,
        [encryptedAccessToken, encryptedRefreshToken, params.expiryDate, params.scope, params.userEmail, connectedAt],
      )

      return get()
    } catch (error) {
      throw wrapDbError("Failed to save Google tokens.", error)
    }
  })
}

export async function refresh(accessToken: string, expiryDate: number | null): Promise<GoogleTokens> {
  return withDbContext("googleTokens.refresh", async () => {
    const db = await getDatabase()

    try {
      const encryptedAccessToken = encryptToken(accessToken)
      const lastRefreshed = new Date().toISOString()
      const result = await db.run(
        `UPDATE google_calendar_tokens
         SET access_token = ?,
             expiry_date = ?,
             last_refreshed = ?,
             updated_at = datetime('now')
         WHERE id = 1`,
        [encryptedAccessToken, expiryDate, lastRefreshed],
      )
      if (result.changes === 0) {
        throw new Error("Cannot refresh tokens: no existing connection found")
      }

      return get()
    } catch (error) {
      throw wrapDbError("Failed to refresh Google tokens.", error)
    }
  })
}

export async function disconnect(): Promise<string | null> {
  return withDbContext("googleTokens.disconnect", async () => {
    const db = await getDatabase()

    try {
      const current = await get()
      await db.run(
        `UPDATE google_calendar_tokens
         SET access_token = NULL,
             refresh_token = NULL,
             expiry_date = NULL,
             token_type = NULL,
             scope = NULL,
             user_email = NULL,
             connected_at = NULL,
             last_refreshed = NULL,
             updated_at = datetime('now')
         WHERE id = 1`,
      )
      return current.refreshToken
    } catch (error) {
      throw wrapDbError("Failed to disconnect Google tokens.", error)
    }
  })
}

export async function isConnected(): Promise<boolean> {
  return withDbContext("googleTokens.isConnected", async () => {
    const db = await getDatabase()

    try {
      const row = (await db.get(
        "SELECT refresh_token FROM google_calendar_tokens WHERE id = 1",
      )) as { refresh_token: string | null } | undefined
      return Boolean(row?.refresh_token)
    } catch (error) {
      throw wrapDbError("Failed to check Google tokens connection.", error)
    }
  })
}
