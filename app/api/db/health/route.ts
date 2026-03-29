import fs from "fs"
import os from "os"
import path from "path"
import { NextResponse } from "next/server"
import { getConnectionHealth, getDatabase, isDatabaseInitialized } from "@/lib/db/connection"
import { getMetricsSnapshot } from "@/lib/db/metrics"
import { getDbLogger } from "@/lib/db/logger"
import { getLastBackupInfo } from "@/lib/db/recovery"

export async function GET(request: Request) {
  const authError = getHealthAuthError(request)
  if (authError) {
    return authError
  }

  try {
    const db = await getDatabase()
    const initialized = await isDatabaseInitialized()
    const connectionHealth = getConnectionHealth()
    const allowSensitive = shouldAllowSensitiveDetails(request)

    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )

    const counts: Record<string, number> = {}
    for (const table of tables as Array<{ name: string }>) {
      const escapedName = table.name.replace(/"/g, '""')
      const result = (await db.get(`SELECT COUNT(*) as count FROM "${escapedName}"`)) as {
        count: number
      }
      counts[table.name] = result.count
    }

    const integrityRows = (await db.all("PRAGMA integrity_check(10)")) as Array<{ integrity_check: string }>
    const integrityErrors = integrityRows.map((row) => row.integrity_check).filter((value) => value !== "ok")

    const walCheckpoint = (await db.get("PRAGMA wal_checkpoint(PASSIVE)")) as
      | { busy: number; log: number; checkpointed: number }
      | undefined

    const dbPath =
      process.env.NODE_ENV === "production"
        ? path.join(os.homedir(), ".focus-todo", "focus-todo.db")
        : path.join(process.cwd(), "public", "data", "focus-todo.db")

    const stats = fs.statSync(dbPath)
    const walStats = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`) : null
    const shmStats = fs.existsSync(`${dbPath}-shm`) ? fs.statSync(`${dbPath}-shm`) : null

    const metrics = getMetricsSnapshot()
    const recentErrors = getDbLogger().getRecentErrors(10)
    const backupInfo = getLastBackupInfo()

    const isHealthy =
      connectionHealth.isHealthy &&
      integrityErrors.length === 0 &&
      metrics.errorCount < 10

    const payload: Record<string, unknown> = {
      status: isHealthy ? "healthy" : "unhealthy",
      initialized,
      integrity: {
        ok: integrityErrors.length === 0,
      },
      connectionHealth: { isHealthy: connectionHealth.isHealthy },
    }

    if (allowSensitive) {
      payload.tables = (tables as Array<{ name: string }>).map((table) => table.name)
      payload.counts = counts
      payload.integrity = {
        ok: integrityErrors.length === 0,
        errors: integrityErrors,
      }
      payload.walCheckpoint = walCheckpoint
      payload.metrics = metrics
      payload.recentErrors = recentErrors
      payload.backupInfo = backupInfo
      payload.databaseSize = stats.size
      payload.walSize = walStats?.size ?? 0
      payload.shmSize = shmStats?.size ?? 0
      payload.databasePath = dbPath
      payload.connectionPool = { size: connectionHealth.openConnections, max: 1 }
    }

    return NextResponse.json(payload, { status: isHealthy ? 200 : 503 })
  } catch (error) {
    console.error("Database health check failed:", error)
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

function shouldAllowSensitiveDetails(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true
  }
  const token = process.env.DB_HEALTH_TOKEN
  if (!token) {
    return false
  }
  const headerToken =
    request.headers.get("x-db-health-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  return headerToken === token
}

function getHealthAuthError(request: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") {
    return null
  }

  const token = process.env.DB_HEALTH_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Health endpoint not available" }, { status: 403 })
  }

  const headerToken =
    request.headers.get("x-db-health-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")

  if (headerToken !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
