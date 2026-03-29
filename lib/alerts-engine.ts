"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Category } from "@/lib/types"
import type { AlertAuthor, AlertTemplate, AlertTracking, QueuedAlert, AlertType } from "@/lib/alert-types"
import {
  calculateAlertDuration,
  calculateProgress,
  getBreakReminderTemplateId,
  formatElapsedTime,
  selectRandomTemplate,
} from "@/lib/alert-types"

interface AlertsEngineSettings {
  alertsEnabled: boolean
  enableInactivityNudges: boolean
  enableEndOfDayReminders: boolean
  habitEndOfDayNudgesEnabled: boolean
  alertCooldownMinutes: number
  minMinutesBetweenAlerts: number
  avoidSameAlertType: boolean
  endOfDayTime: string
  enableRealityChecks: boolean
  realityCheckSettings: { minMinutesBetween: number; maxPerDay: number }
  enableBreakReminders: boolean
  breakReminderIntervalMinutes: number
  enableElapsedTimeTracker: boolean
  alertSoundEnabled: boolean
  alertSoundVolume: number
  alertAuthor: string
  authors: AlertAuthor[]
}

interface AlertsEngineParams {
  isRunning: boolean
  sessionStarted: boolean
  timerMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK"
  appMountedAt: number | null
  categories: Category[]
  settings: AlertsEngineSettings
  alertTemplates: AlertTemplate[]
  alertTracking: AlertTracking
  // onUpdateTracking persists state (e.g. via storage -> SQLite) and should avoid throwing.
  onUpdateTracking: (tracking: AlertTracking) => void
  onNewMessage?: (message: QueuedAlert) => void
}

const INACTIVITY_THRESHOLDS_MINUTES = [30, 60, 120, 180]

const getTodayKey = (date: Date) => date.toDateString()

const getAuthorCheckInFrequency = (authorId: string, authors: AlertAuthor[]) => {
  const author = authors.find((entry) => entry.id === authorId)
  return author?.checkInFrequencyMinutes ?? 60
}

const isAuthorOnCooldown = (
  lastAlertAt: string | null,
  checkInFrequencyMinutes: number,
  now: Date,
) => {
  if (!lastAlertAt) return false
  const elapsedMs = now.getTime() - new Date(lastAlertAt).getTime()
  return elapsedMs < checkInFrequencyMinutes * 60 * 1000
}

