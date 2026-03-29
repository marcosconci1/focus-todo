import { getDatabase } from "@/lib/db/connection"
import {
  createWithDb as createAlertTemplateWithDb,
  deleteWithDb as deleteAlertTemplateWithDb,
  getAll as getAllAlertTemplates,
  getAllWithDb as getAllAlertTemplatesWithDb,
  getSupportedAlertTypesWithDb,
  updateWithDb as updateAlertTemplateWithDb,
} from "@/lib/db/repositories/alert-templates"
import {
  get as getAlertTracking,
  updateWithDb as updateAlertTrackingWithDb,
} from "@/lib/db/repositories/alert-tracking"
import {
  createWithDb as createCategoryWithDb,
  deleteCategoryWithDb,
  getAllWithTasks,
  getAllWithTasksWithDb,
  updateSortOrderWithDb as updateCategorySortOrderWithDb,
  updateWithDb as updateCategoryWithDb,
} from "@/lib/db/repositories/categories"
import {
  addEntryWithDb as addHistoryEntryWithDb,
  deleteByTaskIdWithDb,
  getAll as getAllHistory,
  getAllWithDb as getAllHistoryWithDb,
} from "@/lib/db/repositories/history"
import { get as getMetadata, updateMetadataWithDb } from "@/lib/db/repositories/metadata"
import { get as getSettings, updateWithDb as updateSettingsWithDb } from "@/lib/db/repositories/settings"
import {
  createWithDb as createTaskWithDb,
  deleteTaskWithDb,
  updateSortOrderWithDb as updateTaskSortOrderWithDb,
  updateWithDb as updateTaskWithDb,
} from "@/lib/db/repositories/tasks"
import { withRetryableTransaction } from "@/lib/db/repositories/transactions"
import { Category, type HistoryEntry, type GoogleCalendarEventFormat } from "./types"
import {
  DEFAULT_ALERT_TEMPLATES,
  DEFAULT_ALERT_TRACKING,
  type AlertAuthor,
  type AlertTemplate,
  type AlertTracking,
  type RealityCheckSettings,
} from "./alert-types"
import { autoBackupIfNeeded } from "@/lib/db/recovery"

export interface Database {
  userSettings: {
    theme?: string
    notifications?: boolean
    endOfDay?: string
    endOfDayTime?: string
    pomodoroMinutes?: number
    shortBreakMinutes?: number
    longBreakMinutes?: number
    longBreakEvery?: number
    completionSoundEnabled?: boolean
    completionSoundVolume?: number
    completionSoundFile?: string
    confettiEnabled?: boolean
    alertsEnabled?: boolean
    habitEndOfDayNudgesEnabled?: boolean
    alertCooldownMinutes?: number
    minMinutesBetweenAlerts?: number
    avoidSameAlertType?: boolean
    enableRealityChecks?: boolean
    realityCheckSettings?: RealityCheckSettings
    enableBreakReminders?: boolean
    enableElapsedTimeTracker?: boolean
    breakReminderIntervalMinutes?: number
    enableScreamMode?: boolean
    screamModeInactivityMinutes?: number
    screamModeAlertIntervalMinutes?: number
    screamModeSoundEnabled?: boolean
    alertSoundEnabled?: boolean
    alertSoundVolume?: number
    alertAuthor?: string
    authors?: AlertAuthor[]
    enableInactivityNudges?: boolean
    enableEndOfDayReminders?: boolean
    googleCalendarConnected?: boolean
    googleCalendarAutoSync?: boolean
    googleCalendarEventFormat?: GoogleCalendarEventFormat
    googleCalendarColorId?: string
    googleCalendarUserEmail?: string
    googleCalendarSyncOvertime?: boolean
    resetSessionCounterDaily?: boolean
  }
  categories: Category[]
  history?: HistoryEntry[]
  pendingCalendarUpdates?: Array<{
    eventId: string
    startTime: string
    durationMinutes: number
    description: string
    retryCount: number
    lastAttempt: number
  }>
  activeSessionState?: {
    isRunning: boolean
    sessionStarted: boolean
    timerMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK"
    sessionStartTime: number
    initialTime: number
    activeTaskId: string | null
    calendarEventId: string | null
    isOvertime: boolean
    overtimeSeconds: number
    pausedAt: number | null
    pausedTimeLeft: number | null
  }
  // alertTemplates are persisted separately to keep author assignments consistent across reloads.
  alertTemplates: AlertTemplate[]
  alertTracking: AlertTracking
  metadata?: {
    lastResetDate?: string
    version?: string
    createdAt?: string
  }
}

