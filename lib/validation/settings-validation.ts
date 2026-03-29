import { DEFAULT_SETTINGS, type NudgeSettings } from "@/lib/settings-defaults"
import { DEFAULT_TIMEKEEPER_AUTHOR, type AlertAuthor } from "@/lib/alert-types"
import type { Database } from "@/lib/storage"

const BOUNDS = {
  pomodoroMinutes: { min: 1, max: 999 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 120 },
} as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const normalizeUserSettings = (raw: Database["userSettings"]): NudgeSettings => {
  const pomodoroMinutes =
    typeof raw?.pomodoroMinutes === "number" && Number.isFinite(raw.pomodoroMinutes)
      ? clamp(raw.pomodoroMinutes, BOUNDS.pomodoroMinutes.min, BOUNDS.pomodoroMinutes.max)
      : DEFAULT_SETTINGS.pomodoroMinutes
  const shortBreakMinutes =
    typeof raw?.shortBreakMinutes === "number" && Number.isFinite(raw.shortBreakMinutes)
      ? clamp(raw.shortBreakMinutes, BOUNDS.shortBreakMinutes.min, BOUNDS.shortBreakMinutes.max)
      : DEFAULT_SETTINGS.shortBreakMinutes
  const longBreakMinutes =
    typeof raw?.longBreakMinutes === "number" && Number.isFinite(raw.longBreakMinutes)
      ? clamp(raw.longBreakMinutes, BOUNDS.longBreakMinutes.min, BOUNDS.longBreakMinutes.max)
      : DEFAULT_SETTINGS.longBreakMinutes
  const longBreakEveryRaw =
    typeof raw?.longBreakEvery === "number" && Number.isFinite(raw.longBreakEvery)
      ? raw.longBreakEvery
      : DEFAULT_SETTINGS.longBreakEvery
  const longBreakEvery = Math.max(1, Math.round(longBreakEveryRaw))
  const completionSoundEnabled =
    typeof raw?.completionSoundEnabled === "boolean"
      ? raw.completionSoundEnabled
      : DEFAULT_SETTINGS.completionSoundEnabled
  const confettiEnabled =
    typeof raw?.confettiEnabled === "boolean" ? raw.confettiEnabled : DEFAULT_SETTINGS.confettiEnabled
  const completionSoundVolumeRaw =
    typeof raw?.completionSoundVolume === "number" && Number.isFinite(raw.completionSoundVolume)
      ? raw.completionSoundVolume
      : DEFAULT_SETTINGS.completionSoundVolume
  const completionSoundVolume = Math.min(1, Math.max(0, completionSoundVolumeRaw))
  const completionSoundFile =
    typeof raw?.completionSoundFile === "string" && raw.completionSoundFile.trim().length > 0
      ? raw.completionSoundFile.trim()
      : DEFAULT_SETTINGS.completionSoundFile
  const alertsEnabled =
    typeof raw?.alertsEnabled === "boolean" ? raw.alertsEnabled : DEFAULT_SETTINGS.alertsEnabled
  const habitEndOfDayNudgesEnabled =
    typeof raw?.habitEndOfDayNudgesEnabled === "boolean"
      ? raw.habitEndOfDayNudgesEnabled
      : DEFAULT_SETTINGS.habitEndOfDayNudgesEnabled
  const alertCooldownMinutesRaw =
    typeof raw?.alertCooldownMinutes === "number" && Number.isFinite(raw.alertCooldownMinutes)
      ? raw.alertCooldownMinutes
      : DEFAULT_SETTINGS.alertCooldownMinutes
  const alertCooldownMinutes = Math.max(1, Math.round(alertCooldownMinutesRaw))
  const minMinutesBetweenAlertsRaw =
    typeof raw?.minMinutesBetweenAlerts === "number" && Number.isFinite(raw.minMinutesBetweenAlerts)
      ? raw.minMinutesBetweenAlerts
      : DEFAULT_SETTINGS.minMinutesBetweenAlerts
  const minMinutesBetweenAlerts = Math.max(1, Math.round(minMinutesBetweenAlertsRaw))
  const avoidSameAlertType =
    typeof raw?.avoidSameAlertType === "boolean"
      ? raw.avoidSameAlertType
      : DEFAULT_SETTINGS.avoidSameAlertType
  const alertAuthor =
    typeof raw?.alertAuthor === "string" && raw.alertAuthor.trim().length > 0
      ? raw.alertAuthor
      : DEFAULT_SETTINGS.alertAuthor
  const rawAuthors = Array.isArray(raw?.authors) ? raw.authors : DEFAULT_SETTINGS.authors
  const authorsWithAdrian = rawAuthors.some((author) => author.id === "author-adrian")
    ? rawAuthors
    : [...rawAuthors, DEFAULT_SETTINGS.authors.find((author) => author.id === "author-adrian")].filter(
        (author): author is AlertAuthor => Boolean(author),
      )
  const authors = authorsWithAdrian.some((author) => author.id === "author-elapsed-time-tracker")
    ? authorsWithAdrian
    : [...authorsWithAdrian, DEFAULT_TIMEKEEPER_AUTHOR].filter(
        (author): author is AlertAuthor => Boolean(author),
      )
  const enableRealityChecks =
    typeof raw?.enableRealityChecks === "boolean" ? raw.enableRealityChecks : DEFAULT_SETTINGS.enableRealityChecks
  const enableBreakReminders =
    typeof raw?.enableBreakReminders === "boolean"
      ? raw.enableBreakReminders
      : DEFAULT_SETTINGS.enableBreakReminders
  const enableElapsedTimeTracker =
    typeof raw?.enableElapsedTimeTracker === "boolean"
      ? raw.enableElapsedTimeTracker
      : DEFAULT_SETTINGS.enableElapsedTimeTracker
  const breakReminderIntervalMinutesRaw =
    typeof raw?.breakReminderIntervalMinutes === "number" && Number.isFinite(raw.breakReminderIntervalMinutes)
      ? raw.breakReminderIntervalMinutes
      : DEFAULT_SETTINGS.breakReminderIntervalMinutes
  const breakReminderIntervalMinutes = Math.max(1, Math.round(breakReminderIntervalMinutesRaw))
  const enableScreamMode =
    typeof raw?.enableScreamMode === "boolean" ? raw.enableScreamMode : DEFAULT_SETTINGS.enableScreamMode
  const screamModeInactivityMinutesRaw =
    typeof raw?.screamModeInactivityMinutes === "number" && Number.isFinite(raw.screamModeInactivityMinutes)
      ? raw.screamModeInactivityMinutes
      : DEFAULT_SETTINGS.screamModeInactivityMinutes
  const screamModeInactivityMinutes = Math.min(120, Math.max(5, screamModeInactivityMinutesRaw))
  const screamModeAlertIntervalMinutesRaw =
    typeof raw?.screamModeAlertIntervalMinutes === "number" && Number.isFinite(raw.screamModeAlertIntervalMinutes)
      ? raw.screamModeAlertIntervalMinutes
      : DEFAULT_SETTINGS.screamModeAlertIntervalMinutes
  const screamModeAlertIntervalMinutes = Math.min(15, Math.max(1, screamModeAlertIntervalMinutesRaw))
  const screamModeSoundEnabled =
    typeof raw?.screamModeSoundEnabled === "boolean"
      ? raw.screamModeSoundEnabled
      : DEFAULT_SETTINGS.screamModeSoundEnabled
  const realityCheckSettingsRaw = raw?.realityCheckSettings ?? DEFAULT_SETTINGS.realityCheckSettings
  const minMinutesBetween =
    typeof realityCheckSettingsRaw?.minMinutesBetween === "number" &&
    Number.isFinite(realityCheckSettingsRaw.minMinutesBetween)
      ? Math.min(999, Math.max(5, realityCheckSettingsRaw.minMinutesBetween))
      : DEFAULT_SETTINGS.realityCheckSettings.minMinutesBetween
  const maxPerDay =
    typeof realityCheckSettingsRaw?.maxPerDay === "number" && Number.isFinite(realityCheckSettingsRaw.maxPerDay)
      ? realityCheckSettingsRaw.maxPerDay === 0
        ? 0
        : Math.min(50, Math.max(1, realityCheckSettingsRaw.maxPerDay))
      : DEFAULT_SETTINGS.realityCheckSettings.maxPerDay
  const alertSoundEnabled =
    typeof raw?.alertSoundEnabled === "boolean" ? raw.alertSoundEnabled : DEFAULT_SETTINGS.alertSoundEnabled
  const alertSoundVolumeRaw =
    typeof raw?.alertSoundVolume === "number" && Number.isFinite(raw.alertSoundVolume)
      ? raw.alertSoundVolume
      : DEFAULT_SETTINGS.alertSoundVolume
  const alertSoundVolume = Math.min(1, Math.max(0, alertSoundVolumeRaw))
  const googleCalendarConnected =
    typeof raw?.googleCalendarConnected === "boolean"
      ? raw.googleCalendarConnected
      : DEFAULT_SETTINGS.googleCalendarConnected
  const googleCalendarAutoSyncRaw =
    typeof raw?.googleCalendarAutoSync === "boolean"
      ? raw.googleCalendarAutoSync
      : DEFAULT_SETTINGS.googleCalendarAutoSync
  const googleCalendarEventFormatRaw =
    typeof raw?.googleCalendarEventFormat === "string"
      ? raw.googleCalendarEventFormat
      : DEFAULT_SETTINGS.googleCalendarEventFormat
  const googleCalendarEventFormat =
    googleCalendarEventFormatRaw === "task" ||
    googleCalendarEventFormatRaw === "project-task" ||
    googleCalendarEventFormatRaw === "emoji" ||
    googleCalendarEventFormatRaw === "emoji-task-project"
      ? googleCalendarEventFormatRaw
      : DEFAULT_SETTINGS.googleCalendarEventFormat
  const googleCalendarUserEmail =
    typeof raw?.googleCalendarUserEmail === "string" && raw.googleCalendarUserEmail.trim().length > 0
      ? raw.googleCalendarUserEmail.trim()
      : DEFAULT_SETTINGS.googleCalendarUserEmail
  const googleCalendarColorId =
    typeof raw?.googleCalendarColorId === "string" &&
    raw.googleCalendarColorId.trim().length > 0 &&
    /^(1|2|3|4|5|6|7|8|9|10|11)$/.test(raw.googleCalendarColorId.trim())
      ? raw.googleCalendarColorId.trim()
      : DEFAULT_SETTINGS.googleCalendarColorId
  const googleCalendarSyncOvertime =
    typeof raw?.googleCalendarSyncOvertime === "boolean"
      ? raw.googleCalendarSyncOvertime
      : DEFAULT_SETTINGS.googleCalendarSyncOvertime
  const resetSessionCounterDaily =
    typeof raw?.resetSessionCounterDaily === "boolean"
      ? raw.resetSessionCounterDaily
      : DEFAULT_SETTINGS.resetSessionCounterDaily
  const googleCalendarAutoSync = googleCalendarConnected ? true : googleCalendarAutoSyncRaw

  return {
    enableInactivityNudges:
      typeof raw?.enableInactivityNudges === "boolean" ? raw.enableInactivityNudges : true,
    enableEndOfDayReminders:
      typeof raw?.enableEndOfDayReminders === "boolean" ? raw.enableEndOfDayReminders : true,
    endOfDayTime:
      typeof raw?.endOfDayTime === "string" && raw.endOfDayTime.trim().length > 0
        ? raw.endOfDayTime
        : "20:00",
    pomodoroMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    longBreakEvery,
    completionSoundEnabled,
    confettiEnabled,
    completionSoundVolume,
    completionSoundFile,
    alertsEnabled,
    habitEndOfDayNudgesEnabled,
    alertCooldownMinutes,
    minMinutesBetweenAlerts,
    avoidSameAlertType,
    enableRealityChecks,
    realityCheckSettings: { minMinutesBetween, maxPerDay },
    enableBreakReminders,
    enableElapsedTimeTracker,
    breakReminderIntervalMinutes,
    enableScreamMode,
    screamModeInactivityMinutes,
    screamModeAlertIntervalMinutes,
    screamModeSoundEnabled,
    alertSoundEnabled,
    alertSoundVolume,
    alertAuthor,
    authors,
    googleCalendarConnected,
    googleCalendarAutoSync,
    googleCalendarSyncOvertime,
    googleCalendarEventFormat,
    googleCalendarUserEmail,
    googleCalendarColorId,
    resetSessionCounterDaily,
  }
}

