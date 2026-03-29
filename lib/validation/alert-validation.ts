import { DEFAULT_ALERT_TRACKING, type AlertTracking } from "@/lib/alert-types"
import type { Database } from "@/lib/storage"

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ALERT_TEMPLATE_TYPES = new Set([
  "INACTIVITY",
  "HABITS_ENDING_DAY",
  "END_OF_DAY_COUNTDOWN",
  "REALITY_CHECKS",
  "BREAK_REMINDER",
  "ELAPSED_TIME",
])

export const isValidAlertTracking = (value: unknown): value is AlertTracking => {
  if (!value || typeof value !== "object") return false
  const tracking = value as AlertTracking
  const isNullableString = (field: unknown) =>
    field === undefined || field === null || typeof field === "string"
  const isIsoOrNull = (field: unknown) =>
    field === undefined || field === null || (typeof field === "string" && ISO_TIMESTAMP_PATTERN.test(field))

  if (!isIsoOrNull(tracking.lastSessionStartedAt)) return false
  if (!isIsoOrNull(tracking.lastSessionEndedAt)) return false
  if (!isIsoOrNull(tracking.lastAlertFiredAt)) return false
  if (!isNullableString(tracking.lastAlertType)) return false
  if (!isNullableString(tracking.lastAlertTemplateId)) return false
  if (!isIsoOrNull(tracking.lastTaskCompletedAt)) return false
  if (!isIsoOrNull(tracking.lastBreakActivatedAt)) return false
  if (!isIsoOrNull(tracking.screamModeActivatedAt)) return false
  if (!isIsoOrNull(tracking.screamModeLastAlertAt)) return false
  if (
    tracking.breakReminderRound !== undefined &&
    (typeof tracking.breakReminderRound !== "number" || !Number.isFinite(tracking.breakReminderRound))
  ) {
    return false
  }
  if (
    tracking.globalSessionCounter !== undefined &&
    (typeof tracking.globalSessionCounter !== "number" || !Number.isFinite(tracking.globalSessionCounter))
  ) {
    return false
  }
  if (typeof tracking.dismissedAlertsToday !== "number" || !Number.isFinite(tracking.dismissedAlertsToday)) return false
  if (
    tracking.distractionsToday !== undefined &&
    (typeof tracking.distractionsToday !== "number" || !Number.isFinite(tracking.distractionsToday))
  ) {
    return false
  }
  if (
    tracking.timeWasted !== undefined &&
    (typeof tracking.timeWasted !== "number" || !Number.isFinite(tracking.timeWasted))
  ) {
    return false
  }
  if (!Array.isArray(tracking.firedAlertsToday)) return false
  if (tracking.realityCheckState !== undefined) {
    if (!tracking.realityCheckState || typeof tracking.realityCheckState !== "object") return false
    const state = tracking.realityCheckState as { lastFiredAt?: unknown; firedCountToday?: unknown }
    const lastFiredAt = state.lastFiredAt
    if (!isIsoOrNull(lastFiredAt)) return false
    if (state.firedCountToday !== undefined && (typeof state.firedCountToday !== "number" || !Number.isFinite(state.firedCountToday))) return false
  }

  for (const entry of tracking.firedAlertsToday) {
    if (!entry || typeof entry.type !== "string" || typeof entry.firedAt !== "string") {
      return false
    }
    if (entry.hoursLeft !== undefined && !Number.isFinite(entry.hoursLeft)) {
      return false
    }
  }

  return true
}