const parseActiveSessionState = (
  value: string | null | undefined,
): Database["activeSessionState"] | null => {
  if (!value || typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value) as Partial<NonNullable<Database["activeSessionState"]>>
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.sessionStartTime !== "number" || !Number.isFinite(parsed.sessionStartTime)) return null
    if (typeof parsed.isOvertime !== "boolean") return null
    if (typeof parsed.overtimeSeconds !== "number" || !Number.isFinite(parsed.overtimeSeconds)) return null
    const timerMode = parsed.timerMode
    if (timerMode !== "FOCUS" && timerMode !== "SHORT_BREAK" && timerMode !== "LONG_BREAK") return null
    if (parsed.activeTaskId !== null && typeof parsed.activeTaskId !== "string") return null
    if (parsed.calendarEventId !== null && typeof parsed.calendarEventId !== "string") return null

    return {
      isRunning: typeof parsed.isRunning === "boolean" ? parsed.isRunning : true,
      sessionStarted: typeof parsed.sessionStarted === "boolean" ? parsed.sessionStarted : true,
      timerMode,
      sessionStartTime: parsed.sessionStartTime,
      initialTime: typeof parsed.initialTime === "number" && Number.isFinite(parsed.initialTime) ? parsed.initialTime : 0,
      activeTaskId: parsed.activeTaskId ?? null,
      calendarEventId: parsed.calendarEventId ?? null,
      isOvertime: parsed.isOvertime,
      overtimeSeconds: parsed.overtimeSeconds,
      pausedAt: typeof parsed.pausedAt === "number" && Number.isFinite(parsed.pausedAt) ? parsed.pausedAt : null,
      pausedTimeLeft: typeof parsed.pausedTimeLeft === "number" && Number.isFinite(parsed.pausedTimeLeft) ? parsed.pausedTimeLeft : null,
    }
  } catch {
    return null
  }
}

const parsePendingCalendarUpdates = (
  value: string | null | undefined,
): Database["pendingCalendarUpdates"] => {
  if (!value || typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => {
      if (!entry || typeof entry !== "object") return false
      return (
        typeof entry.eventId === "string" &&
        typeof entry.startTime === "string" &&
        typeof entry.durationMinutes === "number" &&
        Number.isFinite(entry.durationMinutes) &&
        typeof entry.description === "string" &&
        typeof entry.retryCount === "number" &&
        Number.isFinite(entry.retryCount) &&
        typeof entry.lastAttempt === "number" &&
        Number.isFinite(entry.lastAttempt)
      )
    }) as Database["pendingCalendarUpdates"]
  } catch {
    return []
  }
}

