type ErrorWithCode = Error & { code?: string }

export type SqliteErrorCode =
  | "SQLITE_BUSY"
  | "SQLITE_LOCKED"
  | "SQLITE_CORRUPT"
  | "SQLITE_CANTOPEN"
  | "SQLITE_IOERR"
  | "SQLITE_FULL"
  | "SQLITE_NOMEM"
  | "SQLITE_READONLY"
  | "SQLITE_CONSTRAINT"
  | "SQLITE_MISMATCH"
  | "SQLITE_RANGE"
  | "SQLITE_NOTADB"
  | "SQLITE_ERROR"

export type SqliteErrorCategory = "transient" | "permanent" | "schema" | "unknown"

export function classifySqliteError(error: unknown): {
  code: string | null
  category: SqliteErrorCategory
  retryable: boolean
  message: string
} {
  const err = error instanceof Error ? error : new Error(String(error))
  const code =
    (error && typeof error === "object" && "code" in error && typeof (error as ErrorWithCode).code === "string"
      ? (error as ErrorWithCode).code
      : null) ??
    (err.cause && typeof err.cause === "object" && "code" in err.cause && typeof (err.cause as ErrorWithCode).code === "string"
      ? (err.cause as ErrorWithCode).code
      : null)

  const transientCodes = new Set(["SQLITE_BUSY", "SQLITE_LOCKED", "SQLITE_IOERR"])
  const permanentCodes = new Set([
    "SQLITE_CORRUPT",
    "SQLITE_CANTOPEN",
    "SQLITE_FULL",
    "SQLITE_NOMEM",
    "SQLITE_READONLY",
    "SQLITE_CONSTRAINT",
    "SQLITE_MISMATCH",
    "SQLITE_RANGE",
    "SQLITE_NOTADB",
  ])

  if (code && transientCodes.has(code)) {
    return { code, category: "transient", retryable: true, message: err.message }
  }
  if (code && permanentCodes.has(code)) {
    return { code, category: "permanent", retryable: false, message: err.message }
  }
  if (code === "SQLITE_ERROR") {
    const normalized = err.message.toLowerCase()
    const hasMissingObject =
      normalized.includes("no such table") ||
      normalized.includes("no such column") ||
      normalized.includes("has no column named")
    if (hasMissingObject) {
      return { code, category: "schema", retryable: true, message: err.message }
    }
    if (normalized.includes("malformed")) {
      return { code, category: "schema", retryable: false, message: err.message }
    }
    return { code, category: "schema", retryable: false, message: err.message }
  }

  return { code: code ?? null, category: "unknown", retryable: false, message: err.message }
}

export function extractSqliteContext(error: unknown): { sql?: string; params?: unknown[]; stack?: string } {
  if (!error || typeof error !== "object") {
    return {}
  }
  const err = error as { sql?: string; params?: unknown[]; stack?: string; cause?: unknown }
  const context: { sql?: string; params?: unknown[]; stack?: string } = {}
  if (typeof err.sql === "string") {
    context.sql = err.sql
  }
  if (Array.isArray(err.params)) {
    context.params = err.params
  }
  if (typeof err.stack === "string") {
    context.stack = err.stack
  }
  if (err.cause && typeof err.cause === "object") {
    const cause = err.cause as { sql?: string; params?: unknown[]; stack?: string }
    if (!context.sql && typeof cause.sql === "string") {
      context.sql = cause.sql
    }
    if (!context.params && Array.isArray(cause.params)) {
      context.params = cause.params
    }
    if (!context.stack && typeof cause.stack === "string") {
      context.stack = cause.stack
    }
  }
  return context
}
