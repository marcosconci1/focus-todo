import { NextResponse } from "next/server"
import crypto from "crypto"
import { saveDb, type Database } from "@/lib/storage"
import { classifySqliteError, extractSqliteContext, logDbError } from "@/lib/db/errors"
import { resolveReasonFromCode, validateDatabase, normalizeAlertTracking } from "@/lib/validation/alert-validation"

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    const rawBody = await request.text()
    if (!rawBody.trim()) {
      return NextResponse.json({ error: "Empty data payload", requestId }, { status: 400 })
    }

    let payload: { data?: Database }
    try {
      payload = JSON.parse(rawBody) as { data?: Database }
    } catch (parseError) {
      logDbError("POST /api/data/save parse", parseError, { requestId })
      return NextResponse.json({ error: "Invalid data payload", requestId }, { status: 400 })
    }

    const data = payload?.data

    if (!data) {
      return NextResponse.json({ error: "Missing data payload", requestId }, { status: 400 })
    }

    const normalizedData = normalizeAlertTracking(data)
    const validationError = validateDatabase(normalizedData)
    if (validationError) {
      return NextResponse.json({ error: validationError, requestId }, { status: 400 })
    }

    await saveDb(normalizedData)

    return NextResponse.json({ success: true, requestId })
  } catch (error) {
    const classification = classifySqliteError(error)
    const sqliteContext = extractSqliteContext(error)
    logDbError("POST /api/data/save", error, { requestId })
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
        error: "Failed to write data",
        reason,
        code: classification.code,
        retryable: classification.retryable,
        ...(process.env.NODE_ENV !== "production" ? { details: classification.message } : {}),
        ...(process.env.NODE_ENV !== "production" && sqliteContext.sql ? { sql: sqliteContext.sql } : {}),
        ...(process.env.NODE_ENV !== "production" && sqliteContext.params ? { params: sqliteContext.params } : {}),
        timestamp: new Date().toISOString(),
        requestId,
      },
      { status, headers },
    )
  }
}
