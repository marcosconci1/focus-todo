import assert from "node:assert/strict"
import test from "node:test"
import { classifySqliteError, wrapDbError } from "../lib/db/errors"
import { getDbLogger } from "../lib/db/logger"
import { withRetryableTransaction } from "../lib/db/repositories/transactions"
import { getCircuitBreakerUntil, shouldOpenCircuitBreaker } from "../lib/db/retry-utils"

const makeError = (code: string) => {
  const error = new Error(code) as Error & { code?: string }
  error.code = code
  return error
}

test("classifySqliteError maps codes", () => {
  const busy = classifySqliteError(makeError("SQLITE_BUSY"))
  assert.equal(busy.category, "transient")
  assert.equal(busy.retryable, true)

  const corrupt = classifySqliteError(makeError("SQLITE_CORRUPT"))
  assert.equal(corrupt.category, "permanent")
  assert.equal(corrupt.retryable, false)

  const unknown = classifySqliteError(new Error("unknown"))
  assert.equal(unknown.category, "unknown")
})

test("wrapDbError preserves code and retryability", () => {
  const base = makeError("SQLITE_LOCKED")
  const wrapped = wrapDbError("test", base) as Error & { code?: string; retryable?: boolean }
  assert.equal(wrapped.code, "SQLITE_LOCKED")
  assert.equal(wrapped.retryable, true)
})

test("wrapDbError emits structured logs", () => {
  const logger = getDbLogger()
  const before = logger.getEntries().length
  try {
    throw makeError("SQLITE_RANGE")
  } catch (error) {
    wrapDbError("log-test", error)
  }
  const after = logger.getEntries().length
  assert.ok(after > before, "Expected at least one log entry to be added")
})

test("withRetryableTransaction retries on transient errors", async () => {
  let attempt = 0
  const result = await withRetryableTransaction(async () => {
    attempt += 1
    if (attempt < 2) {
      throw makeError("SQLITE_BUSY")
    }
    return "ok"
  })
  assert.equal(result, "ok")
  assert.equal(attempt, 2)
})

test("circuit breaker opens after threshold", () => {
  const threshold = 5
  assert.equal(shouldOpenCircuitBreaker(4, threshold), false)
  assert.equal(shouldOpenCircuitBreaker(5, threshold), true)
  const now = Date.now()
  const until = getCircuitBreakerUntil(now, 60000)
  assert.ok(until > now)
})
