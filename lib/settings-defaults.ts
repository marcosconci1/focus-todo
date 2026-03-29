import type { AlertAuthor, RealityCheckSettings } from "@/lib/alert-types"
import type { GoogleCalendarEventFormat } from "@/lib/types"
import { DEFAULT_ADRIAN_AUTHOR, DEFAULT_ROCKY_AUTHOR, DEFAULT_TIMEKEEPER_AUTHOR } from "@/lib/alert-types"

export interface NudgeSettings {
  enableInactivityNudges: boolean
  enableEndOfDayReminders: boolean
  endOfDayTime: string // Format: "HH:MM" (24-hour)
  pomodoroMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
  completionSoundEnabled: boolean
  completionSoundVolume: number
  completionSoundFile: string
  confettiEnabled: boolean
  alertsEnabled: boolean
  habitEndOfDayNudgesEnabled: boolean
  alertCooldownMinutes: number
  minMinutesBetweenAlerts: number
  avoidSameAlertType: boolean
  enableRealityChecks: boolean
  realityCheckSettings: RealityCheckSettings
  enableBreakReminders: boolean
  breakReminderIntervalMinutes: number
  enableElapsedTimeTracker: boolean
  enableScreamMode: boolean
  screamModeInactivityMinutes: number
  screamModeAlertIntervalMinutes: number
  screamModeSoundEnabled: boolean
  alertSoundEnabled: boolean
  alertSoundVolume: number
  alertAuthor: string
  authors: AlertAuthor[]
  googleCalendarConnected: boolean
  googleCalendarAutoSync: boolean
  googleCalendarSyncOvertime: boolean
  googleCalendarEventFormat: GoogleCalendarEventFormat
  googleCalendarColorId: string
  googleCalendarUserEmail: string
  resetSessionCounterDaily: boolean
}

export const DEFAULT_SETTINGS: NudgeSettings = {
  enableInactivityNudges: true,
  enableEndOfDayReminders: true,
  endOfDayTime: "20:00",
  pomodoroMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  completionSoundEnabled: true,
  completionSoundVolume: 0.2,
  completionSoundFile: "generated",
  confettiEnabled: true,
  alertsEnabled: true,
  habitEndOfDayNudgesEnabled: true,
  alertCooldownMinutes: 60,
  minMinutesBetweenAlerts: 15,
  avoidSameAlertType: true,
  enableRealityChecks: true,
  realityCheckSettings: { minMinutesBetween: 45, maxPerDay: 3 },
  enableBreakReminders: true,
  breakReminderIntervalMinutes: 5,
  enableElapsedTimeTracker: false,
  enableScreamMode: false,
  screamModeInactivityMinutes: 15,
  screamModeAlertIntervalMinutes: 5,
  screamModeSoundEnabled: true,
  alertSoundEnabled: true,
  alertSoundVolume: 0.3,
  alertAuthor: "@Rocky",
  authors: [DEFAULT_ROCKY_AUTHOR, DEFAULT_ADRIAN_AUTHOR, DEFAULT_TIMEKEEPER_AUTHOR],
  googleCalendarConnected: false,
  // Auto-sync is mandatory when connected.
  googleCalendarAutoSync: true,
  googleCalendarSyncOvertime: true,
  googleCalendarEventFormat: "emoji",
  googleCalendarColorId: "11",
  googleCalendarUserEmail: "",
  resetSessionCounterDaily: false,
}