export const resolveReasonFromCode = (code: string | null, message: string): string => {
  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return "locked"
  if (code === "SQLITE_CORRUPT") return "corrupt"
  if (code === "SQLITE_CANTOPEN") return "permission"
  if (code === "SQLITE_CONSTRAINT") return "constraint"
  if (code === "SQLITE_IOERR") return "io"
  if (code === "SQLITE_FULL") return "full"
  if (code === "SQLITE_READONLY") return "readonly"
  if (code === "SQLITE_RANGE") return "range"
  if (code === "SQLITE_MISMATCH") return "mismatch"
  if (code === "SQLITE_NOTADB") return "notadb"
  if (
    code === "SQLITE_ERROR" &&
    (message.includes("no such table") ||
      message.includes("no such column") ||
      message.includes("has no column named") ||
      message.includes("malformed") ||
      message.includes("schema"))
  ) {
    return "schema"
  }
  if (message.includes("connection")) return "connection"
  if (message.includes("schema")) return "schema"
  if (message.includes("permission")) return "permission"
  return "unknown"
}

export const validateAlertTemplates = (value: unknown): string | null => {
  if (!Array.isArray(value)) {
    return "Invalid alert templates payload"
  }

  const templateIds = new Set<string>()
  for (const template of value) {
    if (!template || typeof template !== "object") {
      return "Invalid alert templates payload"
    }
    const entry = template as {
      id?: unknown
      type?: unknown
      title?: unknown
      message?: unknown
      enabled?: unknown
      authorId?: unknown
    }
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
      return "Invalid alert templates payload"
    }
    if (templateIds.has(entry.id)) {
      return "duplicate-id"
    }
    templateIds.add(entry.id)
    if (typeof entry.type !== "string" || !ALERT_TEMPLATE_TYPES.has(entry.type)) {
      return "Invalid alert templates payload"
    }
    if (typeof entry.title !== "string" || entry.title.trim().length === 0) {
      return "Invalid alert templates payload"
    }
    if (typeof entry.message !== "string" || entry.message.trim().length === 0) {
      return "Invalid alert templates payload"
    }
    if (typeof entry.authorId !== "string" || entry.authorId.trim().length === 0) {
      return "Invalid alert templates payload"
    }
    if (typeof entry.enabled !== "boolean") {
      return "Invalid alert templates payload"
    }
  }

  return null
}

export const validateDatabase = (data: Database): string | null => {
  if (!data || !Array.isArray(data.categories)) {
    return "Invalid database payload"
  }
  const categoryIds = new Set<string>()
  const taskIds = new Set<string>()
  for (const category of data.categories) {
    if (
      !category ||
      typeof category.id !== "string" ||
      typeof category.name !== "string" ||
      typeof category.color !== "string" ||
      !Array.isArray(category.tasks)
    ) {
      return "Invalid category payload"
    }
    if (category.isHabitProject !== undefined && typeof category.isHabitProject !== "boolean") {
      return "Invalid category payload"
    }
    if (
      category.projectType !== undefined &&
      category.projectType !== "project" &&
      category.projectType !== "habit" &&
      category.projectType !== "work"
    ) {
      return "Invalid category payload"
    }
    for (const task of category.tasks) {
      if (
        !task ||
        typeof task.id !== "string" ||
        typeof task.name !== "string" ||
        typeof task.completed !== "boolean" ||
        typeof task.dailyGoal !== "number" ||
        typeof task.currentProgress !== "number" ||
        typeof task.emoji !== "string"
      ) {
        return "Invalid task payload"
      }
      if (taskIds.has(task.id)) {
        return "duplicate-id"
      }
      taskIds.add(task.id)
    }
    if (categoryIds.has(category.id)) {
      return "duplicate-id"
    }
    categoryIds.add(category.id)
  }

  if (data.alertTracking !== undefined && data.alertTracking !== null && !isValidAlertTracking(data.alertTracking)) {
    return "Invalid alert tracking payload"
  }

  const alertTemplatesError = validateAlertTemplates(data.alertTemplates)
  if (alertTemplatesError) {
    return alertTemplatesError
  }

  return null
}

/** Returns data with alertTracking defaulted if missing. Does not mutate the input. */
export const normalizeAlertTracking = (data: Database): Database => {
  if (data.alertTracking === undefined || data.alertTracking === null) {
    return { ...data, alertTracking: DEFAULT_ALERT_TRACKING }
  }
  return data
}
