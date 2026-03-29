"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AlertTemplate, AlertTracking, ScreamModeInsult } from "@/lib/alert-types"
import { DEFAULT_ALERT_TEMPLATES, DEFAULT_ALERT_TRACKING } from "@/lib/alert-types"
import type { NudgeSettings } from "@/lib/settings-store"
import type { Database } from "@/lib/storage"
import type { Category } from "@/lib/types"
import { useAlertsEngine } from "@/lib/alerts-engine"
import { toast } from "@/hooks/use-toast"
import { replacePlaceholders } from "@/lib/scream-mode-insults-data"

interface UseAlertManagerParams {
  buildDatabase: (categories: Category[]) => Database
  categories: Category[]
  saveData: (data: Database, options?: { onRollback?: (data: Database) => void }) => void
  settings: NudgeSettings
  isRunning: boolean
  sessionStarted: boolean
  timerMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK"
  appMountedAt: number | null
  isMountedRef: React.RefObject<boolean>
  playAlertSound: (volume: number) => Promise<void>
  isWithinStartupGracePeriod: () => boolean
  audioElementRef: React.RefObject<HTMLAudioElement | null>
}

export default function useAlertManager({
  buildDatabase,
  categories,
  saveData,
  settings,
  isRunning,
  sessionStarted,
  timerMode,
  appMountedAt,
  isMountedRef,
  playAlertSound,
  isWithinStartupGracePeriod,
  audioElementRef,
}: UseAlertManagerParams) {
  const [alertTemplates, setAlertTemplates] = useState<AlertTemplate[]>(DEFAULT_ALERT_TEMPLATES)
  const [alertTracking, setAlertTracking] = useState<AlertTracking>(DEFAULT_ALERT_TRACKING)
  const [showScreamFlash, setShowScreamFlash] = useState(false)
  const [currentScreamInsult, setCurrentScreamInsult] = useState<ScreamModeInsult | null>(null)
  const [screamModeInactiveMinutes, setScreamModeInactiveMinutes] = useState(0)

  const alertTrackingRef = useRef<AlertTracking>(alertTracking)
  const screamModeCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const screamFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAlertSoundRef = useRef(false)

  // alertTrackingRef sync
  useEffect(() => {
    alertTrackingRef.current = alertTracking
  }, [alertTracking])

  const handleUpdateTracking = useCallback(
    (tracking: AlertTracking) => {
      // Persist alert tracking updates via storage -> SQLite (debounced).
      const previousTracking = alertTrackingRef.current
      try {
        alertTrackingRef.current = tracking
        setAlertTracking(tracking)
        const nextData = {
          ...buildDatabase(categories),
          alertTracking: tracking,
          alertTemplates,
        }
        saveData(nextData, {
          onRollback: () => {
            if (!isMountedRef.current) return
            alertTrackingRef.current = previousTracking
            setAlertTracking(previousTracking)
          },
        })
      } catch (error) {
        console.error("Failed to persist alert tracking:", error)
      }
    },
    [alertTemplates, categories, buildDatabase, saveData, isMountedRef],
  )

  const handleUpdateAlertTemplates = useCallback(
    (templates: AlertTemplate[]) => {
      setAlertTemplates(templates)
      const nextData = {
        ...buildDatabase(categories),
        alertTemplates: templates,
        alertTracking,
      }
      saveData(nextData)
    },
    [alertTracking, buildDatabase, categories, saveData],
  )

  const handleDismissScreamMode = useCallback(() => {
    if (screamFlashTimeoutRef.current) {
      clearTimeout(screamFlashTimeoutRef.current)
      screamFlashTimeoutRef.current = null
    }
    setShowScreamFlash(false)
    setCurrentScreamInsult(null)
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.currentTime = 0
    }
  }, [audioElementRef])

  const fetchRandomScreamModeInsult = useCallback(async (): Promise<ScreamModeInsult | null> => {
    const response = await fetch("/api/scream-mode-insults/random", { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`Failed to fetch scream mode insult: ${response.status}`)
    }
    const data = (await response.json()) as { insult?: ScreamModeInsult }
    return data.insult ?? null
  }, [])

  const handlePlayAlertSound = useCallback(
    () => {
      if (isRunning || sessionStarted) return
      if (isWithinStartupGracePeriod()) return
      if (!settings.alertSoundEnabled) return
      void playAlertSound(settings.alertSoundVolume)
    },
    [
      isRunning,
      sessionStarted,
      isWithinStartupGracePeriod,
      playAlertSound,
      settings.alertSoundEnabled,
      settings.alertSoundVolume,
    ],
  )

  // Call useAlertsEngine internally
  const { visibleMessages, onMessageHover, triggerTestAlert } = useAlertsEngine({
    isRunning,
    sessionStarted,
    timerMode,
    appMountedAt,
    categories,
    settings: {
      alertsEnabled: settings.alertsEnabled,
      habitEndOfDayNudgesEnabled: settings.habitEndOfDayNudgesEnabled,
      enableInactivityNudges: settings.enableInactivityNudges,
      enableEndOfDayReminders: settings.enableEndOfDayReminders,
      alertCooldownMinutes: settings.alertCooldownMinutes,
      minMinutesBetweenAlerts: settings.minMinutesBetweenAlerts,
      avoidSameAlertType: settings.avoidSameAlertType,
      endOfDayTime: settings.endOfDayTime,
      enableRealityChecks: settings.enableRealityChecks,
      realityCheckSettings: settings.realityCheckSettings,
      enableBreakReminders: settings.enableBreakReminders,
      breakReminderIntervalMinutes: settings.breakReminderIntervalMinutes,
      enableElapsedTimeTracker: settings.enableElapsedTimeTracker,
      alertSoundEnabled: settings.alertSoundEnabled,
      alertSoundVolume: settings.alertSoundVolume,
      alertAuthor: settings.alertAuthor,
      authors: settings.authors,
    },
    alertTemplates,
    alertTracking,
    onUpdateTracking: handleUpdateTracking,
    onNewMessage: () => {
      pendingAlertSoundRef.current = true
    },
  })

  // Alert sound effect
  const latestMessageId = visibleMessages[visibleMessages.length - 1]?.id
  useEffect(() => {
    if (!pendingAlertSoundRef.current) return
    if (!settings.alertSoundEnabled) return
    if (!latestMessageId) return
    pendingAlertSoundRef.current = false
    handlePlayAlertSound()
  }, [handlePlayAlertSound, latestMessageId, settings.alertSoundEnabled])

  // Scream mode check interval
  useEffect(() => {
    if (!settings.enableScreamMode || !settings.alertsEnabled) {
      if (screamModeCheckIntervalRef.current) {
        clearInterval(screamModeCheckIntervalRef.current)
        screamModeCheckIntervalRef.current = null
      }
      return
    }

    const triggerScreamMode = async (now: Date, minutesInactive: number) => {
      const nowIso = now.toISOString()
      const tracking = alertTrackingRef.current
      const lastAlertAt = tracking.screamModeLastAlertAt
      const minutesSinceLastAlert = lastAlertAt
        ? Math.floor((now.getTime() - new Date(lastAlertAt).getTime()) / 60000)
        : null
      const timeWastedDelta = Math.max(0, minutesSinceLastAlert ?? minutesInactive)
      try {
        const insult = await fetchRandomScreamModeInsult()
        if (!insult) {
          setCurrentScreamInsult(null)
          return
        }
        setCurrentScreamInsult(insult)
      } catch (insultError) {
        console.error("Failed to load scream mode insult:", insultError)
        setCurrentScreamInsult(null)
        return
      }

      handleUpdateTracking({
        ...tracking,
        screamModeActivatedAt: tracking.screamModeActivatedAt ?? nowIso,
        screamModeLastAlertAt: nowIso,
        distractionsToday: (tracking.distractionsToday ?? 0) + 1,
        timeWasted: (tracking.timeWasted ?? 0) + timeWastedDelta,
      })
      setScreamModeInactiveMinutes(minutesInactive)
      setShowScreamFlash(true)
      if (settings.screamModeSoundEnabled && settings.alertSoundEnabled) {
        void playAlertSound(settings.alertSoundVolume)
      }
      if (screamFlashTimeoutRef.current) {
        clearTimeout(screamFlashTimeoutRef.current)
        screamFlashTimeoutRef.current = null
      }
    }

    const checkScreamMode = () => {
      if (isRunning || sessionStarted) return
      if (!appMountedAt || isWithinStartupGracePeriod()) return
      if (typeof document !== "undefined" && document.querySelector("[data-modal-open='true']")) {
        return
      }
      const tracking = alertTrackingRef.current
      const now = new Date()
      const lastAlertAt = tracking.lastAlertFiredAt
      const cooldownMs = settings.alertCooldownMinutes * 60 * 1000
      if (lastAlertAt && now.getTime() - new Date(lastAlertAt).getTime() < cooldownMs) {
        return
      }
      if (tracking.lastSessionCompletedAt) {
        const completedMs = new Date(tracking.lastSessionCompletedAt).getTime()
        if (!Number.isNaN(completedMs)) {
          const minutesSinceCompletion = Math.floor((now.getTime() - completedMs) / 60000)
          if (minutesSinceCompletion >= 0 && minutesSinceCompletion < 5) {
            return
          }
        }
      }
      let lastSessionAt = tracking.lastSessionEndedAt ?? tracking.lastSessionStartedAt
      if (!lastSessionAt) {
        const fallbackMs = appMountedAt ?? Date.now()
        const fallbackIso = new Date(fallbackMs).toISOString()
        handleUpdateTracking({
          ...tracking,
          lastSessionEndedAt: fallbackIso,
        })
        lastSessionAt = fallbackIso
      }

      const baselineMs = Math.max(
        new Date(lastSessionAt).getTime(),
        appMountedAt ?? Date.now(),
      )
      const minutesInactive = Math.floor((now.getTime() - baselineMs) / 60000)
      if (minutesInactive < settings.screamModeInactivityMinutes) return

      const lastScreamAlertAt = tracking.screamModeLastAlertAt
      const minutesSinceLastAlert = lastScreamAlertAt
        ? Math.floor((now.getTime() - new Date(lastScreamAlertAt).getTime()) / 60000)
        : Infinity

      if (minutesSinceLastAlert >= settings.screamModeAlertIntervalMinutes) {
        void triggerScreamMode(now, minutesInactive)
      }
    }

    screamModeCheckIntervalRef.current = setInterval(checkScreamMode, 30000)
    checkScreamMode()

    return () => {
      if (screamModeCheckIntervalRef.current) {
        clearInterval(screamModeCheckIntervalRef.current)
        screamModeCheckIntervalRef.current = null
      }
      if (screamFlashTimeoutRef.current) {
        clearTimeout(screamFlashTimeoutRef.current)
        screamFlashTimeoutRef.current = null
      }
    }
  }, [
    settings.enableScreamMode,
    settings.alertsEnabled,
    settings.screamModeInactivityMinutes,
    settings.screamModeAlertIntervalMinutes,
    settings.screamModeSoundEnabled,
    settings.alertSoundEnabled,
    settings.alertSoundVolume,
    settings.alertCooldownMinutes,
    isRunning,
    sessionStarted,
    playAlertSound,
    handleUpdateTracking,
    fetchRandomScreamModeInsult,
    isWithinStartupGracePeriod,
    appMountedAt,
  ])

  // Scream mode reset on timer start
  useEffect(() => {
    if (!isRunning || !sessionStarted) return
    const tracking = alertTrackingRef.current
    if (tracking.screamModeActivatedAt === null && tracking.screamModeLastAlertAt === null && !showScreamFlash) {
      return
    }
    handleUpdateTracking({
      ...tracking,
      screamModeActivatedAt: null,
      screamModeLastAlertAt: null,
    })
    setShowScreamFlash(false)
    setCurrentScreamInsult(null)
  }, [isRunning, sessionStarted, showScreamFlash, handleUpdateTracking])

  return {
    alertTemplates,
    setAlertTemplates,
    alertTracking,
    setAlertTracking,
    alertTrackingRef,
    handleUpdateTracking,
    handleUpdateAlertTemplates,
    showScreamFlash,
    currentScreamInsult,
    screamModeInactiveMinutes,
    handleDismissScreamMode,
    visibleMessages,
    onMessageHover,
    triggerTestAlert,
  }
}
