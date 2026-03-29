import fs from "fs"
import os from "os"
import path from "path"
import { NextResponse } from "next/server"
import {
  checkDatabaseIntegrity,
  createBackup,
  optimizeDatabase,
  repairDatabase,
  restoreFromBackup,
} from "@/lib/db/recovery"
import { logDbError } from "@/lib/db/errors"

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const token = process.env.DB_HEALTH_TOKEN
    if (!token) {
      return NextResponse.json({ error: "Recovery not available" }, { status: 403 })
    }
    const headerToken =
      request.headers.get("x-db-health-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (headerToken !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const action = String(formData.get("action") ?? "")
      if (action !== "restore") {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
      }
      const file = formData.get("file")
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Missing backup file" }, { status: 400 })
      }
      const MAX_BACKUP_SIZE = 100 * 1024 * 1024 // 100 MB
      if ((file as File).size > MAX_BACKUP_SIZE) {
        return NextResponse.json({ error: "Backup file too large (max 100 MB)" }, { status: 413 })
      }
      const buffer = Buffer.from(await (file as File).arrayBuffer())
      const tmpPath = path.join(os.tmpdir(), `focus-todo-restore-${Date.now()}.db`)
      try {
        await fs.promises.writeFile(tmpPath, buffer)
        await restoreFromBackup(tmpPath)
        return NextResponse.json({ success: true })
      } finally {
        await fs.promises.unlink(tmpPath).catch(() => {})
      }
    }

    const payload = (await request.json()) as { action?: string }
    switch (payload.action) {
      case "backup": {
        const result = await createBackup({ reason: "manual" })
        return NextResponse.json({ success: true, ...result })
      }
      case "optimize": {
        await optimizeDatabase()
        return NextResponse.json({ success: true })
      }
      case "integrity": {
        const result = await checkDatabaseIntegrity()
        return NextResponse.json({ success: true, ...result })
      }
      case "repair": {
        const result = await repairDatabase()
        return NextResponse.json({ success: result })
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    logDbError("POST /api/db/recovery", error)
    return NextResponse.json({ error: "Recovery action failed" }, { status: 500 })
  }
}
