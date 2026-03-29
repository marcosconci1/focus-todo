type ValidationOptions = {
  allowDangerous?: boolean
  allowNamedParams?: boolean
  environment?: string
  operationName?: string
}

/**
 * Validates that SQL query placeholders match parameter count.
 * Adds defensive checks for risky patterns and performance pitfalls.
 */
export function validateQuery(sql: string, params: unknown[], options: ValidationOptions = {}): void {
  const environment = options.environment ?? process.env.NODE_ENV ?? "development"
  const isProduction = environment === "production"

  const placeholderCount = countPlaceholders(sql)
  const paramCount = Array.isArray(params) ? params.length : 0

  if (placeholderCount !== paramCount) {
    throw new Error(
      `Parameter count mismatch: SQL has ${placeholderCount} placeholders but ${paramCount} parameters provided.\n` +
        `SQL: ${summarizeSql(sql)}\n` +
        `Params: ${summarizeParams(params)}`,
    )
  }

  if (!options.allowNamedParams && hasNamedPlaceholders(sql)) {
    console.warn(
      "Warning: SQL query contains named parameter syntax. Use positional (?) instead.\n" +
        `SQL: ${summarizeSql(sql)}`,
    )
  }

  const trimmed = sql.trim()
  const upper = trimmed.toUpperCase()

  const hasInjectionPattern = /;|--|\/\*|\*\//.test(trimmed)
  if (hasInjectionPattern) {
    console.warn(`Warning: SQL contains suspicious comment/statement pattern. SQL: ${sql}`)
  }

  if (!options.allowDangerous && /(DROP|TRUNCATE)\s+TABLE/i.test(upper)) {
    throw new Error(`Dangerous SQL operation detected (${options.operationName ?? "unknown"}). SQL: ${sql}`)
  }

  if (/^UPDATE\s+/i.test(upper) || /^DELETE\s+/i.test(upper)) {
    const hasWhere = /\sWHERE\s/i.test(upper)
    if (!hasWhere) {
      const message = `Warning: SQL missing WHERE clause for ${upper.startsWith("UPDATE") ? "UPDATE" : "DELETE"}. SQL: ${sql}`
      if (isProduction) {
        throw new Error(message)
      } else {
        console.warn(message)
      }
    }
  }

  if (/^SELECT\s+\*/i.test(upper)) {
    console.warn(`Warning: SELECT * used. Consider selecting explicit columns. SQL: ${sql}`)
  }

  if (/\sJOIN\s/.test(upper) && !/\s(ON|CROSS\s+JOIN|NATURAL\s+JOIN)\s/.test(upper)) {
    console.warn(`Warning: JOIN detected without ON clause. SQL: ${sql}`)
  }

  const joinCount = (upper.match(/\sJOIN\s/g) || []).length
  const subqueryCount = (upper.match(/\(\s*SELECT\s/g) || []).length
  const complexity = joinCount + subqueryCount
  if (complexity >= 3) {
    console.warn(
      `Warning: Complex query detected (joins: ${joinCount}, subqueries: ${subqueryCount}). SQL: ${sql}`,
    )
  }
}

function countPlaceholders(sql: string): number {
  let count = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const next = sql[i + 1]

    if (!inDoubleQuote && char === "'") {
      if (inSingleQuote && next === "'") {
        i += 1
        continue
      }
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && char === '"') {
      if (inDoubleQuote && next === '"') {
        i += 1
        continue
      }
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      count += 1
    }
  }

  return count
}

function hasNamedPlaceholders(sql: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]
    const next = sql[i + 1]

    if (!inDoubleQuote && char === "'") {
      if (inSingleQuote && next === "'") {
        i += 1
        continue
      }
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && char === '"') {
      if (inDoubleQuote && next === '"') {
        i += 1
        continue
      }
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (inSingleQuote || inDoubleQuote) {
      continue
    }

    if ((char === ":" && next === ":") || next === undefined) {
      continue
    }

    if (char === ":" || char === "@" || char === "$") {
      if (/[A-Za-z0-9_]/.test(next ?? "")) {
        return true
      }
    }
  }

  return false
}

function summarizeSql(sql: string, maxLength = 200): string {
  const normalized = sql.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}…`
}

function summarizeParams(params: unknown[]): string {
  if (!Array.isArray(params)) {
    return "[]"
  }
  return JSON.stringify(
    params.map((param) => {
      if (param === null || param === undefined) return "null"
      if (typeof param === "string") return `string(${param.length})`
      if (typeof param === "number" || typeof param === "boolean" || typeof param === "bigint") return typeof param
      if (Array.isArray(param)) return `array(${param.length})`
      if (typeof param === "object") return "object"
      return typeof param
    }),
  )
}
