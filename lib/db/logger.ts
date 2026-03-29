import type { Database } from "sqlite-async"
import { recordError, recordQuery, recordTransaction } from "@/lib/db/metrics"
import { getDbContext } from "@/lib/db/context"

type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG"

type DbLogEntry = {
  timestamp: string
  level: LogLevel
  operation: string
  duration?: number
  error?: { message: string; code?: string | null; stack?: string }
  context?: Record<string, unknown>
}

const MAX_LOG_ENTRIES = 1000
const LEVELS: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"]

const normalizeLevel = (value: string | undefined): LogLevel => {
  const upper = (value ?? "").toUpperCase()
  return LEVELS.includes(upper as LogLevel) ? (upper as LogLevel) : "INFO"
}

const shouldLog = (current: LogLevel, target: LogLevel): boolean => {
  return LEVELS.indexOf(target) <= LEVELS.indexOf(current)
}

const defaultLevel: LogLevel =
  process.env.DB_LOG_LEVEL ? normalizeLevel(process.env.DB_LOG_LEVEL) : process.env.NODE_ENV === "production" ? "WARN" : "INFO"

class DbLogger {
  private entries: DbLogEntry[] = []
  private level: LogLevel = defaultLevel

  setLevel(level: LogLevel) {
    this.level = level
  }

  getEntries() {
    return [...this.entries]
  }

  getRecentErrors(limit = 10) {
    return this.entries.filter((entry) => entry.level === "ERROR").slice(-limit)
  }

  logQuery(sql: string, params: unknown[], duration: number, db?: Database) {
    recordQuery(sql, duration)
    const slowThreshold = process.env.NODE_ENV === "production" ? 1000 : 100
    if (duration < slowThreshold && !shouldLog(this.level, "DEBUG")) {
      return
    }

    const context = getDbContext()
    const nullParams = params.filter((param) => param === null).length
    const entry: DbLogEntry = {
      timestamp: new Date().toISOString(),
      level: duration >= slowThreshold ? "WARN" : "DEBUG",
      operation: "query",
      duration,
      context: {
        sql,
        paramCount: params.length,
        nullParams,
        ...(context.operation ? { operationContext: context.operation } : {}),
      },
    }

    this.pushEntry(entry)
    if (duration >= slowThreshold && db) {
      void db
        .all(`EXPLAIN QUERY PLAN ${sql}`, params as never)
        .then((plan: unknown) => {
          this.pushEntry({
            timestamp: new Date().toISOString(),
            level: "DEBUG",
            operation: "query-plan",
            context: { sql, plan },
          })
        })
        .catch(() => {})
    }
  }

  logError(operation: string, error: unknown, context?: Record<string, unknown>) {
    const err = error instanceof Error ? error : new Error(String(error))
    const activeContext = getDbContext()
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code ?? null
        : null
    recordError(code)
    const entry: DbLogEntry = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      operation,
      error: {
        message: err.message,
        code,
        stack: err.stack,
      },
      context: {
        ...(activeContext.operation ? { operationContext: activeContext.operation } : {}),
        ...(context ?? {}),
      },
    }
    this.pushEntry(entry)
  }

  logTransaction(action: "start" | "commit" | "rollback", duration?: number, context?: Record<string, unknown>) {
    if (action !== "start" && typeof duration === "number") {
      recordTransaction(duration, action === "commit")
    }
    const entry: DbLogEntry = {
      timestamp: new Date().toISOString(),
      level: action === "rollback" ? "ERROR" : "INFO",
      operation: `transaction:${action}`,
      duration,
      context,
    }
    this.pushEntry(entry)
  }

  logConnection(state: "opened" | "closed" | "error", context?: Record<string, unknown>) {
    const entry: DbLogEntry = {
      timestamp: new Date().toISOString(),
      level: state === "error" ? "ERROR" : "INFO",
      operation: `connection:${state}`,
      context,
    }
    this.pushEntry(entry)
  }

  private pushEntry(entry: DbLogEntry) {
    if (!shouldLog(this.level, entry.level)) {
      return
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_LOG_ENTRIES)
    }
    const payload = JSON.stringify(entry)
    if (entry.level === "ERROR") {
      console.error(payload)
    } else if (entry.level === "WARN") {
      console.warn(payload)
    } else if (entry.level === "INFO") {
      console.info(payload)
    } else {
      console.debug(payload)
    }
  }
}

const dbLogger = new DbLogger()

export function getDbLogger(): DbLogger {
  return dbLogger
}