const normalizeAlertTrackingFromDb = (value: unknown): AlertTracking => {
  const fallback = DEFAULT_ALERT_TRACKING
  if (!value || typeof value !== "object") return fallback

  const raw = value as Partial<AlertTracking>
  const firedAlertsToday = Array.isArray(raw.firedAlertsToday)
    ? raw.firedAlertsToday
        .filter(
          (entry): entry is { type: string; firedAt: string; hoursLeft?: number } =>
            Boolean(entry) && typeof entry.type === "string" && typeof entry.firedAt === "string",
        )
        .map((entry) => ({
          type: entry.type,
          firedAt: entry.firedAt,
          ...(typeof entry.hoursLeft === "number" ? { hoursLeft: entry.hoursLeft } : {}),
        }))
    : fallback.firedAlertsToday
  const realityCheckState =
    raw.realityCheckState &&
    typeof raw.realityCheckState === "object" &&
    (raw.realityCheckState.lastFiredAt === null || typeof raw.realityCheckState.lastFiredAt === "string") &&
    typeof raw.realityCheckState.firedCountToday === "number" &&
    Number.isFinite(raw.realityCheckState.firedCountToday)
      ? {
          lastFiredAt: raw.realityCheckState.lastFiredAt ?? null,
          firedCountToday: raw.realityCheckState.firedCountToday,
        }
      : fallback.realityCheckState

  return {
    lastSessionStartedAt:
      raw.lastSessionStartedAt === null || typeof raw.lastSessionStartedAt === "string"
        ? raw.lastSessionStartedAt
        : null,
    lastSessionEndedAt:
      raw.lastSessionEndedAt === null || typeof raw.lastSessionEndedAt === "string"
        ? raw.lastSessionEndedAt
        : null,
    lastSessionCompletedAt:
      raw.lastSessionCompletedAt === null || typeof raw.lastSessionCompletedAt === "string"
        ? raw.lastSessionCompletedAt
        : null,
    lastAlertFiredAt:
      raw.lastAlertFiredAt === null || typeof raw.lastAlertFiredAt === "string" ? raw.lastAlertFiredAt : null,
    lastRockyAlertAt:
      raw.lastRockyAlertAt === null || typeof raw.lastRockyAlertAt === "string" ? raw.lastRockyAlertAt : null,
    lastAdrianAlertAt:
      raw.lastAdrianAlertAt === null || typeof raw.lastAdrianAlertAt === "string" ? raw.lastAdrianAlertAt : null,
    lastTimekeeperAlertAt:
      raw.lastTimekeeperAlertAt === null || typeof raw.lastTimekeeperAlertAt === "string"
        ? raw.lastTimekeeperAlertAt
        : null,
    lastAlertType: raw.lastAlertType === null || typeof raw.lastAlertType === "string" ? raw.lastAlertType : null,
    lastAlertTemplateId:
      raw.lastAlertTemplateId === null || typeof raw.lastAlertTemplateId === "string"
        ? raw.lastAlertTemplateId
        : null,
    lastTaskCompletedAt:
      raw.lastTaskCompletedAt === null || typeof raw.lastTaskCompletedAt === "string"
        ? raw.lastTaskCompletedAt
        : null,
    lastBreakActivatedAt:
      raw.lastBreakActivatedAt === null || typeof raw.lastBreakActivatedAt === "string"
        ? raw.lastBreakActivatedAt
        : null,
    lastTimerStartAt:
      typeof raw.lastTimerStartAt === "number" && Number.isFinite(raw.lastTimerStartAt)
        ? raw.lastTimerStartAt
        : fallback.lastTimerStartAt,
    lastElapsedTimeAlertAt:
      typeof raw.lastElapsedTimeAlertAt === "number" && Number.isFinite(raw.lastElapsedTimeAlertAt)
        ? raw.lastElapsedTimeAlertAt
        : fallback.lastElapsedTimeAlertAt,
    screamModeActivatedAt:
      raw.screamModeActivatedAt === null || typeof raw.screamModeActivatedAt === "string"
        ? raw.screamModeActivatedAt
        : null,
    screamModeLastAlertAt:
      raw.screamModeLastAlertAt === null || typeof raw.screamModeLastAlertAt === "string"
        ? raw.screamModeLastAlertAt
        : null,
    breakReminderRound:
      typeof raw.breakReminderRound === "number" && Number.isFinite(raw.breakReminderRound)
        ? raw.breakReminderRound
        : fallback.breakReminderRound,
    globalSessionCounter:
      typeof raw.globalSessionCounter === "number" && Number.isFinite(raw.globalSessionCounter)
        ? raw.globalSessionCounter
        : fallback.globalSessionCounter,
    dismissedAlertsToday:
      typeof raw.dismissedAlertsToday === "number" && Number.isFinite(raw.dismissedAlertsToday)
        ? raw.dismissedAlertsToday
        : fallback.dismissedAlertsToday,
    distractionsToday:
      typeof raw.distractionsToday === "number" && Number.isFinite(raw.distractionsToday)
        ? raw.distractionsToday
        : fallback.distractionsToday,
    timeWasted:
      typeof raw.timeWasted === "number" && Number.isFinite(raw.timeWasted)
        ? raw.timeWasted
        : fallback.timeWasted,
    firedAlertsToday,
    realityCheckState,
  }
}

/**
 * Initialize the SQLite database if missing.
 */
export async function initializeDb(): Promise<void> {
  try {
    await getDatabase()
  } catch (error) {
    console.error("Failed to initialize database:", error)
    throw error
  }
}

/**
 * Read database data from SQLite repositories.
 */
export async function getDb(): Promise<Database> {
  const categories = await getAllWithTasks()
  const userSettings = await getSettings()
  const historyEntries = await getAllHistory()
  const alertTemplates = await getAllAlertTemplates()
  const alertTracking = await getAlertTracking()
  const metadata = await getMetadata()
  const activeSessionState = parseActiveSessionState(metadata.overtimeSessionState)
  const pendingCalendarUpdates = parsePendingCalendarUpdates(metadata.pendingCalendarUpdates)

  return {
    userSettings,
    categories,
    history: historyEntries.map((entry) => ({
      taskId: entry.taskId,
      completedAt: entry.completedAt,
      startTime: entry.startTime,
      duration: entry.duration,
      overtimeDuration: entry.overtimeDuration,
      calendarEventId: entry.calendarEventId,
    })),
    pendingCalendarUpdates,
    activeSessionState: activeSessionState ?? undefined,
    metadata: {
      lastResetDate: metadata.lastResetDate ?? undefined,
      version: metadata.version,
      createdAt: metadata.createdAt,
    },
    alertTemplates,
    alertTracking: normalizeAlertTrackingFromDb(alertTracking),
  }
}

