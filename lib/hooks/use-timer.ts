"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ConfettiRef } from "@/components/ui/confetti"
import type { Category, GoogleCalendarEventFormat, Task } from "@/lib/types"
import type { NudgeSettings } from "@/lib/settings-store"
import { DEFAULT_SETTINGS } from "@/lib/settings-store"
import type { Database } from "@/lib/storage"
import type { AlertTracking } from "@/lib/alert-types"
import {
  clearSessionFromLocalStorage,
  saveSessionToLocalStorage,
  type ActiveSessionState,
} from "@/lib/session-storage"
import { formatDuration } from "@/lib/time-utils"
import { toast } from "@/hooks/use-toast"

// Utility function to format overtime description for calendar events
function formatOvertimeDescription(plannedMinutes: number, overtimeMinutes: number): string {
  const totalMinutes = plannedMinutes + overtimeMinutes
  return `Planned: ${plannedMinutes}min, Overtime: ${overtimeMinutes}min, Total: ${totalMinutes}min`
}

type SaveOptions = {
  onRollback?: (data: Database) => void
}

interface UseTimerParams {
  settings: NudgeSettings
  categories: Category[]
  activeTaskId: string | null
  setActiveTaskId: (id: string | null) => void
  activeProject: Category | null
  activeTask: Task | null
  buildDatabase: (categories: Category[]) => Database
  saveData: (data: Database, options?: SaveOptions) => void
  saveDataImmediate: (data: Database, options?: SaveOptions) => void
  applyDatabase: (data: Database) => void
  alertTracking: AlertTracking
  handleUpdateTracking: (tracking: AlertTracking) => void
  createGoogleCalendarEvent: (
    task: Task | null,
    project: Category | null,
    durationMinutes: number,
    eventFormat: GoogleCalendarEventFormat,
    isBreak?: boolean,
    breakType?: "SHORT_BREAK" | "LONG_BREAK",
  ) => Promise<string | null>
  updateGoogleCalendarEvent: (
    eventId: string,
    startTime: string,
    durationMinutes: number,
    description: string,
  ) => Promise<boolean>
  queueCalendarUpdate: (update: {
    eventId: string
    startTime: string
    durationMinutes: number
    description: string
  }) => void
  calendarUpdateRetryableRef: React.RefObject<boolean>
  persistCategories: (nextCategories: Category[], previousData: Database, immediate?: boolean) => void
  handleCheckDailyReset: () => void
  setHistory: React.Dispatch<React.SetStateAction<Database["history"]>>
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
}

