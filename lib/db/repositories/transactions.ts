import { AsyncLocalStorage } from "node:async_hooks"
import type { Database } from "sqlite-async"
import { getDatabase } from "@/lib/db/connection"
import { classifySqliteError, logDbError } from "@/lib/db/errors"
import { getDbLogger } from "@/lib/db/logger"
import { instrumentDatabase } from "@/lib/db/instrumentation"
import { decrementActiveTransactions, incrementActiveTransactions } from "@/lib/db/metrics"

const getTransactionWarnMs = () => Number(process.env.DB_TRANSACTION_WARN_MS ?? "5000")
const getTransactionWarnOps = () => Number(process.env.DB_TRANSACTION_WARN_OPS ?? "1000")
const transactionContext = new AsyncLocalStorage<{ depth: number }>()

/** Mutex that serializes write transactions on the singleton SQLite connection. */
class TransactionMutex {
  private queue: Array<() => void> = []
  private locked = false

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    } else {
      this.locked = false
    }
  }
}

const txMutex = new TransactionMutex()

function getTransactionDepth(): number {
  return transactionContext.getStore()?.depth ?? 0
}

export async function withTransaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const depth = getTransactionDepth() + 1

  // Only the outermost transaction acquires the mutex
  if (depth === 1) {
    await txMutex.acquire()
  }

  const db = await getDatabase()
  const logger = getDbLogger()
  const start = Date.now()
  let opCount = 0

  return transactionContext.run({ depth }, async () => {
    incrementActiveTransactions()
    if (depth > 1) {
      logger.logTransaction("start", undefined, { warning: "nested-transaction" })
    } else {
      logger.logTransaction("start")
    }

    try {
      const result = await db.transaction((txDb) =>
        fn(
          instrumentDatabase(txDb, {
            operationContext: "transaction",
            countOperation: () => {
              opCount += 1
            },
          }),
        ),
      )
      const duration = Date.now() - start
      if (duration > getTransactionWarnMs()) {
        logger.logTransaction("commit", duration, { warning: "slow-transaction", opCount })
      } else {
        logger.logTransaction("commit", duration, { opCount })
      }
      if (opCount > getTransactionWarnOps()) {
        console.warn(`Transaction operation count high (${opCount}).`)
      }
      return result
    } catch (error) {
      const duration = Date.now() - start
      logger.logTransaction("rollback", duration, { opCount })
      logDbError("transaction", error)
      throw error
    } finally {
      decrementActiveTransactions()
      if (depth === 1) {
        txMutex.release()
      }
    }
  })
}

export async function withRetryableTransaction<T>(
  fn: (db: Database) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0
  const start = Date.now()
  while (attempt < maxRetries) {
    try {
      return await withTransaction(fn)
    } catch (error) {
      attempt += 1
      const classification = classifySqliteError(error)
      if (!classification.retryable || attempt >= maxRetries) {
        throw error
      }
      const backoff = 300 * Math.pow(2, attempt - 1) + Math.random() * 200
      console.info(
        `Retrying transaction (attempt ${attempt}/${maxRetries}) after ${Math.round(backoff)}ms: ${classification.code ?? "unknown"}`,
      )
      await new Promise((resolve) => setTimeout(resolve, backoff))
      if (Date.now() - start > 15000) {
        throw new Error(`Transaction timed out after ${Date.now() - start}ms`)
      }
    }
  }
  throw new Error("Retryable transaction failed: retry loop exited unexpectedly")
}
