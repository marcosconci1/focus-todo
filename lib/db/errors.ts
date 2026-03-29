import { getDbLogger } from "@/lib/db/logger"
import { classifySqliteError, extractSqliteContext, type SqliteErrorCategory, type SqliteErrorCode } from "@/lib/db/error-classifier"

type ErrorWithCode = Error & { code?: string }

export { classifySqliteError, extractSqliteContext }
export type { SqliteErrorCategory, SqliteErrorCode }

export function logDbError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  const logger = getDbLogger()
  const classification = classifySqliteError(error)
  const sqliteContext = extractSqliteContext(error)
  logger.logError(context, error, {
    code: classification.code,
    category: classification.category,
    retryable: classification.retryable,
    ...sqliteContext,
    ...metadata,
  })
}

export function wrapDbError(prefix: string, error: unknown): Error {
  const baseError = error instanceof Error ? error : new Error(String(error))
  const message = `${prefix} ${baseError.message}`
  const wrapped = new Error(message, { cause: baseError })
  const classification = classifySqliteError(baseError)
  const code = classification.code
  if (typeof code === "string") {
    ;(wrapped as ErrorWithCode).code = code
  }
  ;(wrapped as Error & { category?: SqliteErrorCategory }).category = classification.category
  ;(wrapped as Error & { retryable?: boolean }).retryable = classification.retryable
  logDbError(prefix, baseError)
  return wrapped
}
