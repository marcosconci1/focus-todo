export type AlertType =
  | "INACTIVITY"
  | "HABITS_ENDING_DAY"
  | "END_OF_DAY_COUNTDOWN"
  | "REALITY_CHECKS"
  | "BREAK_REMINDER"
  | "ELAPSED_TIME"

export interface AlertAuthor {
  id: string
  name: string
  color: string
  isSystem: boolean
  /**
   * Duration in minutes. Use -1 for infinite duration.
   */
  messageDurationMinutes: number
  /**
   * Check-in frequency in minutes. Determines how often this author's alerts can fire.
   * If not specified, falls back to global settings based on alert type.
   * This is separate from messageDurationMinutes, which controls visibility duration.
   */
  checkInFrequencyMinutes?: number
}

export interface AlertTemplate {
  id: string
  type: AlertType
  title: string
  message: string
  tone: "BITTERSWEET"
  enabled: boolean
  authorId: string
}

export interface RealityCheckSettings {
  minMinutesBetween: number
  maxPerDay: number
}

export interface QueuedAlert {
  id: string
  template: AlertTemplate
  progress?: number
  timestamp: number
  hoursLeft?: number
  habitCountLeft?: number
  elapsedTime?: string
  authorColor?: string
  round?: number
  authorMessageDuration?: number
}

export interface AlertTracking {
  lastSessionStartedAt: string | null
  lastSessionEndedAt: string | null
  lastSessionCompletedAt: string | null
  lastAlertFiredAt: string | null
  lastRockyAlertAt: string | null
  lastAdrianAlertAt: string | null
  lastTimekeeperAlertAt: string | null
  lastAlertType: string | null
  lastAlertTemplateId: string | null
  lastTaskCompletedAt: string | null
  lastBreakActivatedAt: string | null
  lastTimerStartAt: number | null
  lastElapsedTimeAlertAt: number | null
  screamModeActivatedAt: string | null
  screamModeLastAlertAt: string | null
  breakReminderRound: number
  globalSessionCounter: number
  dismissedAlertsToday: number
  distractionsToday: number
  timeWasted: number
  firedAlertsToday: Array<{ type: string; firedAt: string; hoursLeft?: number }>
  realityCheckState?: { lastFiredAt: string | null; firedCountToday: number }
}

export interface ScreamModeInsult {
  id: string
  title: string
  message: string
  punchline?: string
  enabled: boolean
  createdAt: string
}

export const DEFAULT_ROCKY_AUTHOR: AlertAuthor = {
  id: "author-rocky",
  name: "@Rocky",
  color: "#ff6b6b",
  isSystem: true,
  messageDurationMinutes: 5,
}

export const DEFAULT_ADRIAN_AUTHOR: AlertAuthor = {
  id: "author-adrian",
  name: "@Adrian",
  color: "#9b59b6",
  isSystem: true,
  messageDurationMinutes: 5,
  checkInFrequencyMinutes: 45,
}

export const DEFAULT_TIMEKEEPER_AUTHOR: AlertAuthor = {
  id: "author-elapsed-time-tracker",
  name: "@TimeKeeper",
  color: "#f39c12",
  isSystem: true,
  messageDurationMinutes: -1,
  checkInFrequencyMinutes: 30,
}

export const DEFAULT_REALITY_CHECK_TEMPLATES: AlertTemplate[] = [
  {
    id: "alert-reality-1",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Are you working on what truly matters right now?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-2",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Is this task aligned with your goals for today?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-3",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Take a breath. What's really important?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-4",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Remember why you started this.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-5",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "You're doing great. Stay focused on your priorities.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-6",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Is this the best use of your time right now?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-7",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Check in with yourself. How are you feeling?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-8",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "What would make today meaningful for you?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-reality-9",
    type: "REALITY_CHECKS",
    title: "@Adrian",
    authorId: "author-adrian",
    message: "Progress over perfection, always.",
    tone: "BITTERSWEET",
    enabled: true,
  },
]

