import fs from "fs"
import os from "os"
import path from "path"
import { NextResponse } from "next/server"
import {
  getConnectionHealth,
  getDatabase,
  getSchemaCacheStatus,
  isDatabaseInitialized,
} from "@/lib/db/connection"

function resolveDatabasePath(): string {
  if (process.env.NODE_ENV === "production") {
    return path.join(os.homedir(), ".focus-todo", "focus-todo.db")
  }
  return path.join(process.cwd(), "public", "data", "focus-todo.db")
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const token = process.env.DB_HEALTH_TOKEN
    if (!token) {
      return NextResponse.json({ error: "Diagnostics not available" }, { status: 403 })
    }
    const headerToken =
      request.headers.get("x-db-health-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (headerToken !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const db = await getDatabase()
    const initialized = await isDatabaseInitialized()
    const dbPath = resolveDatabasePath()
    const dbExists = fs.existsSync(dbPath)
    const dbStats = dbExists ? fs.statSync(dbPath) : null
    const walStats = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`) : null
    const shmStats = fs.existsSync(`${dbPath}-shm`) ? fs.statSync(`${dbPath}-shm`) : null

    const tables = (await db.all(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
    )) as Array<{ name: string; sql: string | null }>

    const rowCounts: Record<string, number> = {}
    for (const table of tables) {
      const escapedTable = table.name.replace(/"/g, '""')
      const result = (await db.get(`SELECT COUNT(*) AS count FROM "${escapedTable}"`)) as
        | { count?: number }
        | undefined
      rowCounts[table.name] = Number(result?.count ?? 0)
    }

    const categories = (await db.all(
      "SELECT id, name, color, project_type, daily_goal_hours, sort_order, created_at, updated_at FROM categories ORDER BY sort_order ASC, name ASC",
    )) as Array<Record<string, unknown>>

    const metadata = (await db.all("SELECT * FROM metadata ORDER BY id ASC")) as Array<Record<string, unknown>>

    return NextResponse.json({
      status: "ok",
      initialized,
      database: {
        path: dbPath,
        exists: dbExists,
        sizeBytes: dbStats?.size ?? 0,
        mtime: dbStats?.mtime.toISOString() ?? null,
        walSizeBytes: walStats?.size ?? 0,
        shmSizeBytes: shmStats?.size ?? 0,
      },
      tables,
      rowCounts,
      categories,
      metadata,
      schemaCache: getSchemaCacheStatus(),
      connectionHealth: getConnectionHealth(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
