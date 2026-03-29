import type { Database } from "@/lib/storage"

const LOCAL_STORAGE_KEY = "focus-todo-active-session"
const OLD_LOCAL_STORAGE_KEY = "focus-todo-overtime-session"

export type ActiveSessionState = NonNullable<Database["activeSessionState"]>

const parseActiveSessionState = (
  value: string | null,
): ActiveSessionState | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ActiveSessionState>
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.isRunning !== "boolean") return null
    if (typeof parsed.sessionStarted !== "boolean") return null
    if (typeof parsed.sessionStartTime !== "number" || !Number.isFinite(parsed.sessionStartTime)) return null
    if (typeof parsed.initialTime !== "number" || !Number.isFinite(parsed.initialTime)) return null
    if (typeof parsed.isOvertime !== "boolean") return null
    if (typeof parsed.overtimeSeconds !== "number" || !Number.isFinite(parsed.overtimeSeconds)) return null
    if (parsed.activeTaskId !== null && parsed.activeTaskId !== undefined && typeof parsed.activeTaskId !== "string") return null
    if (parsed.calendarEventId !== null && parsed.calendarEventId !== undefined && typeof parsed.calendarEventId !== "string") return null
    if (parsed.timerMode !== "FOCUS" && parsed.timerMode !== "SHORT_BREAK" && parsed.timerMode !== "LONG_BREAK") {
      return null
    }
    if (parsed.pausedAt !== null && parsed.pausedAt !== undefined && (typeof parsed.pausedAt !== "number" || !Number.isFinite(parsed.pausedAt))) return null
    if (parsed.pausedTimeLeft !== null && parsed.pausedTimeLeft !== undefined && (typeof parsed.pausedTimeLeft !== "number" || !Number.isFinite(parsed.pausedTimeLeft))) return null

    return {
      isRunning: parsed.isRunning,
      sessionStarted: parsed.sessionStarted,
      timerMode: parsed.timerMode,
      sessionStartTime: parsed.sessionStartTime,
      initialTime: parsed.initialTime,
      activeTaskId: parsed.activeTaskId ?? null,
      calendarEventId: parsed.calendarEventId ?? null,
      isOvertime: parsed.isOvertime,
      overtimeSeconds: parsed.overtimeSeconds,
      pausedAt: parsed.pausedAt ?? null,
      pausedTimeLeft: parsed.pausedTimeLeft ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Migrate old overtime-only localStorage entry to the new active session format.
 */
const migrateOldOvertimeState = (): ActiveSessionState | null => {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(OLD_LOCAL_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.isOvertime !== "boolean" || !parsed.isOvertime) return null
    if (typeof parsed.overtimeSeconds !== "number" || !Number.isFinite(parsed.overtimeSeconds)) return null
    if (typeof parsed.sessionStartTime !== "number" || !Number.isFinite(parsed.sessionStartTime)) return null
    const timerMode = parsed.timerMode as string
    if (timerMode !== "FOCUS" && timerMode !== "SHORT_BREAK" && timerMode !== "LONG_BREAK") return null

    // Remove old key
    window.localStorage.removeItem(OLD_LOCAL_STORAGE_KEY)

    return {
      isRunning: true,
      sessionStarted: true,
      timerMode: timerMode as ActiveSessionState["timerMode"],
      sessionStartTime: parsed.sessionStartTime as number,
      initialTime: 0, // unknown from old format, will be computed from settings on restore
      activeTaskId: (typeof parsed.activeTaskId === "string" ? parsed.activeTaskId : null),
      calendarEventId: (typeof parsed.calendarEventId === "string" ? parsed.calendarEventId : null),
      isOvertime: true,
      overtimeSeconds: parsed.overtimeSeconds as number,
      pausedAt: null,
      pausedTimeLeft: null,
    }
  } catch {
    return null
  }
}

export function saveSessionToLocalStorage(state: ActiveSessionState | null): void {
  if (typeof window === "undefined") return
  try {
    if (!state) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error("Failed to save session state to localStorage:", error)
  }
}

export function loadSessionFromLocalStorage(): ActiveSessionState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    const state = parseActiveSessionState(raw)
    if (state) return state
    // Fall back to migrating old overtime-only format
    return migrateOldOvertimeState()
  } catch (error) {
    console.error("Failed to load session state from localStorage:", error)
    return null
  }
}

export function clearSessionFromLocalStorage(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY)
    // Also clean up old key if it still exists
    window.localStorage.removeItem(OLD_LOCAL_STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear session state from localStorage:", error)
  }
}
