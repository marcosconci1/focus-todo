import { NextResponse } from "next/server"
import crypto from "crypto"
import { getDb, initializeDb, saveDb, type Database } from "@/lib/storage"
import { classifySqliteError, extractSqliteContext, logDbError } from "@/lib/db/errors"
import {
  resolveReasonFromCode,
  validateDatabase,
} from "@/lib/validation/alert-validation"

export async function GET() {
  const requestId = crypto.randomUUID()
  try {
    await initializeDb()
    const data = await getDb()
    return NextResponse.json(data)
  } catch (error) {
    const classification = classifySqliteError(error)
    const sqliteContext = extractSqliteContext(error)
    logDbError("GET /api/db", error, { requestId })
    const reason = resolveReasonFromCode(classification.code, classification.message.toLowerCase())
    const status = classification.code === "SQLITE_BUSY" || classification.code === "SQLITE_LOCKED" ? 503 : 500
    const headers = new Headers()
    if (status === 503) {
      headers.set("Retry-After", "1")
    }
    return NextResponse.json(
      {
        error: "Failed to read database",
        reason,
        code: classification.code,
        retryable: classification.retryable,
        details: classification.message,
        ...(process.env.NODE_ENV !== "production" && sqliteContext.sql ? { sql: sqliteContext.sql } : {}),
        ...(process.env.NODE_ENV !== "production" && sqliteContext.params ? { params: sqliteContext.params } : {}),
        timestamp: new Date().toISOString(),
        requestId,
      },
      { status, headers },
    )
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  let requestBodySize = 0
  try {
    const MAX_PAYLOAD_SIZE = 50 * 1024 * 1024 // 50 MB
    const rawBody = await request.text()
    requestBodySize = rawBody.length
    if (requestBodySize > MAX_PAYLOAD_SIZE) {
      return NextResponse.json(
        { error: "Payload too large", reason: "payload", code: null, retryable: false, timestamp: new Date().toISOString(), requestId },
        { status: 413 },
      )
    }
    if (!rawBody.trim()) {
      return NextResponse.json(
        { error: "Empty database payload", reason: "payload", code: null, retryable: false, timestamp: new Date().toISOString(), requestId },
        { status: 400 },
      )
    }
    let data: Database
    try {
      data = JSON.parse(rawBody) as Database
    } catch (parseError) {
      logDbError("POST /api/db parse", parseError, { requestId, requestBodySize })
      return NextResponse.json(
        { error: "Invalid database payload", reason: "payload", code: null, retryable: false, timestamp: new Date().toISOString(), requestId },
        { status: 400 },
      )
    }

    const validationError = validateDatabase(data)
    if (validationError) {
      return NextResponse.json(
        { error: validationError, reason: validationError === "duplicate-id" ? "duplicate-id" : "payload", code: null, retryable: false, timestamp: new Date().toISOString(), requestId },
        { status: 400 },
      )
    }

    try {
      await saveDb(data)
    } catch (dbError) {
      const classification = classifySqliteError(dbError)
      const sqliteContext = extractSqliteContext(dbError)
      logDbError("POST /api/db", dbError, {
        requestId,
        requestBodySize,
        sql: sqliteContext.sql,
        params: sqliteContext.params,
      })
      const reason = resolveReasonFromCode(classification.code, classification.message.toLowerCase())
      const isConstraint = classification.code === "SQLITE_CONSTRAINT"
      const isLocked = classification.code === "SQLITE_BUSY" || classification.code === "SQLITE_LOCKED"
      const status = isConstraint ? 400 : isLocked ? 503 : 500
      const headers = new Headers()
      if (isLocked) {
        headers.set("Retry-After", "1")
      }
      return NextResponse.json(
        {
          error: "Failed to write database",
          reason,
          code: classification.code,
          details: classification.message,
          ...(process.env.NODE_ENV !== "production" && sqliteContext.sql ? { sql: sqliteContext.sql } : {}),
          ...(process.env.NODE_ENV !== "production" && sqliteContext.params ? { params: sqliteContext.params } : {}),
          constraint: isConstraint ? classification.message : null,
          hint: isConstraint ? "Check singleton table writes for UPDATE + INSERT patterns." : null,
          retryable: classification.retryable,
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status, headers },
      )
    }
    return NextResponse.json({ success: true, requestId })
  } catch (error) {
    logDbError("POST /api/db unexpected", error, { requestId, requestBodySize })
    return NextResponse.json(
      { error: "Unexpected error", reason: "unknown", code: null, retryable: false, timestamp: new Date().toISOString(), requestId },
      { status: 500 },
    )
  }
}