export const DEFAULT_ALERT_TEMPLATES: AlertTemplate[] = [
  {
    id: "alert-inactivity-1",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "1 hour no focus. Are we building habits or excuses?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-2",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Clock is ticking. Start one session. Just one.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-3",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Procrastination is a decision. So is progress.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-4",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "The timer won't start itself. Neither will your future.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-5",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "You've been idle for a while. The clock is winning.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-6",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "No session started. Productivity is currently a theory.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-7",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "If waiting was a task, you'd be crushing it.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-8",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "1h of silence. Even the timer is bored.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-9",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Quick reality check: starting is the hardest part.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-10",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Not judging. Just... noticing.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-11",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Still there? Blink twice and press START.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-12",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Your future self is refreshing this page in disappointment.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-13",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "A 25-minute sprint beats a 0-minute plan.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-inactivity-14",
    type: "INACTIVITY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Small step: one session. Big mood: progress.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-1",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Day's almost over. Habits still untouched. Bold strategy.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-2",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Future-you called. He wants today's habits done.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-3",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Habits build character. Or so I've heard.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-4",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Habits are still pending. The day is not.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-5",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Your Habit list is doing that thing where it doesn't do itself.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-6",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "You promised \"daily\". Today is still daily.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-7",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Habits left: yes. Excuses left: also yes.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-8",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Do the habits now, or let tomorrow inherit regret.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-9",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Plot twist: discipline is quiet. Start one habit.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-10",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Habits are the boring superpower. Go earn it.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-habits-11",
    type: "HABITS_ENDING_DAY",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "You can still save today with one tiny habit.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-1",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. Decide what kind of day this was.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-2",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. Your move.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-3",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. Make it count or make peace.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-4",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. Choose: progress or \"tomorrow\".",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-5",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. One good session changes the vibe.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-eod-6",
    type: "END_OF_DAY_COUNTDOWN",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "{hoursLeft}h left. The day is closing tabs.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-break-reminder-1",
    type: "BREAK_REMINDER",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Time for a break? You completed a task recently.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-break-reminder-2",
    type: "BREAK_REMINDER",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "Still no break? Your brain needs rest.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-break-reminder-3",
    type: "BREAK_REMINDER",
    title: "@Rocky",
    authorId: "author-rocky",
    message: "15 minutes without a break. Take one now.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-elapsed-time-1",
    type: "ELAPSED_TIME",
    title: "@TimeKeeper",
    authorId: "author-elapsed-time-tracker",
    message: "It's been {elapsed_time} since your last session.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-elapsed-time-2",
    type: "ELAPSED_TIME",
    title: "@TimeKeeper",
    authorId: "author-elapsed-time-tracker",
    message: "{elapsed_time} of wandering. Ready to refocus?",
    tone: "BITTERSWEET",
    enabled: true,
  },
  {
    id: "alert-elapsed-time-3",
    type: "ELAPSED_TIME",
    title: "@TimeKeeper",
    authorId: "author-elapsed-time-tracker",
    message: "Time drift: {elapsed_time}. Anchor yourself with a session.",
    tone: "BITTERSWEET",
    enabled: true,
  },
  ...DEFAULT_REALITY_CHECK_TEMPLATES,
]

export const DEFAULT_ALERT_TRACKING: AlertTracking = {
  lastSessionStartedAt: null,
  lastSessionEndedAt: null,
  lastSessionCompletedAt: null,
  lastAlertFiredAt: null,
  lastRockyAlertAt: null,
  lastAdrianAlertAt: null,
  lastTimekeeperAlertAt: null,
  lastAlertType: null,
  lastAlertTemplateId: null,
  lastTaskCompletedAt: null,
  lastBreakActivatedAt: null,
  lastTimerStartAt: null,
  lastElapsedTimeAlertAt: null,
  screamModeActivatedAt: null,
  screamModeLastAlertAt: null,
  breakReminderRound: 0,
  globalSessionCounter: 0,
  dismissedAlertsToday: 0,
  distractionsToday: 0,
  timeWasted: 0,
  firedAlertsToday: [],
  realityCheckState: { lastFiredAt: null, firedCountToday: 0 },
}

export const BREAK_REMINDER_TEMPLATE_IDS: Record<number, string> = {
  1: "alert-break-reminder-1",
  2: "alert-break-reminder-2",
  3: "alert-break-reminder-3",
}

export function getBreakReminderTemplateId(round: number): string | null {
  return BREAK_REMINDER_TEMPLATE_IDS[round] ?? null
}

export function selectRandomTemplate(
  templates: AlertTemplate[],
  type: AlertType,
  excludeIds: string[] = [],
): AlertTemplate | null {
  const pool = templates.filter(
    (template) => template.type === type && template.enabled && !excludeIds.includes(template.id),
  )
  const fallback = templates.filter((template) => template.type === type && template.enabled)
  const finalPool = pool.length > 0 ? pool : fallback
  if (finalPool.length === 0) return null
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null
}

export function replacePlaceholders(
  message: string,
  data: { hoursLeft?: number; habitCountLeft?: number; elapsedTime?: string },
): string {
  return message
    .replaceAll("{hoursLeft}", data.hoursLeft !== undefined ? String(data.hoursLeft) : "")
    .replaceAll("{habitCountLeft}", data.habitCountLeft !== undefined ? String(data.habitCountLeft) : "")
    .replaceAll("{elapsed_time}", data.elapsedTime ?? "")
}

export function formatElapsedTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000)

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`
  }

  if (minutes < 1440) {
    const hours = (minutes / 60).toFixed(1)
    return `${hours} hour${hours !== "1.0" ? "s" : ""}`
  }

  const days = (minutes / 1440).toFixed(1)
  return `${days} day${days !== "1.0" ? "s" : ""}`
}

export function calculateProgress(
  type: AlertType,
  data: {
    minutesInactive?: number
    minutesElapsed?: number
    totalMinutesInDay?: number
    completedHabits?: number
    totalHabits?: number
  },
): number {
  if (type === "INACTIVITY") {
    if (typeof data.minutesInactive !== "number") return 0
    return Math.min(100, Math.round((data.minutesInactive / 60) * 100))
  }
  if (type === "END_OF_DAY_COUNTDOWN") {
    if (typeof data.minutesElapsed !== "number" || typeof data.totalMinutesInDay !== "number") return 0
    return Math.min(100, Math.round((data.minutesElapsed / data.totalMinutesInDay) * 100))
  }
  if (type === "HABITS_ENDING_DAY") {
    if (typeof data.completedHabits !== "number" || typeof data.totalHabits !== "number" || data.totalHabits === 0) {
      return 0
    }
    return Math.min(100, Math.round((data.completedHabits / data.totalHabits) * 100))
  }
  return 0
}

export function calculateAlertDuration(
  _type: AlertType,
  _round?: number,
  messageDurationMinutes?: number,
): number {
  if (messageDurationMinutes === -1) {
    return Infinity
  }
  return (messageDurationMinutes ?? 5) * 60 * 1000
}