/**
 * Persist the database to SQLite using repositories.
 * All writes are wrapped in a single transaction so failures roll back atomically.
 */
export async function saveDb(data: Database): Promise<void> {
  try {
    if (!Array.isArray(data.categories)) {
      throw new Error("Invalid database: categories must be an array")
    }
    const categoryIds = new Set<string>()
    const taskIds = new Set<string>()
    data.categories.forEach((category) => {
      if (!category || typeof category.id !== "string" || typeof category.name !== "string") {
        throw new Error("Invalid database: category id and name are required")
      }
      if (categoryIds.has(category.id)) {
        throw new Error(`Duplicate category id: ${category.id}`)
      }
      categoryIds.add(category.id)
      if (!Array.isArray(category.tasks)) {
        throw new Error(`Invalid database: category ${category.id} tasks must be an array`)
      }
      category.tasks.forEach((task) => {
        if (!task || typeof task.id !== "string" || typeof task.name !== "string") {
          throw new Error(`Invalid database: task id and name are required in category ${category.id}`)
        }
        if (taskIds.has(task.id)) {
          throw new Error(`Duplicate task id: ${task.id}`)
        }
        taskIds.add(task.id)
      })
    })

    const normalizedTracking = normalizeAlertTrackingFromDb(data.alertTracking)
    const incomingTemplates = Array.isArray(data.alertTemplates) ? data.alertTemplates : DEFAULT_ALERT_TEMPLATES
    const validTemplates = incomingTemplates.filter(
      (template): template is AlertTemplate => Boolean(template) && typeof template.id === "string",
    )
    const templateIds = new Set<string>()
    for (const template of validTemplates) {
      if (templateIds.has(template.id)) {
        throw new Error(`Duplicate alert template id: ${template.id}`)
      }
      templateIds.add(template.id)
    }
    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : null

    // Transaction ensures categories, tasks, history, and settings update atomically.
    await withRetryableTransaction(async (db) => {
      await updateSettingsWithDb(db, data.userSettings || {})

      const existingCategories = await getAllWithTasksWithDb(db)
      const existingCategoryMap = new Map(existingCategories.map((category) => [category.id, category]))
      const incomingCategoryIds = new Set(data.categories.map((category) => category.id))
      const deleteCandidates = existingCategories.filter((category) => !incomingCategoryIds.has(category.id)).length

      // Safety net: refuse to wipe all categories when the database has existing data.
      // This prevents bugs where a save is triggered with empty categories before the
      // database has been loaded into memory. The rest of the save (settings, tracking,
      // metadata) still proceeds — only category deletion is blocked.
      if (data.categories.length === 0 && existingCategories.length > 0) {
        console.warn(
          `saveDb: Skipping category sync — incoming categories is empty but database has ${existingCategories.length} categories. ` +
          "Preserving existing categories. Settings and metadata will still be saved.",
        )
      } else {
        if (deleteCandidates > 100) {
          await autoBackupIfNeeded("large-delete", deleteCandidates)
        }

        for (const category of existingCategories) {
          if (!incomingCategoryIds.has(category.id)) {
            await deleteCategoryWithDb(db, category.id)
          }
        }
      }

      for (const [categoryIndex, category] of data.categories.entries()) {
        if (existingCategoryMap.has(category.id)) {
          await updateCategoryWithDb(db, category.id, category)
        } else {
          await createCategoryWithDb(db, category)
        }
        await updateCategorySortOrderWithDb(db, category.id, categoryIndex)

        const existingTasks = existingCategoryMap.get(category.id)?.tasks ?? []
        const existingTaskIds = new Set(existingTasks.map((task) => task.id))
        const incomingTasks = Array.isArray(category.tasks) ? category.tasks : []
        const incomingTaskIds = new Set(incomingTasks.map((task) => task.id))

        for (const task of existingTasks) {
          if (!incomingTaskIds.has(task.id)) {
            await deleteTaskWithDb(db, task.id)
          }
        }

        for (const [taskIndex, task] of incomingTasks.entries()) {
          if (existingTaskIds.has(task.id)) {
            await updateTaskWithDb(db, task.id, task)
          } else {
            await createTaskWithDb(db, category.id, task)
          }
          await updateTaskSortOrderWithDb(db, task.id, taskIndex)
        }
      }

      const validTaskIds = new Set(
        data.categories.flatMap((category) => (Array.isArray(category.tasks) ? category.tasks.map((task) => task.id) : [])),
      )
      const desiredHistory = Array.isArray(data.history) ? data.history : []
      const desiredHistoryByTask = new Map<string, HistoryEntry[]>()
      desiredHistory.forEach((entry) => {
        if (!validTaskIds.has(entry.taskId)) return
        const list = desiredHistoryByTask.get(entry.taskId) ?? []
        list.push({
          completedAt: entry.completedAt,
          startTime: entry.startTime,
          duration: entry.duration,
          overtimeDuration: entry.overtimeDuration,
          calendarEventId: entry.calendarEventId,
          taskId: entry.taskId,
        })
        desiredHistoryByTask.set(entry.taskId, list)
      })

      const existingHistory = await getAllHistoryWithDb(db)
      const existingHistoryTaskIds = new Set(existingHistory.map((entry) => entry.taskId))
      const desiredHistoryTaskIds = new Set(desiredHistoryByTask.keys())
      if (existingHistory.length > 1000 && existingHistoryTaskIds.size > desiredHistoryTaskIds.size) {
        await autoBackupIfNeeded("large-delete", existingHistory.length)
      }

      for (const taskId of existingHistoryTaskIds) {
        if (!desiredHistoryTaskIds.has(taskId)) {
          await deleteByTaskIdWithDb(db, taskId)
        }
      }

      for (const [taskId, entries] of desiredHistoryByTask.entries()) {
        await deleteByTaskIdWithDb(db, taskId)
        for (const entry of entries) {
          await addHistoryEntryWithDb(
            db,
            taskId,
            entry.completedAt,
            entry.duration,
            entry.overtimeDuration,
            entry.startTime,
            entry.calendarEventId,
          )
        }
      }

      await updateAlertTrackingWithDb(db, normalizedTracking)

      const supportedTypes = await getSupportedAlertTypesWithDb(db)
      const unsupportedTypes = new Set<string>()
      const filteredTemplates = validTemplates.filter((template) => {
        if (!supportedTypes.includes(template.type)) {
          unsupportedTypes.add(template.type)
          return false
        }
        return true
      })
      if (unsupportedTypes.size > 0) {
        console.warn("Skipping unsupported alert template types for current schema:", [
          ...unsupportedTypes,
        ])
      }

      const existingTemplates = await getAllAlertTemplatesWithDb(db)
      const existingTemplateMap = new Map(existingTemplates.map((template) => [template.id, template]))
      const incomingTemplateIds = new Set(filteredTemplates.map((template) => template.id))

      for (const template of existingTemplates) {
        if (!incomingTemplateIds.has(template.id)) {
          await deleteAlertTemplateWithDb(db, template.id)
        }
      }

      for (const template of filteredTemplates) {
        if (existingTemplateMap.has(template.id)) {
          await updateAlertTemplateWithDb(db, template.id, template)
        } else {
          await createAlertTemplateWithDb(db, template)
        }
      }

      if (metadata) {
        const metadataUpdates: {
          lastResetDate?: string | null
          version?: string
          createdAt?: string
          overtimeSessionState?: string | null
          pendingCalendarUpdates?: string | null
        } = {}

        if (metadata.lastResetDate !== undefined) {
          metadataUpdates.lastResetDate = metadata.lastResetDate ?? null
        }
        if (metadata.version !== undefined) {
          metadataUpdates.version = metadata.version
        }
        if (metadata.createdAt !== undefined) {
          metadataUpdates.createdAt = metadata.createdAt
        }
        if (data.activeSessionState !== undefined) {
          try {
            metadataUpdates.overtimeSessionState = data.activeSessionState
              ? JSON.stringify(data.activeSessionState)
              : null
          } catch (error) {
            console.error("Failed to serialize active session state:", error)
          }
        }
        if (data.pendingCalendarUpdates !== undefined) {
          try {
            metadataUpdates.pendingCalendarUpdates = data.pendingCalendarUpdates
              ? JSON.stringify(data.pendingCalendarUpdates)
              : null
          } catch (error) {
            console.error("Failed to serialize pending calendar updates:", error)
          }
        }

        if (Object.keys(metadataUpdates).length > 0) {
          await updateMetadataWithDb(db, metadataUpdates)
        }
      }
    }, 5)
  } catch (error) {
    console.error("Failed to save database:", error)
    throw error
  }
}