function useTimer({
  settings,
  categories,
  activeTaskId,
  setActiveTaskId,
  activeProject,
  activeTask,
  buildDatabase,
  saveData,
  saveDataImmediate,
  applyDatabase,
  alertTracking,
  handleUpdateTracking,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  queueCalendarUpdate,
  calendarUpdateRetryableRef,
  persistCategories,
  handleCheckDailyReset,
  setHistory,
  setCategories,
}: UseTimerParams) {
  // --- State ---
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.pomodoroMinutes * 60)
  const [initialTime, setInitialTime] = useState(DEFAULT_SETTINGS.pomodoroMinutes * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [timerMode, setTimerMode] = useState<"FOCUS" | "SHORT_BREAK" | "LONG_BREAK">("FOCUS")
  const [isOvertime, setIsOvertime] = useState(false)
  const [overtimeSeconds, setOvertimeSeconds] = useState(0)
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null)

  // --- Refs ---
  const alarmStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioUnlockedRef = useRef(false)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const audioFileRef = useRef<string | null>(null)
  const generatedChimeRef = useRef<{
    context: AudioContext | null
    gain: GainNode | null
    oscillators: OscillatorNode[]
  } | null>(null)
  const confettiRef = useRef<ConfettiRef>(null)
  const confettiIntervalRef = useRef<number | null>(null)
  const calendarEventCreatedRef = useRef<string | null>(null)
  const calendarEventIdRef = useRef<string | null>(null)
  const workTrackingTickRef = useRef(0)
  const workTrackingDirtyRef = useRef(false)
  const workTrackingPendingRef = useRef<Category[] | null>(null)
  const workTrackingPreviousDataRef = useRef<Database | null>(null)
  const completionPlayedRef = useRef(false)

  // --- Computed ---
  const isLongBreakAvailable = (alertTracking.globalSessionCounter ?? 0) >= settings.longBreakEvery

  // --- getModeSeconds ---
  const getModeSeconds = useCallback(
    (mode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK") => {
      if (mode === "SHORT_BREAK") return settings.shortBreakMinutes * 60
      if (mode === "LONG_BREAK") return settings.longBreakMinutes * 60
      return settings.pomodoroMinutes * 60
    },
    [settings.shortBreakMinutes, settings.longBreakMinutes, settings.pomodoroMinutes],
  )

  // --- buildSessionState ---
  const buildSessionState = useCallback(
    (overrides?: Partial<ActiveSessionState>): ActiveSessionState => {
      return {
        isRunning,
        sessionStarted,
        timerMode,
        sessionStartTime: sessionStartTime ?? Date.now(),
        initialTime,
        activeTaskId,
        calendarEventId: calendarEventIdRef.current,
        isOvertime,
        overtimeSeconds,
        pausedAt: null,
        pausedTimeLeft: null,
        ...overrides,
      }
    },
    [activeTaskId, initialTime, isOvertime, isRunning, overtimeSeconds, sessionStartTime, sessionStarted, timerMode],
  )

  // --- handleOvertimeChange ---
  const handleOvertimeChange = useCallback(
    (seconds: number) => {
      setOvertimeSeconds(seconds)
      if (!isOvertime || !isRunning) return

      // Only persist every 10 seconds to reduce I/O.
      // IMPORTANT: Only save to localStorage here — never do a full saveData()
      // because the categories closure could be stale, and saveDb() destructively
      // deletes categories not present in the incoming data.
      if (seconds % 10 !== 0) return

      const state = buildSessionState({ overtimeSeconds: seconds })
      saveSessionToLocalStorage(state)
    },
    [buildSessionState, isOvertime, isRunning],
  )

  // --- Periodic session persistence effect ---
  // Saves session state to localStorage every 10 seconds during active sessions
  // (both countdown and overtime).
  // IMPORTANT: Only saves to localStorage — never calls saveData() because the
  // categories closure could be stale, and saveDb() destructively deletes
  // categories not present in the incoming data.
  useEffect(() => {
    if (!isRunning || !sessionStarted) return

    const interval = setInterval(() => {
      const state = buildSessionState()
      saveSessionToLocalStorage(state)
    }, 10_000)

    return () => clearInterval(interval)
  }, [buildSessionState, isRunning, sessionStarted])

  // --- Save session state on tab close via beforeunload ---
  // React cleanup effects do NOT fire when the browser closes the tab,
  // so we use beforeunload as the reliable save point.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionStarted) {
        const state = buildSessionState()
        saveSessionToLocalStorage(state)
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      // Also save on SPA unmount (navigation within the app)
      handleBeforeUnload()
    }
  }, [buildSessionState, sessionStarted])

  // --- handleEndSession ---
  const handleEndSession = useCallback(() => {
    const completedAt = Date.now()
    const nowIso = new Date(completedAt).toISOString()
    const totalSeconds = initialTime + overtimeSeconds
    const completedTaskId = activeTaskId
    const calendarEventId = calendarEventIdRef.current
    const effectiveStartTime = sessionStartTime ?? completedAt
    const totalDurationMinutes = Math.ceil((initialTime + overtimeSeconds) / 60)
    const plannedMinutes = initialTime / 60
    const overtimeMinutes = overtimeSeconds / 60

    if (completedTaskId) {
      const previousData = buildDatabase(categories)
      setHistory((prev) => {
        const nextHistory = [
          {
            taskId: completedTaskId,
            completedAt,
            startTime: sessionStartTime ?? completedAt,
            duration: initialTime,
            overtimeDuration: overtimeSeconds,
            calendarEventId: calendarEventId ?? undefined,
          },
          ...(prev ?? []),
        ]
        const nextData = { ...previousData, history: nextHistory }
        saveDataImmediate(nextData, { onRollback: () => applyDatabase(previousData) })
        return nextHistory
      })
    }

    const shouldSyncOvertime =
      settings.googleCalendarAutoSync &&
      settings.googleCalendarConnected &&
      settings.googleCalendarSyncOvertime &&
      typeof calendarEventId === "string"

    if (
      settings.googleCalendarAutoSync &&
      settings.googleCalendarConnected &&
      settings.googleCalendarSyncOvertime &&
      !calendarEventId
    ) {
      console.warn("Missing calendar event ID for overtime sync; skipping update.")
    }

    if (shouldSyncOvertime) {
      const startTimeIso = new Date(effectiveStartTime).toISOString()
      const description = formatOvertimeDescription(plannedMinutes, overtimeMinutes)
      // Capture current database state before async call to avoid stale closure
      const capturedPreviousData = buildDatabase(categories)
      void (async () => {
        const syncSucceeded = await updateGoogleCalendarEvent(
          calendarEventId,
          startTimeIso,
          totalDurationMinutes,
          description,
        )
        if (syncSucceeded) {
          if (completedTaskId) {
            setHistory((prev) => {
              if (!prev || prev.length === 0) return prev ?? []
              const [latest, ...rest] = prev
              if (latest.taskId !== completedTaskId || latest.completedAt !== completedAt) return prev
              const nextHistory = [{ ...latest, calendarEventId }, ...rest]
              const nextData = { ...capturedPreviousData, history: nextHistory }
              saveDataImmediate(nextData, { onRollback: () => applyDatabase(capturedPreviousData) })
              return nextHistory
            })
          }
        } else if (calendarUpdateRetryableRef.current) {
          queueCalendarUpdate({
            eventId: calendarEventId,
            startTime: startTimeIso,
            durationMinutes: totalDurationMinutes,
            description,
          })
          toast({
            title: "Calendar update queued",
            description: "We'll retry when the connection stabilizes.",
          })
        }
      })()
    }

    const nextCount = alertTracking.globalSessionCounter ?? 0
    const shouldLongBreak = nextCount >= settings.longBreakEvery
    const nextMode = shouldLongBreak ? "LONG_BREAK" : "SHORT_BREAK"
    const nextSeconds = getModeSeconds(nextMode)
    handleUpdateTracking({
      ...alertTracking,
      lastSessionCompletedAt: nowIso,
    })
    setTimerMode(nextMode)
    setInitialTime(nextSeconds)
    setTimeLeft(nextSeconds)
    setActiveTaskId(null)
    setIsOvertime(false)
    setOvertimeSeconds(0)
    setIsRunning(false)
    setSessionStarted(false)
    setSessionStartTime(null)
    calendarEventCreatedRef.current = null
    calendarEventIdRef.current = null
    clearSessionFromLocalStorage()

    toast({
      title: "Session ended",
      description: `Total focus time: ${formatDuration(totalSeconds)}`,
    })
  }, [
    activeTaskId,
    alertTracking,
    applyDatabase,
    buildDatabase,
    categories,
    getModeSeconds,
    handleUpdateTracking,
    initialTime,
    overtimeSeconds,
    queueCalendarUpdate,
    saveDataImmediate,
    sessionStartTime,
    settings.longBreakEvery,
    settings.googleCalendarAutoSync,
    settings.googleCalendarConnected,
    settings.googleCalendarSyncOvertime,
    updateGoogleCalendarEvent,
    calendarUpdateRetryableRef,
    setActiveTaskId,
    setHistory,
  ])

  // --- unlockAudioContext ---
  const unlockAudioContext = useCallback(async () => {
    if (audioUnlockedRef.current) return true
    const AudioContextConstructor =
      typeof window !== "undefined"
        ? (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined
    if (!AudioContextConstructor) return false
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextConstructor()
    }
    try {
      await audioContextRef.current.resume()
      audioUnlockedRef.current = audioContextRef.current.state === "running"
    } catch {
      audioUnlockedRef.current = false
    }
    return audioUnlockedRef.current
  }, [])

  // --- handleToggleRunning ---
  const handleToggleRunning = async () => {
    void unlockAudioContext()
    const wasRunning = isRunning
    const wasSessionStarted = sessionStarted
    const currentTimeLeft = timeLeft
    const currentInitialTime = initialTime

    if (!wasRunning) {
      handleCheckDailyReset()
      const isNewSession = !wasSessionStarted || currentTimeLeft === currentInitialTime

      if (
        settings.googleCalendarAutoSync &&
        settings.googleCalendarConnected &&
        timerMode === "FOCUS" &&
        (!activeTask || !activeProject) &&
        isNewSession
      ) {
        toast({
          title: "No task selected",
          description: "Select a task to sync with Google Calendar",
          variant: "destructive",
        })
      }

      const startTime = isNewSession ? Date.now() : (sessionStartTime ?? Date.now())
      if (isNewSession) {
        setSessionStartTime(startTime)
      }

      setIsRunning(true)
      setSessionStarted(true)
      if (isNewSession) {
        calendarEventCreatedRef.current = null
        calendarEventIdRef.current = null
      }

      // Save session state IMMEDIATELY before any async work (calendar event creation).
      // React cleanup effects do not fire on tab close, so this is the only
      // guaranteed save before the 10-second periodic interval kicks in.
      saveSessionToLocalStorage({
        isRunning: true,
        sessionStarted: true,
        timerMode,
        sessionStartTime: startTime,
        initialTime: currentInitialTime,
        activeTaskId,
        calendarEventId: calendarEventIdRef.current,
        isOvertime,
        overtimeSeconds,
        pausedAt: null,
        pausedTimeLeft: null,
      })

      if (
        isNewSession &&
        settings.googleCalendarAutoSync &&
        settings.googleCalendarConnected &&
        activeTask &&
        activeProject &&
        timerMode === "FOCUS" &&
        calendarEventCreatedRef.current === null
      ) {
        const eventId = await createGoogleCalendarEvent(
          activeTask,
          activeProject,
          settings.pomodoroMinutes,
          settings.googleCalendarEventFormat,
        )
        if (eventId) {
          calendarEventCreatedRef.current = eventId
          calendarEventIdRef.current = eventId
        }
      }

      if (
        isNewSession &&
        settings.googleCalendarAutoSync &&
        settings.googleCalendarConnected &&
        (timerMode === "SHORT_BREAK" || timerMode === "LONG_BREAK")
      ) {
        const breakType = timerMode
        if (!calendarEventCreatedRef.current) {
          const breakDurationMinutes =
            breakType === "SHORT_BREAK" ? settings.shortBreakMinutes : settings.longBreakMinutes
          const eventId = await createGoogleCalendarEvent(null, null, breakDurationMinutes, "task", true, breakType)
          if (eventId) {
            calendarEventCreatedRef.current = eventId
          }
        }
      }

      if (timerMode === "SHORT_BREAK" || timerMode === "LONG_BREAK") {
        const updatedTracking = {
          ...alertTracking,
          lastBreakActivatedAt: new Date().toISOString(),
          breakReminderRound: 0,
        }
        handleUpdateTracking(updatedTracking)
      }

      // Update localStorage with calendar event ID if it was created
      if (calendarEventIdRef.current) {
        saveSessionToLocalStorage({
          isRunning: true,
          sessionStarted: true,
          timerMode,
          sessionStartTime: startTime,
          initialTime: currentInitialTime,
          activeTaskId,
          calendarEventId: calendarEventIdRef.current,
          isOvertime,
          overtimeSeconds,
          pausedAt: null,
          pausedTimeLeft: null,
        })
      }
      return
    }

    // Pausing
    setIsRunning(false)
    if (alarmStopTimeoutRef.current) {
      clearTimeout(alarmStopTimeoutRef.current)
      alarmStopTimeoutRef.current = null
    }
    if (currentTimeLeft === currentInitialTime) {
      setSessionStarted(false)
      setTimerMode("FOCUS")
      setSessionStartTime(null)
      clearSessionFromLocalStorage()
    } else {
      // Save paused state
      const pausedState: ActiveSessionState = {
        isRunning: false,
        sessionStarted: true,
        timerMode,
        sessionStartTime: sessionStartTime ?? Date.now(),
        initialTime: currentInitialTime,
        activeTaskId,
        calendarEventId: calendarEventIdRef.current,
        isOvertime,
        overtimeSeconds,
        pausedAt: Date.now(),
        pausedTimeLeft: currentTimeLeft,
      }
      saveSessionToLocalStorage(pausedState)
    }
  }

  // --- exitFocus ---
  const exitFocus = useCallback(() => {
    setIsRunning(false)
    setSessionStarted(false)
    setTimerMode("FOCUS")
    setTimeLeft(initialTime)
    setActiveTaskId(null)
    calendarEventCreatedRef.current = null
    calendarEventIdRef.current = null
    clearSessionFromLocalStorage()
    setIsOvertime(false)
    setOvertimeSeconds(0)
    if (alarmStopTimeoutRef.current) {
      clearTimeout(alarmStopTimeoutRef.current)
      alarmStopTimeoutRef.current = null
    }
  }, [initialTime, setActiveTaskId])

  // --- handleSkipBreak ---
  const handleSkipBreak = useCallback(() => {
    if (timerMode !== "SHORT_BREAK" && timerMode !== "LONG_BREAK") {
      return
    }

    const focusSeconds = getModeSeconds("FOCUS")
    setTimerMode("FOCUS")
    setInitialTime(focusSeconds)
    setTimeLeft(focusSeconds)
    setIsRunning(false)
    setSessionStarted(false)
    calendarEventCreatedRef.current = null
    calendarEventIdRef.current = null
    clearSessionFromLocalStorage()
    setIsOvertime(false)
    setOvertimeSeconds(0)
    if (alarmStopTimeoutRef.current) {
      clearTimeout(alarmStopTimeoutRef.current)
      alarmStopTimeoutRef.current = null
    }
  }, [timerMode, getModeSeconds])

  // --- handleSelectTimerMode ---
  const handleSelectTimerMode = useCallback(
    (nextMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK") => {
      if (isRunning) return
      const nextSeconds = getModeSeconds(nextMode)
      setTimerMode(nextMode)
      setInitialTime(nextSeconds)
      setTimeLeft(nextSeconds)
      setIsRunning(false)
      setSessionStarted(false)
      calendarEventCreatedRef.current = null
      calendarEventIdRef.current = null
      clearSessionFromLocalStorage()
      setIsOvertime(false)
      setOvertimeSeconds(0)
      if (alarmStopTimeoutRef.current) {
        clearTimeout(alarmStopTimeoutRef.current)
        alarmStopTimeoutRef.current = null
      }
    },
    [getModeSeconds, isRunning],
  )

  // --- Timer mode sync effect ---
  // Synchronize timeLeft/initialTime when settings change while idle.
  // setState is intentional here — this synchronizes derived timer state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isRunning || sessionStarted) return
    const nextSeconds = getModeSeconds(timerMode)
    if (nextSeconds !== initialTime) {
      setInitialTime(nextSeconds)
      setTimeLeft(nextSeconds)
    }
  }, [isRunning, sessionStarted, timerMode, getModeSeconds, initialTime])
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- triggerSessionConfetti ---
  const triggerSessionConfetti = useCallback(() => {
    if (typeof window === "undefined") return
    if (!settings.confettiEnabled) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (!confettiRef.current) return

    if (confettiIntervalRef.current !== null) {
      window.clearInterval(confettiIntervalRef.current)
      confettiIntervalRef.current = null
    }

    const duration = 2200
    const animationEnd = Date.now() + duration
    const defaults = {
      startVelocity: 28,
      spread: 360,
      ticks: 60,
      zIndex: 0,
      colors: ["#f5f5f5", "#e5e5e5", "#a3a3a3", "#737373"],
    }

    const intervalId = window.setInterval(() => {
      const timeLeftForAnimation = animationEnd - Date.now()
      if (timeLeftForAnimation <= 0) {
        window.clearInterval(intervalId)
        confettiIntervalRef.current = null
        return
      }

      const particleCount = Math.max(18, 50 * (timeLeftForAnimation / duration))
      confettiRef.current?.fire({
        ...defaults,
        particleCount,
        origin: {
          x: Math.random() * 0.4 + 0.3,
          y: Math.random() * 0.2 + 0.1,
        },
      })
    }, 250)
    confettiIntervalRef.current = intervalId
  }, [settings.confettiEnabled])

  // --- Confetti cleanup effect ---
  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return
      if (confettiIntervalRef.current !== null) {
        window.clearInterval(confettiIntervalRef.current)
        confettiIntervalRef.current = null
      }
    }
  }, [])

  // --- playGeneratedChime ---
  const playGeneratedChime = useCallback(
    async (volume: number) => {
      const unlocked = await unlockAudioContext()
      if (!unlocked || !audioContextRef.current) {
        toast({ title: "Done.", description: "Sound disabled by browser." })
        return
      }

      const context = audioContextRef.current
      const now = context.currentTime

      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(volume * 0.8, now + 0.08)
      gain.gain.setValueAtTime(volume * 0.8, now + 0.7)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95)
      gain.connect(context.destination)

      const osc1 = context.createOscillator()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(523, now)
      osc1.connect(gain)

      const osc2 = context.createOscillator()
      osc2.type = "sine"
      osc2.frequency.setValueAtTime(659, now + 0.3)
      osc2.connect(gain)

      const osc3 = context.createOscillator()
      osc3.type = "sine"
      osc3.frequency.setValueAtTime(784, now + 0.6)
      osc3.connect(gain)

      generatedChimeRef.current = {
        context,
        gain,
        oscillators: [osc1, osc2, osc3],
      }

      osc1.start(now)
      osc1.stop(now + 0.25)
      osc2.start(now + 0.3)
      osc2.stop(now + 0.55)
      osc3.start(now + 0.6)
      osc3.stop(now + 0.95)
    },
    [unlockAudioContext],
  )

  // --- playAlertSound ---
  const playAlertSound = useCallback(
    async (volume: number) => {
      const unlocked = await unlockAudioContext()
      if (!unlocked || !audioContextRef.current) {
        return
      }

      const context = audioContextRef.current
      const now = context.currentTime
      const adjustedVolume = Math.min(1, Math.max(0, volume)) * 0.7

      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.connect(context.destination)

      const firstStart = now
      const firstEnd = firstStart + 0.2
      const secondStart = firstEnd + 0.03
      const secondEnd = secondStart + 0.2

      gain.gain.setValueAtTime(0.0001, firstStart)
      gain.gain.exponentialRampToValueAtTime(adjustedVolume, firstStart + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, firstEnd)
      gain.gain.setValueAtTime(0.0001, secondStart)
      gain.gain.exponentialRampToValueAtTime(adjustedVolume, secondStart + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, secondEnd)

      const osc1 = context.createOscillator()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(440, firstStart)
      osc1.connect(gain)
      osc1.start(firstStart)
      osc1.stop(firstEnd)

      const osc2 = context.createOscillator()
      osc2.type = "sine"
      osc2.frequency.setValueAtTime(554, secondStart)
      osc2.connect(gain)
      osc2.start(secondStart)
      osc2.stop(secondEnd)
    },
    [unlockAudioContext],
  )

  // --- playAudioFile ---
  const playAudioFile = useCallback(async (file: string, volume: number) => {
    const url = `/sounds/${file}`
    if (!audioElementRef.current || audioFileRef.current !== url) {
      audioElementRef.current = new Audio(url)
      audioFileRef.current = url
    }
    const element = audioElementRef.current
    element.volume = Math.min(1, Math.max(0, volume))
    element.currentTime = 0
    try {
      await element.play()
      return true
    } catch {
      return false
    }
  }, [])

  // --- playCompletionSound ---
  const playCompletionSound = useCallback(
    async (volume: number, soundFile?: string) => {
      if (soundFile && soundFile !== "generated") {
        const played = await playAudioFile(soundFile, volume)
        if (played) return
      }
      await playGeneratedChime(volume)
    },
    [playAudioFile, playGeneratedChime],
  )

  // --- playTestSound ---
  const playTestSound = useCallback(
    async (volume: number, soundFile?: string) => {
      const cappedVolume = Math.min(volume, 0.35)
      await playCompletionSound(cappedVolume, soundFile)
    },
    [playCompletionSound],
  )

  // --- clearAlarmStopTimeout ---
  const clearAlarmStopTimeout = useCallback(() => {
    if (alarmStopTimeoutRef.current) {
      clearTimeout(alarmStopTimeoutRef.current)
      alarmStopTimeoutRef.current = null
    }
  }, [])

  // --- stopCompletionAudio ---
  const stopCompletionAudio = useCallback(async () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.currentTime = 0
    }

    const activeChime = generatedChimeRef.current
    if (activeChime) {
      activeChime.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop()
        } catch {
          // no-op: oscillator may already be stopped
        }
        try {
          oscillator.disconnect()
        } catch {
          // no-op
        }
      })
      if (activeChime.gain) {
        try {
          activeChime.gain.disconnect()
        } catch {
          // no-op
        }
      }
    }
    generatedChimeRef.current = null

    const context = audioContextRef.current
    if (context && context.state !== "closed") {
      try {
        await context.close()
      } catch {
        // no-op
      }
    }
    audioContextRef.current = null
    audioUnlockedRef.current = false
  }, [])

  // --- Timer completion effect ---
  // This effect is a state machine transition when the timer reaches zero.
  // The setState calls are intentional — they drive the next timer mode.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!sessionStarted) {
      completionPlayedRef.current = false
      return
    }
    if (timeLeft > 0) {
      completionPlayedRef.current = false
      return
    }
    if (completionPlayedRef.current) return
    completionPlayedRef.current = true

    if (settings.completionSoundEnabled) {
      void playCompletionSound(settings.completionSoundVolume, settings.completionSoundFile)
    } else {
      toast({ title: "Done." })
    }
    triggerSessionConfetti()
    const nowIso = new Date().toISOString()
    clearAlarmStopTimeout()
    alarmStopTimeoutRef.current = setTimeout(() => {
      void stopCompletionAudio()
      alarmStopTimeoutRef.current = null
    }, 3000)

    if (timerMode === "FOCUS" && !isOvertime) {
      const nextCount = (alertTracking.globalSessionCounter ?? 0) + 1
      handleUpdateTracking({
        ...alertTracking,
        globalSessionCounter: nextCount,
        lastSessionCompletedAt: nowIso,
      })
      setIsOvertime(true)
      setOvertimeSeconds(0)
      return () => {
        clearAlarmStopTimeout()
      }
    }
    if (timerMode === "FOCUS") {
      const nextCount = (alertTracking.globalSessionCounter ?? 0) + 1
      const shouldLongBreak = nextCount >= settings.longBreakEvery
      const nextMode = shouldLongBreak ? "LONG_BREAK" : "SHORT_BREAK"
      const nextSeconds = getModeSeconds(nextMode)
      handleUpdateTracking({
        ...alertTracking,
        globalSessionCounter: nextCount,
        lastSessionCompletedAt: nowIso,
      })
      setTimerMode(nextMode)
      setInitialTime(nextSeconds)
      setTimeLeft(nextSeconds)
      setActiveTaskId(null)
    } else {
      const nextSeconds = getModeSeconds("FOCUS")
      if (timerMode === "LONG_BREAK" && alertTracking.globalSessionCounter !== 0) {
        handleUpdateTracking({
          ...alertTracking,
          globalSessionCounter: 0,
        })
      }
      setTimerMode("FOCUS")
      setInitialTime(nextSeconds)
      setTimeLeft(nextSeconds)
    }
    setIsOvertime(false)
    setOvertimeSeconds(0)
    setIsRunning(false)
    setSessionStarted(false)
    setSessionStartTime(null)
    calendarEventCreatedRef.current = null
    calendarEventIdRef.current = null
    return () => {
      clearAlarmStopTimeout()
    }
  /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    sessionStarted,
    timeLeft,
    timerMode,
    alertTracking,
    settings.completionSoundEnabled,
    settings.completionSoundVolume,
    settings.completionSoundFile,
    settings.longBreakEvery,
    isOvertime,
    getModeSeconds,
    handleUpdateTracking,
    playCompletionSound,
    clearAlarmStopTimeout,
    stopCompletionAudio,
    triggerSessionConfetti,
    setActiveTaskId,
  ])

  // --- Audio unlock effect ---
  useEffect(() => {
    const handleUnlock = () => {
      unlockAudioContext()
    }
    window.addEventListener("pointerdown", handleUnlock, { once: true })
    return () => window.removeEventListener("pointerdown", handleUnlock)
  }, [unlockAudioContext])

  // --- Work tracking effect ---
  useEffect(() => {
    if (!isRunning || timerMode !== "FOCUS") return
    if (!activeTaskId || !activeProject || activeProject.projectType !== "work") return

    workTrackingTickRef.current = 0
    workTrackingDirtyRef.current = false
    workTrackingPendingRef.current = null
    workTrackingPreviousDataRef.current = null

    const interval = setInterval(() => {
      workTrackingTickRef.current += 1
      setCategories((cats) => {
        const previousData = buildDatabase(cats)
        let didUpdate = false
        const updated = cats.map((cat) => {
          if (cat.id !== activeProject.id) return cat
          const nextTasks = (cat.tasks ?? []).map((task) => {
            if (task.id !== activeTaskId) return task
            didUpdate = true
            const nextSpentTime = (typeof task.spentTime === "number" ? task.spentTime : 0) + 1
            return { ...task, spentTime: nextSpentTime }
          })
          return didUpdate ? { ...cat, tasks: nextTasks } : cat
        })

        if (didUpdate && workTrackingTickRef.current % 10 === 0) {
          persistCategories(updated, previousData)
          workTrackingDirtyRef.current = false
          workTrackingPendingRef.current = null
          workTrackingPreviousDataRef.current = null
        }

        if (didUpdate) {
          workTrackingDirtyRef.current = true
          workTrackingPendingRef.current = updated
          workTrackingPreviousDataRef.current = previousData
          return updated
        }

        return cats
      })
    }, 1000)

    return () => {
      clearInterval(interval)
      if (workTrackingDirtyRef.current && workTrackingPendingRef.current) {
        const previousData =
          workTrackingPreviousDataRef.current ?? buildDatabase(workTrackingPendingRef.current)
        persistCategories(workTrackingPendingRef.current, previousData, true)
        workTrackingDirtyRef.current = false
        workTrackingPendingRef.current = null
        workTrackingPreviousDataRef.current = null
      }
    }
  }, [isRunning, timerMode, activeTaskId, activeProject, buildDatabase, persistCategories, setCategories])

  const restoreSessionState = useCallback(
    (state: ActiveSessionState) => {
      setTimerMode(state.timerMode)
      setInitialTime(state.initialTime ?? getModeSeconds(state.timerMode))
      setSessionStartTime(state.sessionStartTime)
      calendarEventIdRef.current = state.calendarEventId ?? null
      // Restore activeTaskId directly via the stable setter from useTimer's props.
      // This avoids relying on the loadDatabase closure which may capture a stale
      // categoryManager reference.
      setActiveTaskId(state.activeTaskId)

      if (state.pausedAt !== null && state.pausedTimeLeft !== null) {
        // Paused session — restore timeLeft, keep paused
        setTimeLeft(state.pausedTimeLeft)
        setIsRunning(false)
        setSessionStarted(true)
        setIsOvertime(state.isOvertime)
        setOvertimeSeconds(state.overtimeSeconds)
        if (state.isOvertime) {
          completionPlayedRef.current = true
        }
      } else if (state.isOvertime) {
        // Running overtime
        const elapsed = (Date.now() - state.sessionStartTime) / 1000
        const effectiveInitial = state.initialTime ?? getModeSeconds(state.timerMode)
        completionPlayedRef.current = true
        setIsOvertime(true)
        setOvertimeSeconds(Math.floor(elapsed - effectiveInitial))
        setTimeLeft(0)
        setIsRunning(true)
        setSessionStarted(true)
      } else {
        // Running countdown
        const elapsed = (Date.now() - state.sessionStartTime) / 1000
        const effectiveInitial = state.initialTime ?? getModeSeconds(state.timerMode)
        const remaining = Math.max(0, effectiveInitial - Math.floor(elapsed))
        if (remaining > 0) {
          setTimeLeft(remaining)
          setIsRunning(true)
          setSessionStarted(true)
          setIsOvertime(false)
          setOvertimeSeconds(0)
        } else {
          // Crossed into overtime while tab was closed
          completionPlayedRef.current = true
          setTimeLeft(0)
          setIsOvertime(true)
          setOvertimeSeconds(Math.floor(elapsed - effectiveInitial))
          setIsRunning(true)
          setSessionStarted(true)
        }
      }
    },
    [getModeSeconds, setActiveTaskId],
  )

  return {
    timeLeft,
    setTimeLeft,
    initialTime,
    isRunning,
    setIsRunning,
    sessionStarted,
    timerMode,
    isOvertime,
    overtimeSeconds,
    sessionStartTime,
    handleToggleRunning,
    handleEndSession,
    handleSkipBreak,
    handleSelectTimerMode,
    exitFocus,
    handleOvertimeChange,
    getModeSeconds,
    isLongBreakAvailable,
    unlockAudioContext,
    playAlertSound,
    playTestSound,
    playCompletionSound,
    confettiRef,
    audioElementRef,
    restoreSessionState,
  }
}

export default useTimer