export const clampSettingsUpdate = (partial: Partial<NudgeSettings>, prev: NudgeSettings): NudgeSettings => {
  const nextRaw = { ...prev, ...partial }

  const pomodoroMinutes =
    typeof nextRaw.pomodoroMinutes === "number"
      ? clamp(nextRaw.pomodoroMinutes, BOUNDS.pomodoroMinutes.min, BOUNDS.pomodoroMinutes.max)
      : prev.pomodoroMinutes
  const shortBreakMinutes =
    typeof nextRaw.shortBreakMinutes === "number"
      ? clamp(nextRaw.shortBreakMinutes, BOUNDS.shortBreakMinutes.min, BOUNDS.shortBreakMinutes.max)
      : prev.shortBreakMinutes
  const longBreakMinutes =
    typeof nextRaw.longBreakMinutes === "number"
      ? clamp(nextRaw.longBreakMinutes, BOUNDS.longBreakMinutes.min, BOUNDS.longBreakMinutes.max)
      : prev.longBreakMinutes
  const longBreakEvery =
    typeof nextRaw.longBreakEvery === "number"
      ? Math.max(1, Math.round(nextRaw.longBreakEvery))
      : prev.longBreakEvery
  const alertCooldownMinutes =
    typeof nextRaw.alertCooldownMinutes === "number"
      ? Math.max(1, Math.round(nextRaw.alertCooldownMinutes))
      : prev.alertCooldownMinutes
  const minMinutesBetweenAlerts =
    typeof nextRaw.minMinutesBetweenAlerts === "number"
      ? Math.max(1, Math.round(nextRaw.minMinutesBetweenAlerts))
      : prev.minMinutesBetweenAlerts
  const avoidSameAlertType =
    typeof nextRaw.avoidSameAlertType === "boolean"
      ? nextRaw.avoidSameAlertType
      : prev.avoidSameAlertType
  const enableRealityChecks =
    typeof nextRaw.enableRealityChecks === "boolean"
      ? nextRaw.enableRealityChecks
      : prev.enableRealityChecks
  const enableBreakReminders =
    typeof nextRaw.enableBreakReminders === "boolean"
      ? nextRaw.enableBreakReminders
      : prev.enableBreakReminders
  const enableElapsedTimeTracker =
    typeof nextRaw.enableElapsedTimeTracker === "boolean"
      ? nextRaw.enableElapsedTimeTracker
      : prev.enableElapsedTimeTracker
  const breakReminderIntervalMinutes =
    typeof nextRaw.breakReminderIntervalMinutes === "number"
      ? Math.max(1, Math.round(nextRaw.breakReminderIntervalMinutes))
      : prev.breakReminderIntervalMinutes
  const enableScreamMode =
    typeof nextRaw.enableScreamMode === "boolean" ? nextRaw.enableScreamMode : prev.enableScreamMode
  const screamModeInactivityMinutes =
    typeof nextRaw.screamModeInactivityMinutes === "number"
      ? Math.min(120, Math.max(5, nextRaw.screamModeInactivityMinutes))
      : prev.screamModeInactivityMinutes
  const screamModeAlertIntervalMinutes =
    typeof nextRaw.screamModeAlertIntervalMinutes === "number"
      ? Math.min(15, Math.max(1, nextRaw.screamModeAlertIntervalMinutes))
      : prev.screamModeAlertIntervalMinutes
  const screamModeSoundEnabled =
    typeof nextRaw.screamModeSoundEnabled === "boolean"
      ? nextRaw.screamModeSoundEnabled
      : prev.screamModeSoundEnabled
  const realityCheckSettingsRaw =
    typeof nextRaw.realityCheckSettings === "object" && nextRaw.realityCheckSettings !== null
      ? nextRaw.realityCheckSettings
      : prev.realityCheckSettings
  const realityCheckMinMinutes =
    typeof realityCheckSettingsRaw?.minMinutesBetween === "number"
      ? Math.min(999, Math.max(5, realityCheckSettingsRaw.minMinutesBetween))
      : prev.realityCheckSettings.minMinutesBetween
  const realityCheckMaxPerDay =
    typeof realityCheckSettingsRaw?.maxPerDay === "number"
      ? realityCheckSettingsRaw.maxPerDay === 0
        ? 0
        : Math.min(50, Math.max(1, realityCheckSettingsRaw.maxPerDay))
      : prev.realityCheckSettings.maxPerDay
  const alertSoundEnabled =
    typeof nextRaw.alertSoundEnabled === "boolean" ? nextRaw.alertSoundEnabled : prev.alertSoundEnabled
  const alertSoundVolume =
    typeof nextRaw.alertSoundVolume === "number"
      ? Math.min(1, Math.max(0, nextRaw.alertSoundVolume))
      : prev.alertSoundVolume
  const alertAuthor =
    typeof nextRaw.alertAuthor === "string" && nextRaw.alertAuthor.trim().length > 0
      ? nextRaw.alertAuthor
      : prev.alertAuthor
  const rawAuthors = Array.isArray(nextRaw.authors) ? nextRaw.authors : prev.authors
  const authorsWithAdrian = rawAuthors.some((author) => author.id === "author-adrian")
    ? rawAuthors
    : [...rawAuthors, DEFAULT_SETTINGS.authors.find((author) => author.id === "author-adrian")].filter(
        (author): author is AlertAuthor => Boolean(author),
      )
  const authors = authorsWithAdrian.some((author) => author.id === "author-elapsed-time-tracker")
    ? authorsWithAdrian
    : [...authorsWithAdrian, DEFAULT_TIMEKEEPER_AUTHOR].filter(
        (author): author is AlertAuthor => Boolean(author),
      )
  const completionSoundVolume =
    typeof nextRaw.completionSoundVolume === "number"
      ? Math.min(1, Math.max(0, nextRaw.completionSoundVolume))
      : prev.completionSoundVolume
  const confettiEnabled =
    typeof nextRaw.confettiEnabled === "boolean" ? nextRaw.confettiEnabled : prev.confettiEnabled
  const resetSessionCounterDaily =
    typeof nextRaw.resetSessionCounterDaily === "boolean"
      ? nextRaw.resetSessionCounterDaily
      : prev.resetSessionCounterDaily

  return {
    ...nextRaw,
    pomodoroMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    longBreakEvery,
    alertCooldownMinutes,
    minMinutesBetweenAlerts,
    avoidSameAlertType,
    enableRealityChecks,
    enableBreakReminders,
    enableElapsedTimeTracker,
    breakReminderIntervalMinutes,
    enableScreamMode,
    screamModeInactivityMinutes,
    screamModeAlertIntervalMinutes,
    screamModeSoundEnabled,
    realityCheckSettings: {
      minMinutesBetween: realityCheckMinMinutes,
      maxPerDay: realityCheckMaxPerDay,
    },
    alertSoundEnabled,
    alertSoundVolume,
    alertAuthor,
    authors,
    completionSoundVolume,
    confettiEnabled,
    resetSessionCounterDaily,
  }
}
