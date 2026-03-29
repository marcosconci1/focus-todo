type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "OTHER"

type MetricsSnapshot = {
  queryCount: number
  queryCountByType: Record<QueryType, number>
  queryDurationMs: {
    avg: number
    p50: number
    p95: number
    p99: number
    max: number
  }
  slowQueryCount: number
  transactionCount: number
  transactionFailures: number
  transactionDurationMs: {
    avg: number
    p95: number
    max: number
  }
  activeTransactions: number
  errorCount: number
  errorCountByCode: Record<string, number>
  lastUpdatedAt: string
}

const MAX_SAMPLES = 2000
const DEFAULT_SLOW_QUERY_MS = process.env.NODE_ENV === "production" ? 1000 : 100

const queryDurations: number[] = []
const transactionDurations: number[] = []
const queryCountByType: Record<QueryType, number> = {
  SELECT: 0,
  INSERT: 0,
  UPDATE: 0,
  DELETE: 0,
  OTHER: 0,
}
const errorCountByCode: Record<string, number> = {}
let slowQueryCount = 0
let transactionCount = 0
let transactionFailures = 0
let activeTransactions = 0
let lastUpdatedAt = new Date().toISOString()

const getQueryType = (sql: string): QueryType => {
  const trimmed = sql.trim().toUpperCase()
  if (trimmed.startsWith("SELECT")) return "SELECT"
  if (trimmed.startsWith("INSERT")) return "INSERT"
  if (trimmed.startsWith("UPDATE")) return "UPDATE"
  if (trimmed.startsWith("DELETE")) return "DELETE"
  return "OTHER"
}

const recordSample = (store: number[], value: number) => {
  store.push(value)
  if (store.length > MAX_SAMPLES) {
    store.splice(0, store.length - MAX_SAMPLES)
  }
}

const percentile = (values: number[], pct: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * pct))
  return sorted[index]
}

export function recordQuery(sql: string, durationMs: number): void {
  const type = getQueryType(sql)
  queryCountByType[type] += 1
  recordSample(queryDurations, durationMs)
  if (durationMs >= DEFAULT_SLOW_QUERY_MS) {
    slowQueryCount += 1
  }
  lastUpdatedAt = new Date().toISOString()
}

export function recordError(code: string | null): void {
  if (code) {
    errorCountByCode[code] = (errorCountByCode[code] ?? 0) + 1
  } else {
    errorCountByCode["UNKNOWN"] = (errorCountByCode["UNKNOWN"] ?? 0) + 1
  }
  lastUpdatedAt = new Date().toISOString()
}

export function recordTransaction(durationMs: number, success: boolean): void {
  transactionCount += 1
  if (!success) {
    transactionFailures += 1
  }
  recordSample(transactionDurations, durationMs)
  lastUpdatedAt = new Date().toISOString()
}

export function incrementActiveTransactions(): void {
  activeTransactions += 1
  lastUpdatedAt = new Date().toISOString()
}

export function decrementActiveTransactions(): void {
  activeTransactions = Math.max(0, activeTransactions - 1)
  lastUpdatedAt = new Date().toISOString()
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const queryCount =
    queryCountByType.SELECT +
    queryCountByType.INSERT +
    queryCountByType.UPDATE +
    queryCountByType.DELETE +
    queryCountByType.OTHER
  const avgQuery = queryDurations.length === 0 ? 0 : Math.round(queryDurations.reduce((sum, v) => sum + v, 0) / queryDurations.length)
  const avgTransaction =
    transactionDurations.length === 0
      ? 0
      : Math.round(transactionDurations.reduce((sum, v) => sum + v, 0) / transactionDurations.length)

  return {
    queryCount,
    queryCountByType: { ...queryCountByType },
    queryDurationMs: {
      avg: avgQuery,
      p50: percentile(queryDurations, 0.5),
      p95: percentile(queryDurations, 0.95),
      p99: percentile(queryDurations, 0.99),
      max: queryDurations.length ? Math.max(...queryDurations) : 0,
    },
    slowQueryCount,
    transactionCount,
    transactionFailures,
    transactionDurationMs: {
      avg: avgTransaction,
      p95: percentile(transactionDurations, 0.95),
      max: transactionDurations.length ? Math.max(...transactionDurations) : 0,
    },
    activeTransactions,
    errorCount: Object.values(errorCountByCode).reduce((sum, value) => sum + value, 0),
    errorCountByCode: { ...errorCountByCode },
    lastUpdatedAt,
  }
}

export function formatMetricsPrometheus(snapshot: MetricsSnapshot): string {
  const lines: string[] = []
  lines.push(`# HELP db_query_count Total number of database queries.`)
  lines.push(`# TYPE db_query_count counter`)
  lines.push(`db_query_count ${snapshot.queryCount}`)
  lines.push(`# HELP db_query_duration_ms Query durations in milliseconds.`)
  lines.push(`# TYPE db_query_duration_ms gauge`)
  lines.push(`db_query_duration_ms{quantile="0.5"} ${snapshot.queryDurationMs.p50}`)
  lines.push(`db_query_duration_ms{quantile="0.95"} ${snapshot.queryDurationMs.p95}`)
  lines.push(`db_query_duration_ms{quantile="0.99"} ${snapshot.queryDurationMs.p99}`)
  lines.push(`db_query_duration_ms{stat="avg"} ${snapshot.queryDurationMs.avg}`)
  lines.push(`db_query_duration_ms{stat="max"} ${snapshot.queryDurationMs.max}`)
  lines.push(`# HELP db_slow_query_count Number of slow queries.`)
  lines.push(`# TYPE db_slow_query_count counter`)
  lines.push(`db_slow_query_count ${snapshot.slowQueryCount}`)
  lines.push(`# HELP db_transaction_count Total number of transactions.`)
  lines.push(`# TYPE db_transaction_count counter`)
  lines.push(`db_transaction_count ${snapshot.transactionCount}`)
  lines.push(`# HELP db_transaction_failures Total number of failed transactions.`)
  lines.push(`# TYPE db_transaction_failures counter`)
  lines.push(`db_transaction_failures ${snapshot.transactionFailures}`)
  lines.push(`# HELP db_transaction_duration_ms Transaction durations in milliseconds.`)
  lines.push(`# TYPE db_transaction_duration_ms gauge`)
  lines.push(`db_transaction_duration_ms{quantile="0.95"} ${snapshot.transactionDurationMs.p95}`)
  lines.push(`db_transaction_duration_ms{stat="avg"} ${snapshot.transactionDurationMs.avg}`)
  lines.push(`db_transaction_duration_ms{stat="max"} ${snapshot.transactionDurationMs.max}`)
  lines.push(`# HELP db_active_transactions Number of active transactions.`)
  lines.push(`# TYPE db_active_transactions gauge`)
  lines.push(`db_active_transactions ${snapshot.activeTransactions}`)
  lines.push(`# HELP db_error_count Total number of errors.`)
  lines.push(`# TYPE db_error_count counter`)
  lines.push(`db_error_count ${snapshot.errorCount}`)

  for (const [type, count] of Object.entries(snapshot.queryCountByType)) {
    lines.push(`db_query_count_by_type{type="${type}"} ${count}`)
  }
  for (const [code, count] of Object.entries(snapshot.errorCountByCode)) {
    lines.push(`db_error_count_by_code{code="${code}"} ${count}`)
  }

  return lines.join("\n")
}
