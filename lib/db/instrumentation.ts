import type { Database } from "sqlite-async"
import { validateQuery } from "@/lib/db/query-validator"
import { getDbLogger } from "@/lib/db/logger"
import { getDbContext } from "@/lib/db/context"

type InstrumentationOptions = {
  allowDangerous?: boolean
  operationContext?: string
  countOperation?: () => void
}

const QUERY_METHODS = new Set(["run", "get", "all", "exec"])

export function instrumentDatabase(db: Database, options: InstrumentationOptions = {}): Database {
  const logger = getDbLogger()
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof prop === "string" && QUERY_METHODS.has(prop) && typeof value === "function") {
        return (sql: string, params?: unknown) => {
          const normalizedParams: unknown[] = Array.isArray(params) ? params : []
          const context = getDbContext()
          validateQuery(sql, normalizedParams, {
            allowDangerous: options.allowDangerous,
            environment: process.env.NODE_ENV,
            operationName: options.operationContext ?? context.operation,
          })
          const start = Date.now()
          const onSuccess = (result: unknown) => {
            const duration = Date.now() - start
            logger.logQuery(sql, normalizedParams, duration, target)
            options.countOperation?.()
            return result
          }
          const onFailure = (error: unknown) => {
            const duration = Date.now() - start
            logger.logError(options.operationContext ?? prop, error, {
              sql,
              params: normalizedParams,
              duration,
            })
            throw error
          }
          try {
            const result = value.call(target, sql, params as never)
            if (result && typeof (result as Promise<unknown>).then === "function") {
              return (result as Promise<unknown>).then(onSuccess).catch(onFailure)
            }
            return onSuccess(result)
          } catch (error) {
            return onFailure(error)
          }
        }
      }
      return value
    },
  })
}