export function useAlertsEngine({
  isRunning,
  sessionStarted,
  timerMode,
  appMountedAt,
  categories,
  settings,
  alertTemplates,
  alertTracking,
  onUpdateTracking,
  onNewMessage,
}: AlertsEngineParams) {
  const [visibleMessages, setVisibleMessages] = useState<QueuedAlert[]>([])
  const [alertQueue, setAlertQueue] = useState<QueuedAlert[]>([])
  const messageTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const messageExpiryRef = useRef<Map<string, number>>(new Map())
  const messageRemainingRef = useRef<Map<string, number>>(new Map())

  const trackingRef = useRef(alertTracking)
  const templatesRef = useRef(alertTemplates)
  const settingsRef = useRef(settings)
  const categoriesRef = useRef(categories)
  const wasRunningRef = useRef(isRunning)
  const realityCheckStateRef = useRef({
    lastFiredAt: null as string | null,
    firedCountToday: 0,
  })

  useEffect(() => {
    trackingRef.current = alertTracking
  }, [alertTracking])

  useEffect(() => {
    if (alertTracking.realityCheckState) {
      realityCheckStateRef.current = {
        lastFiredAt: alertTracking.realityCheckState.lastFiredAt ?? null,
        firedCountToday: alertTracking.realityCheckState.firedCountToday ?? 0,
      }
    }
  }, [alertTracking.realityCheckState])

  useEffect(() => {
    templatesRef.current = alertTemplates
  }, [alertTemplates])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  const normalizeFiredToday = useCallback((entries: AlertTracking["firedAlertsToday"], now: Date) => {
    const todayKey = getTodayKey(now)
    return entries.filter((entry) => getTodayKey(new Date(entry.firedAt)) === todayKey)
  }, [])

  const clearMessageTimer = useCallback((messageId: string) => {
    const timer = messageTimersRef.current.get(messageId)
    if (timer) {
      clearTimeout(timer)
    }
    messageTimersRef.current.delete(messageId)
  }, [])

  const removeMessageResources = useCallback(
    (messageId: string) => {
      clearMessageTimer(messageId)
      messageExpiryRef.current.delete(messageId)
      messageRemainingRef.current.delete(messageId)
    },
    [clearMessageTimer],
  )

  const removeMessage = useCallback(
    (messageId: string) => {
      setVisibleMessages((prev) => prev.filter((message) => message.id !== messageId))
      removeMessageResources(messageId)
    },
    [removeMessageResources],
  )

  const cleanupExpiredMessages = useCallback(() => {
    const now = Date.now()
    const expired = visibleMessages.filter(
      (message) => (messageExpiryRef.current.get(message.id) ?? 0) <= now,
    )
    expired.forEach((message) => {
      removeMessage(message.id)
    })
  }, [removeMessage, visibleMessages])

  const scheduleMessageRemoval = useCallback(
    (message: QueuedAlert, remainingMs?: number) => {
      const duration = calculateAlertDuration(
        message.template.type,
        message.round,
        message.authorMessageDuration ?? 5,
      )
      if (duration === Infinity || message.authorMessageDuration === -1) {
        return
      }
      clearMessageTimer(message.id)
      const expiresAt = messageExpiryRef.current.get(message.id) ?? message.timestamp + duration
      if (!messageExpiryRef.current.has(message.id)) {
        messageExpiryRef.current.set(message.id, expiresAt)
      }
      const remaining = remainingMs ?? Math.max(0, expiresAt - Date.now())
      if (remaining <= 0) {
        removeMessage(message.id)
        return
      }
      const timer = setTimeout(() => {
        removeMessage(message.id)
      }, remaining)
      messageTimersRef.current.set(message.id, timer)
    },
    [clearMessageTimer, removeMessage],
  )

  const addMessage = useCallback(
    (message: QueuedAlert) => {
      cleanupExpiredMessages()
      const duration = calculateAlertDuration(
        message.template.type,
        message.round,
        message.authorMessageDuration ?? 5,
      )
      if (duration !== Infinity && message.authorMessageDuration !== -1) {
        messageExpiryRef.current.set(message.id, message.timestamp + duration)
      }
      scheduleMessageRemoval(message)

      setVisibleMessages((prev) => {
        const next = [...prev, message]
        if (next.length > 3) {
          const removed = next.slice(0, next.length - 3)
          removed.forEach((oldMessage) => {
            removeMessageResources(oldMessage.id)
          })
          return next.slice(-3)
        }
        return next
      })

      onNewMessage?.(message)
    },
    [cleanupExpiredMessages, onNewMessage, removeMessageResources, scheduleMessageRemoval],
  )

  const updateTracking = useCallback(
    (partial: Partial<AlertTracking>, now = new Date()) => {
      const current = trackingRef.current
      const next: AlertTracking = {
        ...current,
        ...partial,
        firedAlertsToday: normalizeFiredToday(partial.firedAlertsToday ?? current.firedAlertsToday, now),
      }
      trackingRef.current = next
      // Keep UI resilient; persistence errors are logged and swallowed.
      Promise.resolve()
        .then(() => onUpdateTracking(next))
        .catch((error) => {
          console.error("Failed to update alert tracking:", error)
        })
    },
    [normalizeFiredToday, onUpdateTracking],
  )
  const updateTrackingRef = useRef(updateTracking)

  useEffect(() => {
    updateTrackingRef.current = updateTracking
  }, [updateTracking])

  useEffect(() => {
    if (sessionStarted && isRunning && !wasRunningRef.current) {
      updateTracking({
        lastSessionStartedAt: new Date().toISOString(),
        lastTimerStartAt: Date.now(),
      })
    }
    if (!isRunning && wasRunningRef.current) {
      updateTracking({
        lastSessionEndedAt: new Date().toISOString(),
      })
    }
    wasRunningRef.current = isRunning
  }, [isRunning, sessionStarted, updateTracking])

  const enqueueAlert = useCallback((alert: QueuedAlert, priority: "normal" | "high" = "normal") => {
    setAlertQueue((prev) => (priority === "high" ? [alert, ...prev] : [...prev, alert]))
  }, [])

  const recentTemplateIdsRef = useRef<string[]>([])
  const RECENT_LIMIT = 3
  const snoozedUntilRef = useRef<number | null>(null)

  const hasFiredToday = useCallback((type: AlertType, hoursLeft: number | undefined, now: Date) => {
    const todayKey = getTodayKey(now)
    return trackingRef.current.firedAlertsToday.some(
      (entry) =>
        entry.type === type &&
        entry.hoursLeft === hoursLeft &&
        getTodayKey(new Date(entry.firedAt)) === todayKey,
    )
  }, [])

  const queueAlert = useCallback(
    (
      type: AlertType,
      data: {
        hoursLeft?: number
        minutesInactive?: number
        minutesSinceCompletion?: number
        minutesElapsed?: number
        totalMinutesInDay?: number
        completedHabits?: number
        totalHabits?: number
        habitCountLeft?: number
        round?: number
        templateId?: string
      },
      priority?: "normal" | "high",
    ) => {
      let template: AlertTemplate | null = null
      if (data.templateId) {
        const match = templatesRef.current.find((entry) => entry.id === data.templateId)
        if (match && match.enabled) {
          template = match
        } else if (type === "BREAK_REMINDER") {
          template = templatesRef.current.find((entry) => entry.type === "BREAK_REMINDER" && entry.enabled) ?? null
        }
      }
      if (!template && type === "BREAK_REMINDER") {
        template = templatesRef.current.find((entry) => entry.type === "BREAK_REMINDER" && entry.enabled) ?? null
      }
      if (!template) {
        template = selectRandomTemplate(templatesRef.current, type, recentTemplateIdsRef.current)
      }
      if (!template) return
      recentTemplateIdsRef.current = [...recentTemplateIdsRef.current, template.id].slice(-RECENT_LIMIT)
      const author = settingsRef.current.authors.find((entry) => entry.id === template.authorId)
      const defaultAuthor = settingsRef.current.authors.find((entry) => entry.id === "author-rocky")
      const resolvedAuthor = author ?? defaultAuthor
      const resolvedAuthorId = resolvedAuthor?.id ?? template.authorId
      if (type !== "BREAK_REMINDER" && resolvedAuthorId) {
        const lastAuthorAlertAt =
          resolvedAuthorId === "author-rocky"
            ? trackingRef.current.lastRockyAlertAt
            : resolvedAuthorId === "author-adrian"
              ? trackingRef.current.lastAdrianAlertAt
              : resolvedAuthorId === "author-elapsed-time-tracker"
                ? trackingRef.current.lastTimekeeperAlertAt
                : null
        const authorFrequency = getAuthorCheckInFrequency(resolvedAuthorId, settingsRef.current.authors)
        if (isAuthorOnCooldown(lastAuthorAlertAt, authorFrequency, new Date())) {
          return
        }
      }
      const resolvedTemplate = resolvedAuthor ? { ...template, title: resolvedAuthor.name } : template
      const authorDuration = resolvedAuthor?.messageDurationMinutes ?? 5
      const elapsedTime =
        typeof data.minutesElapsed === "number" ? formatElapsedTime(data.minutesElapsed * 60 * 1000) : undefined
      const progress = calculateProgress(type, {
        minutesInactive: data.minutesInactive,
        minutesElapsed: data.minutesElapsed,
        totalMinutesInDay: data.totalMinutesInDay,
        completedHabits: data.completedHabits,
        totalHabits: data.totalHabits,
      })
      enqueueAlert(
        {
          id: `${template.id}-${Date.now()}`,
          template: resolvedTemplate,
          progress,
          timestamp: Date.now(),
          hoursLeft: data.hoursLeft,
          habitCountLeft: data.habitCountLeft,
          elapsedTime,
          authorColor: resolvedAuthor?.color,
          round: data.round,
          authorMessageDuration: authorDuration,
        },
        priority,
      )
    },
    [enqueueAlert],
  )

  useEffect(() => {
    if (alertQueue.length > 0) {
      const [next, ...rest] = alertQueue
      setAlertQueue(rest)
      addMessage(next)
      const now = new Date()
      const firedAlertsToday = normalizeFiredToday(trackingRef.current.firedAlertsToday, now)
      const authorId = next.template.authorId
      const perAuthorUpdate: Partial<AlertTracking> =
        authorId === "author-rocky"
          ? { lastRockyAlertAt: now.toISOString() }
          : authorId === "author-adrian"
            ? { lastAdrianAlertAt: now.toISOString() }
            : authorId === "author-elapsed-time-tracker"
              ? { lastTimekeeperAlertAt: now.toISOString() }
              : {}
      firedAlertsToday.push({
        type: next.template.type,
        firedAt: now.toISOString(),
        hoursLeft: next.hoursLeft,
      })
      updateTracking({
        lastAlertFiredAt: now.toISOString(),
        lastAlertType: next.template.type,
        lastAlertTemplateId: next.template.id,
        firedAlertsToday,
        ...perAuthorUpdate,
      })
    }
  }, [addMessage, alertQueue, normalizeFiredToday, updateTracking])

  useEffect(() => {
    const checkAlerts = () => {
      const now = new Date()
      const currentSettings = settingsRef.current
      if (!currentSettings.alertsEnabled) return
      if (isRunning && timerMode === "FOCUS") return
      if (!appMountedAt || now.getTime() - appMountedAt < 30000) return
      if (typeof document !== "undefined" && document.querySelector("[data-modal-open='true']")) {
        return
      }
      if (snoozedUntilRef.current && now.getTime() < snoozedUntilRef.current) {
        return
      }

      const lastAlertAt = trackingRef.current.lastAlertFiredAt
      const cooldownMs = currentSettings.alertCooldownMinutes * 60 * 1000
      const minGapMs = currentSettings.minMinutesBetweenAlerts * 60 * 1000
      const effectiveCooldownMs = Math.max(cooldownMs, minGapMs)
      const globalCooldownActive =
        lastAlertAt !== null && now.getTime() - new Date(lastAlertAt).getTime() < effectiveCooldownMs

      const firedToday = normalizeFiredToday(trackingRef.current.firedAlertsToday, now)
      trackingRef.current = { ...trackingRef.current, firedAlertsToday: firedToday }
      const rockyFrequencyMinutes = getAuthorCheckInFrequency("author-rocky", currentSettings.authors)
      const adrianFrequencyMinutes = getAuthorCheckInFrequency("author-adrian", currentSettings.authors)
      const timekeeperFrequencyMinutes = getAuthorCheckInFrequency(
        "author-elapsed-time-tracker",
        currentSettings.authors,
      )
      const rockyOnCooldown = isAuthorOnCooldown(
        trackingRef.current.lastRockyAlertAt,
        rockyFrequencyMinutes,
        now,
      )
      const adrianOnCooldown = isAuthorOnCooldown(
        trackingRef.current.lastAdrianAlertAt,
        adrianFrequencyMinutes,
        now,
      )
      const timekeeperOnCooldown = isAuthorOnCooldown(
        trackingRef.current.lastTimekeeperAlertAt,
        timekeeperFrequencyMinutes,
        now,
      )
      let rockyCooldownActive = rockyOnCooldown

      if (currentSettings.enableInactivityNudges && !isRunning) {
        const lastSessionAt = trackingRef.current.lastSessionEndedAt ?? trackingRef.current.lastSessionStartedAt
        if (lastSessionAt) {
          const minutesInactive = Math.floor((now.getTime() - new Date(lastSessionAt).getTime()) / 60000)
          if (!rockyCooldownActive) {
            for (const threshold of INACTIVITY_THRESHOLDS_MINUTES) {
              if (minutesInactive >= threshold && !hasFiredToday("INACTIVITY", threshold, now)) {
                if (currentSettings.avoidSameAlertType && trackingRef.current.lastAlertType === "INACTIVITY") {
                  break
                }
                queueAlert("INACTIVITY", { minutesInactive, hoursLeft: threshold })
                updateTrackingRef.current({ lastRockyAlertAt: now.toISOString() }, now)
                rockyCooldownActive = true
                break
              }
            }
          }
        }
      }

      if (currentSettings.enableEndOfDayReminders) {
        const [eodHour, eodMinute] = currentSettings.endOfDayTime.split(":").map(Number)
        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes()
        const eodTotalMinutes = eodHour * 60 + eodMinute
        const minutesUntilEOD = eodTotalMinutes - currentTotalMinutes
        if (minutesUntilEOD > 0) {
          const hoursLeft = Math.floor(minutesUntilEOD / 60)
          const withinWindow = minutesUntilEOD % 60 < 30
          if (withinWindow && !rockyCooldownActive) {
            for (const threshold of [4, 3, 2]) {
              if (hoursLeft !== threshold) {
                continue
              }
              if (
                !hasFiredToday("END_OF_DAY_COUNTDOWN", threshold, now) &&
                (!currentSettings.avoidSameAlertType || trackingRef.current.lastAlertType !== "END_OF_DAY_COUNTDOWN")
              ) {
                queueAlert("END_OF_DAY_COUNTDOWN", {
                  hoursLeft: threshold,
                  minutesElapsed: currentTotalMinutes,
                  totalMinutesInDay: eodTotalMinutes,
                })
                updateTrackingRef.current({ lastRockyAlertAt: now.toISOString() }, now)
                rockyCooldownActive = true
                break
              }
            }
          }
        }
      }

      if (currentSettings.habitEndOfDayNudgesEnabled) {
        const habitProjects = categoriesRef.current.filter((project) => project.isHabitProject)
        const allHabitTasks = habitProjects.flatMap((project) => project.tasks ?? [])
        if (allHabitTasks.length > 0) {
          const completedHabits = allHabitTasks.filter((task) => task.completed).length
          const totalHabits = allHabitTasks.length
          const habitCountLeft = totalHabits - completedHabits
          if (completedHabits < totalHabits) {
            const [eodHour, eodMinute] = currentSettings.endOfDayTime.split(":").map(Number)
            const currentTotalMinutes = now.getHours() * 60 + now.getMinutes()
            const eodTotalMinutes = eodHour * 60 + eodMinute
            const minutesUntilEOD = eodTotalMinutes - currentTotalMinutes
            if (minutesUntilEOD > 0) {
              const hoursLeft = Math.floor(minutesUntilEOD / 60)
              const withinWindow = minutesUntilEOD % 60 < 30
              if (withinWindow && !rockyCooldownActive) {
                for (const threshold of [2, 1]) {
                  if (hoursLeft !== threshold) {
                    continue
                  }
                  if (
                    !hasFiredToday("HABITS_ENDING_DAY", threshold, now) &&
                    (!currentSettings.avoidSameAlertType ||
                      trackingRef.current.lastAlertType !== "HABITS_ENDING_DAY" ||
                      threshold <= 1)
                  ) {
                    const priority = threshold <= 1 ? "high" : "normal"
                    queueAlert(
                      "HABITS_ENDING_DAY",
                      {
                        hoursLeft: threshold,
                        completedHabits,
                        totalHabits,
                        habitCountLeft,
                      },
                      priority,
                    )
                    updateTrackingRef.current({ lastRockyAlertAt: now.toISOString() }, now)
                    rockyCooldownActive = true
                    break
                  }
                }
              }
            }
          }
        }
      }

      if (currentSettings.enableRealityChecks) {
        const rcSettings = currentSettings.realityCheckSettings
        const rcState = realityCheckStateRef.current

        if (rcState.lastFiredAt) {
          const lastDate = new Date(rcState.lastFiredAt)
          if (getTodayKey(lastDate) !== getTodayKey(now)) {
            rcState.firedCountToday = 0
            updateTrackingRef.current(
              { realityCheckState: { ...rcState } },
              now,
            )
          }
        }

        const withinDailyLimit = rcSettings.maxPerDay === 0 || rcState.firedCountToday < rcSettings.maxPerDay
        const minutesSinceLastRc = rcState.lastFiredAt
          ? (now.getTime() - new Date(rcState.lastFiredAt).getTime()) / 60_000
          : Infinity
        const canFire = withinDailyLimit && minutesSinceLastRc >= rcSettings.minMinutesBetween

        if (canFire && !adrianOnCooldown) {
          queueAlert("REALITY_CHECKS", {})
          rcState.lastFiredAt = now.toISOString()
          rcState.firedCountToday += 1
          updateTrackingRef.current(
            {
              realityCheckState: { ...rcState },
              lastAdrianAlertAt: now.toISOString(),
            },
            now,
          )
        }
      }

      if (currentSettings.enableBreakReminders && !globalCooldownActive) {
        const lastTaskCompletedAt = trackingRef.current.lastTaskCompletedAt
        if (lastTaskCompletedAt) {
          const lastTaskTime = new Date(lastTaskCompletedAt).getTime()
          if (!Number.isNaN(lastTaskTime)) {
            const lastBreakActivatedAt = trackingRef.current.lastBreakActivatedAt
            const lastBreakTime = lastBreakActivatedAt ? new Date(lastBreakActivatedAt).getTime() : null
            if (!lastBreakTime || lastBreakTime <= lastTaskTime) {
              if (timerMode !== "SHORT_BREAK" && timerMode !== "LONG_BREAK") {
                const elapsedMs = now.getTime() - lastTaskTime
                const intervalMinutes = Math.max(1, Math.round(currentSettings.breakReminderIntervalMinutes))
                const intervalMs = intervalMinutes * 60 * 1000
                const currentRound = trackingRef.current.breakReminderRound ?? 0

                for (let round = 1; round <= 3; round += 1) {
                  if (round <= currentRound) continue
                  const targetMs = intervalMs * round
                  if (elapsedMs >= targetMs) {
                    const minutesSinceCompletion = Math.round(elapsedMs / 60000)
                    queueAlert(
                      "BREAK_REMINDER",
                      {
                        minutesSinceCompletion,
                        round,
                        templateId: getBreakReminderTemplateId(round) ?? undefined,
                      },
                      round >= 2 ? "high" : "normal",
                    )
                    updateTrackingRef.current({ breakReminderRound: round }, now)
                    break
                  }
                }
              }
            }
          }
        }
      }

      if (currentSettings.enableElapsedTimeTracker && !isRunning) {
        if (timekeeperOnCooldown) {
          return
        }
        const lastSessionAt = trackingRef.current.lastSessionEndedAt ?? trackingRef.current.lastSessionStartedAt
        if (lastSessionAt) {
          const lastSessionTime = new Date(lastSessionAt).getTime()
          if (!Number.isNaN(lastSessionTime)) {
            const elapsedMs = now.getTime() - lastSessionTime
            const minutesElapsed = Math.floor(elapsedMs / 60000)
            if (minutesElapsed >= timekeeperFrequencyMinutes) {
              queueAlert("ELAPSED_TIME", { minutesElapsed })
              updateTrackingRef.current(
                {
                  lastTimekeeperAlertAt: now.toISOString(),
                  lastElapsedTimeAlertAt: now.getTime(),
                },
                now,
              )
            }
          }
        }
      }

    }

    const interval = setInterval(checkAlerts, 30000)
    checkAlerts()
    return () => clearInterval(interval)
  }, [isRunning, timerMode, appMountedAt, hasFiredToday, normalizeFiredToday, queueAlert])

  const onMessageHover = useCallback((_messageId: string, _hovered: boolean) => {
    // Hover tracking placeholder — consumers call this but no internal logic depends on it yet.
  }, [])

  const triggerTestAlert = useCallback(() => {
    const now = new Date()
    queueAlert("INACTIVITY", { minutesInactive: 60 }, "high")
    updateTracking({
      lastAlertFiredAt: now.toISOString(),
      lastAlertType: "INACTIVITY",
      firedAlertsToday: [
        ...normalizeFiredToday(trackingRef.current.firedAlertsToday, now),
        { type: "INACTIVITY", firedAt: now.toISOString(), hoursLeft: 60 },
      ],
    })
  }, [queueAlert, updateTracking, normalizeFiredToday])

  useEffect(() => {
    const timers = messageTimersRef.current
    const expiries = messageExpiryRef.current
    const remaining = messageRemainingRef.current

    return () => {
      timers.forEach((timer) => {
        clearTimeout(timer)
      })
      timers.clear()
      expiries.clear()
      remaining.clear()
    }
  }, [])

  return {
    visibleMessages,
    onMessageHover,
    triggerTestAlert,
  }
}
