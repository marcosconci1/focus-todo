"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import Timer from "@/components/timer"
import SettingsMenu from "@/components/settings-menu"
import UrgencyClock from "@/components/urgency-clock"
import { Confetti } from "@/components/ui/confetti"
import { Spinner } from "@/components/ui/spinner"
import ModalPortal from "@/components/modal-portal"
import type { Category } from "@/lib/types"
import { checkAndResetDailyProjects, getDayWindowKey, sortCategoriesWithHabitsFirst } from "@/lib/daily-reset"
import { DEFAULT_SETTINGS, type NudgeSettings } from "@/lib/settings-store"
import { usePersistence } from "@/lib/use-persistence"
import type { Database } from "@/lib/storage"
import {
  clearSessionFromLocalStorage,
  loadSessionFromLocalStorage,
} from "@/lib/session-storage"
import { toast } from "@/hooks/use-toast"
import TerminalMessageFeed from "@/components/terminal-message-feed"
import {
  DEFAULT_ALERT_TEMPLATES,
  DEFAULT_ALERT_TRACKING,
  type AlertTemplate,
  type AlertTracking,
} from "@/lib/alert-types"
import { generateRealityCheckTemplates, loadRealityCheckMessages } from "@/lib/reality-checks"
import { replacePlaceholders } from "@/lib/scream-mode-insults-data"
import { normalizeColor, normalizeCategoriesForSave } from "@/lib/validation/category-validation"
import useSettingsManager from "@/lib/hooks/use-settings-manager"
import useCategoryManager from "@/lib/hooks/use-category-manager"
import useCalendarSync from "@/lib/hooks/use-calendar-sync"
import useAlertManager from "@/lib/hooks/use-alert-manager"
import useTimer from "@/lib/hooks/use-timer"

// Disable SSR for TaskCategories to prevent DndKit hydration mismatch
const TaskCategories = dynamic(() => import("@/components/task-categories"), {
  ssr: false,
})

export default function Home() {
  // ── Page-level state ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<Database["history"]>([])
  const [metadata, setMetadata] = useState<Database["metadata"]>({})
  const metadataRef = useRef<Database["metadata"]>({})
  const appMountedAtRef = useRef<number | null>(Date.now())
  const isMountedRef = useRef(true)

  // Project creation modal
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectColor, setNewProjectColor] = useState("#ffffff")
  const [newProjectIsHabitProject, setNewProjectIsHabitProject] = useState(false)
  const [newProjectType, setNewProjectType] = useState<"project" | "habit" | "work">("project")

  // Saving indicator
  const [showSavingIndicator, setShowSavingIndicator] = useState(false)
  const [savingIndicatorVisible, setSavingIndicatorVisible] = useState(false)
  const savingStartTimeRef = useRef<number | null>(null)
  const savingVisibleAtRef = useRef<number | null>(null)
  const savingShowDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minimumDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSavingRef = useRef(false)

  // ── Persistence ───────────────────────────────────────────────────────────
  const {
    loadData,
    saveData,
    saveDataImmediate,
    isSaving,
    error: persistenceError,
    isStale,
    lastLoadedAt,
    isOffline,
  } = usePersistence()

  const isWithinStartupGracePeriod = useCallback(() => {
    const mountedAt = appMountedAtRef.current
    return mountedAt !== null && Date.now() - mountedAt < 30000
  }, [])

  // ── Bridge refs for cross-hook circular dependencies ──────────────────────
  // Shared categories ref — updated by categoryManager, read by settingsManager & calendarSync
  const categoriesRef = useRef<Category[]>([])
  // Guard: prevents saves before initial database load completes
  const dataLoadedRef = useRef(false)

  // Timer values needed by useAlertManager (one-render stale, acceptable for effects)
  const prevTimerRef = useRef({
    isRunning: false,
    sessionStarted: false,
    timerMode: "FOCUS" as "FOCUS" | "SHORT_BREAK" | "LONG_BREAK",
  })
  // Callback bridges (stable wrappers delegating to latest implementation via ref)
  const handleUpdateTrackingRef = useRef<(tracking: AlertTracking) => void>(() => {})
  const handleUpdateTrackingBridge = useCallback(
    (tracking: AlertTracking) => {
      handleUpdateTrackingRef.current(tracking)
    },
    [],
  )
  const playAlertSoundRef = useRef<(volume: number) => Promise<void>>(async () => {})
  const playAlertSoundBridge = useCallback(
    async (volume: number) => {
      await playAlertSoundRef.current(volume)
    },
    [],
  )
  const audioElementBridgeRef = useRef<HTMLAudioElement | null>(null)
  const alertTrackingRef = useRef<AlertTracking>(DEFAULT_ALERT_TRACKING)
  const handleCheckDailyResetRef = useRef<() => void>(() => {})
  const handleCheckDailyResetBridge = useCallback(() => {
    handleCheckDailyResetRef.current()
  }, [])

  // ── Stable database snapshot for buildDatabase ────────────────────────────
  const stateSnapshotRef = useRef<{
    userSettings: Database["userSettings"]
    nudgeSettings: NudgeSettings
    history: Database["history"]
    pendingCalendarUpdates: Database["pendingCalendarUpdates"]
    metadata: Database["metadata"]
    alertTemplates: AlertTemplate[]
    alertTracking: AlertTracking
  }>({
    userSettings: {},
    nudgeSettings: DEFAULT_SETTINGS,
    history: [],
    pendingCalendarUpdates: [],
    metadata: {},
    alertTemplates: DEFAULT_ALERT_TEMPLATES,
    alertTracking: DEFAULT_ALERT_TRACKING,
  })

  const buildDatabase = useCallback(
    (nextCategories: Category[], nextMetadata?: Database["metadata"]): Database => {
      const snap = stateSnapshotRef.current
      return {
        userSettings: { ...snap.userSettings, ...snap.nudgeSettings },
        categories: normalizeCategoriesForSave(nextCategories),
        history: snap.history,
        pendingCalendarUpdates: snap.pendingCalendarUpdates,
        alertTemplates: snap.alertTemplates,
        alertTracking: { ...DEFAULT_ALERT_TRACKING, ...snap.alertTracking },
        metadata: nextMetadata ?? snap.metadata,
      }
    },
    [],
  )

  const applyDatabaseImplRef = useRef<(data: Database) => void>(() => {})
  const applyDatabase = useCallback((data: Database) => {
    applyDatabaseImplRef.current(data)
  }, [])

  const persistCategoriesImplRef = useRef<
    (nextCategories: Category[], previousData: Database, immediate?: boolean) => void
  >(() => {})
  const persistCategories = useCallback(
    (nextCategories: Category[], previousData: Database, immediate = false) => {
      persistCategoriesImplRef.current(nextCategories, previousData, immediate)
    },
    [],
  )

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    appMountedAtRef.current = Date.now()
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    metadataRef.current = metadata
  }, [metadata])

  // ── Hook 1: Settings ──────────────────────────────────────────────────────
  const settingsManager = useSettingsManager({
    buildDatabase,
    categoriesRef,
    dataLoadedRef,
    saveData,
    applyDatabase,
  })

  // ── Hook 2: Calendar sync ─────────────────────────────────────────────────
  const calendarSync = useCalendarSync({
    settings: settingsManager.settings,
    updateSettings: settingsManager.updateSettings,
    buildDatabase,
    categoriesRef,
    dataLoadedRef,
    saveDataImmediate,
    applyDatabase,
  })

  // ── Hook 3: Category manager ──────────────────────────────────────────────
  const categoryManager = useCategoryManager({
    buildDatabase,
    persistCategories,
    timerMode: prevTimerRef.current.timerMode,
    settings: settingsManager.settings,
    alertTrackingRef,
    handleUpdateTracking: handleUpdateTrackingBridge,
    createGoogleCalendarEvent: calendarSync.createGoogleCalendarEvent,
  })

  // ── Hook 4: Alert manager ─────────────────────────────────────────────────
  const alertManager = useAlertManager({
    buildDatabase,
    categories: categoryManager.categories,
    saveData,
    settings: settingsManager.settings,
    isRunning: prevTimerRef.current.isRunning,
    sessionStarted: prevTimerRef.current.sessionStarted,
    timerMode: prevTimerRef.current.timerMode,
    appMountedAt: appMountedAtRef.current,
    isMountedRef,
    playAlertSound: playAlertSoundBridge,
    isWithinStartupGracePeriod,
    audioElementRef: audioElementBridgeRef as React.RefObject<HTMLAudioElement | null>,
  })

  // ── Hook 5: Timer ─────────────────────────────────────────────────────────
  const timer = useTimer({
    settings: settingsManager.settings,
    categories: categoryManager.categories,
    activeTaskId: categoryManager.activeTaskId,
    setActiveTaskId: categoryManager.setActiveTaskId,
    activeProject: categoryManager.activeProject,
    activeTask: categoryManager.activeTask,
    buildDatabase,
    saveData,
    saveDataImmediate,
    applyDatabase,
    alertTracking: alertManager.alertTracking,
    handleUpdateTracking: alertManager.handleUpdateTracking,
    createGoogleCalendarEvent: calendarSync.createGoogleCalendarEvent,
    updateGoogleCalendarEvent: calendarSync.updateGoogleCalendarEvent,
    queueCalendarUpdate: calendarSync.queueCalendarUpdate,
    calendarUpdateRetryableRef: calendarSync.calendarUpdateRetryableRef,
    persistCategories,
    handleCheckDailyReset: handleCheckDailyResetBridge,
    setHistory,
    setCategories: categoryManager.setCategories,
  })

  // ── Update bridge refs for next render ────────────────────────────────────
  prevTimerRef.current = {
    isRunning: timer.isRunning,
    sessionStarted: timer.sessionStarted,
    timerMode: timer.timerMode,
  }
  handleUpdateTrackingRef.current = alertManager.handleUpdateTracking
  alertTrackingRef.current = alertManager.alertTracking
  playAlertSoundRef.current = timer.playAlertSound
  audioElementBridgeRef.current = timer.audioElementRef.current

  // Sync shared categories ref for settingsManager & calendarSync
  categoriesRef.current = categoryManager.categories

  // Update state snapshot for buildDatabase
  stateSnapshotRef.current = {
    userSettings: settingsManager.userSettings,
    nudgeSettings: settingsManager.nudgeSettings,
    history,
    pendingCalendarUpdates: calendarSync.pendingCalendarUpdates,
    metadata,
    alertTemplates: alertManager.alertTemplates,
    alertTracking: alertManager.alertTracking,
  }

  // ── Wire applyDatabase implementation ─────────────────────────────────────
  applyDatabaseImplRef.current = (data: Database) => {
    settingsManager.setUserSettings(data.userSettings ?? {})
    settingsManager.setNudgeSettings(settingsManager.normalizeSettings(data.userSettings ?? {}))
    setHistory(data.history ?? [])
    calendarSync.initializePendingCalendarUpdates(data.pendingCalendarUpdates ?? [])
    setMetadata(data.metadata ?? {})
    const normalizedCategories = (data.categories ?? []).map((category) => ({
      ...category,
      color: normalizeColor(category.color),
    }))
    const sorted = sortCategoriesWithHabitsFirst(normalizedCategories)
    // Sync categoriesRef IMMEDIATELY so any effects triggered by the state
    // updates below will see the real categories, not an empty array.
    categoriesRef.current = sorted
    categoryManager.setCategories(sorted)
    alertManager.setAlertTemplates(data.alertTemplates ?? DEFAULT_ALERT_TEMPLATES)
    alertManager.setAlertTracking(data.alertTracking ?? DEFAULT_ALERT_TRACKING)
  }

  // ── Wire persistCategories implementation ─────────────────────────────────
  persistCategoriesImplRef.current = (
    nextCategories: Category[],
    previousData: Database,
    immediate = false,
  ) => {
    const nextData = buildDatabase(nextCategories)
    const rollback = () => applyDatabase(previousData)
    if (immediate) {
      saveDataImmediate(nextData, { onRollback: rollback })
    } else {
      saveData(nextData, { onRollback: rollback })
    }
  }

  // ── Load database ─────────────────────────────────────────────────────────
  const loadDatabase = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const { data } = await loadData()
      if (!isMountedRef.current) return
      const nextSettings = settingsManager.normalizeSettings(data.userSettings ?? {})
      const resetResult = checkAndResetDailyProjects(
        data.categories,
        data.metadata?.lastResetDate,
        nextSettings.endOfDayTime,
        {
          alertTracking: data.alertTracking ?? DEFAULT_ALERT_TRACKING,
          resetSessionCounterDaily: nextSettings.resetSessionCounterDaily,
        },
      )
      let nextAlertTracking = resetResult.alertTracking ?? data.alertTracking ?? DEFAULT_ALERT_TRACKING
      let didInitTimerStart = false
      if (nextAlertTracking.lastTimerStartAt === null) {
        nextAlertTracking = { ...nextAlertTracking, lastTimerStartAt: Date.now() }
        didInitTimerStart = true
      }
      const updatedMetadata = {
        ...data.metadata,
        lastResetDate: resetResult.shouldSave
          ? getDayWindowKey(new Date(), nextSettings.endOfDayTime)
          : data.metadata?.lastResetDate,
      }
      const existingTemplates = Array.isArray(data.alertTemplates) ? data.alertTemplates : DEFAULT_ALERT_TEMPLATES
      const baseTemplates = existingTemplates.filter((template) => template.type !== "REALITY_CHECKS")
      const realityMessages = await loadRealityCheckMessages()
      const realityTemplates = generateRealityCheckTemplates(realityMessages, existingTemplates)
      const generatedIds = new Set(realityTemplates.map((template) => template.id))
      const extraRealityTemplates = existingTemplates.filter(
        (template) => template.type === "REALITY_CHECKS" && !generatedIds.has(template.id),
      )
      const mergedTemplates = [...baseTemplates, ...realityTemplates, ...extraRealityTemplates]
      if (process.env.NODE_ENV !== "production") {
        try {
          await fetch("/api/scream-mode-insults/seed", { method: "POST" })
        } catch (seedError) {
          console.error("Failed to seed scream mode insults:", seedError)
        }
      }
      const existingRealityMessages = new Set(
        existingTemplates
          .filter((template) => generatedIds.has(template.id))
          .map((template) => template.message),
      )
      const nextRealityMessages = new Set(realityTemplates.map((template) => template.message))
      const shouldUpdateRealityTemplates =
        existingRealityMessages.size !== nextRealityMessages.size ||
        ![...nextRealityMessages].every((msg) => existingRealityMessages.has(msg))
      const nextData = {
        ...data,
        categories: resetResult.categories,
        metadata: updatedMetadata,
        alertTemplates: mergedTemplates,
        alertTracking: nextAlertTracking,
      }

      if (!isMountedRef.current) return
      applyDatabase(nextData)
      dataLoadedRef.current = true

      const localSessionState = loadSessionFromLocalStorage()
      const dbSessionState = data.activeSessionState ?? null
      const sessionState = localSessionState ?? dbSessionState

      if (sessionState && sessionState.sessionStarted) {
        const timeSinceStart = Date.now() - sessionState.sessionStartTime
        const isStaleSession = timeSinceStart > 30 * 60 * 1000

        if (!isStaleSession) {
          // Fill in initialTime from settings if it was missing (migrated from old format)
          if (sessionState.initialTime == null) {
            sessionState.initialTime = timer.getModeSeconds(sessionState.timerMode)
          }
          timer.restoreSessionState(sessionState)

          if (sessionState.pausedAt !== null) {
            const pausedMinutes = Math.floor((sessionState.pausedTimeLeft ?? 0) / 60)
            toast({
              title: "Session restored",
              description: `Paused session resumed (${pausedMinutes}m remaining)`,
            })
          } else if (sessionState.isOvertime) {
            const overtimeMinutes = Math.floor(sessionState.overtimeSeconds / 60)
            toast({
              title: "Session restored",
              description: `Overtime session resumed (${overtimeMinutes}m)`,
            })
          } else {
            const elapsed = (Date.now() - sessionState.sessionStartTime) / 1000
            const remaining = Math.max(0, sessionState.initialTime - Math.floor(elapsed))
            if (remaining > 0) {
              toast({
                title: "Session restored",
                description: `Timer resumed (${Math.floor(remaining / 60)}m remaining)`,
              })
            } else {
              toast({
                title: "Session restored",
                description: "Timer entered overtime while away",
              })
            }
          }
        } else {
          clearSessionFromLocalStorage()
        }
      }

      if (resetResult.shouldSave || shouldUpdateRealityTemplates || didInitTimerStart) {
        await saveDataImmediate(nextData)
      }
    } catch (loadFailure) {
      if (!isMountedRef.current) return
      const baseMessage = loadFailure instanceof Error ? loadFailure.message : "Failed to load data"
      const reason =
        typeof (loadFailure as { reason?: unknown })?.reason === "string"
          ? String((loadFailure as { reason?: unknown }).reason)
          : null
      let message = baseMessage
      if (reason === "locked") {
        message = "Database is locked. Close other app instances and try again."
      } else if (reason === "corrupt") {
        message = "Database appears corrupted. Restore from backup or delete it to start fresh."
      } else if (reason === "permission") {
        message = "Database permission error. Check file permissions and try again."
      } else if (reason === "schema") {
        message = "Database schema issue detected. Restart the app or reset the database."
      } else if (reason === "connection") {
        message = "Database connection failed. Verify SQLite bindings and restart the app."
      }
      setLoadError(message)
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData, saveDataImmediate])

  useEffect(() => {
    loadDatabase()
  }, [loadDatabase])

  // ── Daily reset ───────────────────────────────────────────────────────────
  const handleCheckDailyReset = useCallback(() => {
    const windowKey = getDayWindowKey(new Date(), settingsManager.settings.endOfDayTime)
    if (metadataRef.current?.lastResetDate === windowKey) return

    const currentCategories = categoryManager.categoriesRef.current
    const resetResult = checkAndResetDailyProjects(
      currentCategories,
      metadataRef.current?.lastResetDate,
      settingsManager.settings.endOfDayTime,
      {
        alertTracking: alertManager.alertTrackingRef.current,
        resetSessionCounterDaily: settingsManager.settings.resetSessionCounterDaily,
      },
    )
    if (!resetResult.shouldSave) return

    const nextMetadata = {
      ...metadataRef.current,
      lastResetDate: windowKey,
    }
    if (!isMountedRef.current) return
    metadataRef.current = nextMetadata
    setMetadata(nextMetadata)
    categoryManager.setCategories(resetResult.categories)
    const nextAlertTracking = resetResult.alertTracking ?? alertManager.alertTrackingRef.current
    alertManager.alertTrackingRef.current = nextAlertTracking
    alertManager.setAlertTracking(nextAlertTracking)
    const nextData = {
      ...buildDatabase(resetResult.categories, nextMetadata),
      alertTracking: nextAlertTracking,
    }
    saveDataImmediate(nextData)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only uses stable refs/setters from alertManager and categoryManager
  }, [
    buildDatabase,
    saveDataImmediate,
    settingsManager.settings.endOfDayTime,
    settingsManager.settings.resetSessionCounterDaily,
    categoryManager.categoriesRef,
    categoryManager.setCategories,
    alertManager.alertTrackingRef,
    alertManager.setAlertTracking,
  ])

  handleCheckDailyResetRef.current = handleCheckDailyReset

  useEffect(() => {
    const interval = setInterval(handleCheckDailyReset, 10 * 1000)
    return () => clearInterval(interval)
  }, [handleCheckDailyReset])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      handleCheckDailyReset()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [handleCheckDailyReset])

  // ── Keyboard & background click ───────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (isCreatingProject) {
        setIsCreatingProject(false)
        return
      }
      if (timer.isRunning) {
        timer.exitFocus()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable destructured properties from timer
    [timer.exitFocus, isCreatingProject, timer.isRunning],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (timer.isRunning && e.target === e.currentTarget) {
      timer.exitFocus()
    }
  }

  // ── Project creation ──────────────────────────────────────────────────────
  const handleCreateProjectAt = (index: number) => {
    setInsertIndex(index)
    setNewProjectName("")
    setNewProjectColor("#ffffff")
    setNewProjectIsHabitProject(false)
    setNewProjectType("project")
    setIsCreatingProject(true)
  }

  const handleSaveNewProject = () => {
    if (!newProjectName.trim() || insertIndex === null) return

    const isHabitProject = newProjectType === "habit"

    const newProject: Category = {
      id: `project-${Date.now()}`,
      name: newProjectName.trim(),
      color: newProjectColor,
      tasks: [],
      projectType: newProjectType,
      isHabitProject,
    }

    categoryManager.setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const newCats = [...cats]
      newCats.splice(insertIndex, 0, newProject)
      const updated = sortCategoriesWithHabitsFirst(newCats)
      persistCategories(updated, previousData, true)
      return updated
    })

    setIsCreatingProject(false)
    setInsertIndex(null)
    setNewProjectName("")
    setNewProjectColor("#ffffff")
    setNewProjectIsHabitProject(false)
    setNewProjectType("project")
  }

  // ── Saving indicator effect ───────────────────────────────────────────────
  useEffect(() => {
    const clearShowDelayTimer = () => {
      if (savingShowDelayTimerRef.current) {
        clearTimeout(savingShowDelayTimerRef.current)
        savingShowDelayTimerRef.current = null
      }
    }

    const clearMinimumDisplayTimer = () => {
      if (minimumDisplayTimerRef.current) {
        clearTimeout(minimumDisplayTimerRef.current)
        minimumDisplayTimerRef.current = null
      }
    }

    const clearHideTimer = () => {
      if (savingHideTimerRef.current) {
        clearTimeout(savingHideTimerRef.current)
        savingHideTimerRef.current = null
      }
    }

    const startHideWithFade = () => {
      clearHideTimer()
      setSavingIndicatorVisible(false)
      savingHideTimerRef.current = setTimeout(() => {
        setShowSavingIndicator(false)
        savingHideTimerRef.current = null
      }, 300)
    }

    if (isSaving && !wasSavingRef.current) {
      savingStartTimeRef.current = Date.now()
      clearMinimumDisplayTimer()
      clearHideTimer()
      clearShowDelayTimer()
      savingShowDelayTimerRef.current = setTimeout(() => {
        savingVisibleAtRef.current = Date.now()
        setShowSavingIndicator(true)
        setSavingIndicatorVisible(true)
        savingShowDelayTimerRef.current = null
      }, 300)
    }

    if (!isSaving && wasSavingRef.current) {
      clearShowDelayTimer()
      clearMinimumDisplayTimer()

      if (showSavingIndicator) {
        const visibleAt = savingVisibleAtRef.current
        const hideDelay = Math.max(0, 500 - (visibleAt ? Date.now() - visibleAt : 0))
        if (hideDelay > 0) {
          minimumDisplayTimerRef.current = setTimeout(() => {
            startHideWithFade()
            minimumDisplayTimerRef.current = null
          }, hideDelay)
        } else {
          startHideWithFade()
        }
      } else {
        savingVisibleAtRef.current = null
        setSavingIndicatorVisible(false)
        setShowSavingIndicator(false)
      }
    }

    wasSavingRef.current = isSaving
  }, [isSaving, showSavingIndicator])

  useEffect(() => {
    return () => {
      if (savingShowDelayTimerRef.current) {
        clearTimeout(savingShowDelayTimerRef.current)
      }
      if (minimumDisplayTimerRef.current) {
        clearTimeout(minimumDisplayTimerRef.current)
      }
      if (savingHideTimerRef.current) {
        clearTimeout(savingHideTimerRef.current)
      }
    }
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const errorMessage = loadError ?? persistenceError

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="min-h-screen text-white font-mono bg-[rgba(14,14,14,1)]">
        <UrgencyClock />
        <div className="min-h-screen flex items-center justify-center text-neutral-400 gap-3">
          <Spinner className="size-5" />
          <span>Loading data...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen text-white font-mono bg-[rgba(14,14,14,1)]" onClick={handleBackgroundClick}>
      <UrgencyClock />
      <Confetti ref={timer.confettiRef} manualstart className="pointer-events-none fixed inset-0 z-50" aria-hidden="true" />
      <SettingsMenu
        settings={settingsManager.settings}
        updateSettings={settingsManager.updateSettings}
        onGoogleCalendarReconnected={() => {}}
        alertTemplates={alertManager.alertTemplates}
        onUpdateAlertTemplates={alertManager.handleUpdateAlertTemplates}
        onPlayTestSound={timer.playTestSound}
        onPlayAlertSound={timer.playAlertSound}
        onTestAlert={alertManager.triggerTestAlert}
      />
      {(alertManager.visibleMessages.length > 0 || settingsManager.settings.enableElapsedTimeTracker) && (
        <TerminalMessageFeed
          messages={alertManager.visibleMessages}
          onHover={alertManager.onMessageHover}
          timeKeeperEnabled={settingsManager.settings.enableElapsedTimeTracker}
          lastTimerStartAt={alertManager.alertTracking.lastTimerStartAt}
          isTimerRunning={timer.isRunning}
        />
      )}
      {showSavingIndicator && (
        <div
          className={`fixed top-4 right-4 z-40 flex items-center gap-2 text-xs text-neutral-400 transition-opacity duration-300 ${
            savingIndicatorVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <Spinner className="size-3" />
          <span>Saving</span>
        </div>
      )}
      {isOffline && (
        <div className="fixed top-4 left-4 z-40 text-xs text-amber-200 bg-amber-950/60 border border-amber-500/40 px-3 py-2">
          Offline mode enabled.
        </div>
      )}
      {isStale && lastLoadedAt && (
        <div className="fixed top-14 left-4 z-40 text-xs text-amber-200 bg-amber-950/60 border border-amber-500/40 px-3 py-2">
          Data may be stale (last sync {new Date(lastLoadedAt).toLocaleTimeString()}).
        </div>
      )}
      {calendarSync.pendingCalendarUpdates && calendarSync.pendingCalendarUpdates.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 bg-amber-900/80 text-amber-100 px-4 py-2 rounded-lg text-sm font-mono">
          <div className="flex items-center gap-2">
            <div className="animate-pulse">⏳</div>
            <span>
              {calendarSync.pendingCalendarUpdates.length} calendar update
              {calendarSync.pendingCalendarUpdates.length > 1 ? "s" : ""} pending
            </span>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-40 max-w-sm bg-neutral-950/90 border border-red-500/40 text-red-200 px-4 py-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <button
              onClick={loadDatabase}
              className="border border-red-400/60 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-red-500/10"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {alertManager.showScreamFlash && alertManager.currentScreamInsult && (
        <div
          onClick={alertManager.handleDismissScreamMode}
          className="fixed inset-0 z-[9999] cursor-pointer animate-pulse flex items-center justify-center"
          style={{
            backgroundColor: "rgba(220, 38, 38, 0.4)",
            animation: "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          <div className="text-center px-8 max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-8 drop-shadow-lg">
              {replacePlaceholders(alertManager.currentScreamInsult.title, {
                inactiveMinutes: alertManager.screamModeInactiveMinutes,
                distractionsToday: alertManager.alertTracking.distractionsToday ?? 0,
                timeWasted: alertManager.alertTracking.timeWasted ?? 0,
              })}
            </h1>

            <h3 className="text-xl md:text-2xl font-semibold text-white/95 mb-6">
              {replacePlaceholders(alertManager.currentScreamInsult.message, {
                inactiveMinutes: alertManager.screamModeInactiveMinutes,
                distractionsToday: alertManager.alertTracking.distractionsToday ?? 0,
                timeWasted: alertManager.alertTracking.timeWasted ?? 0,
              })}
            </h3>

            {alertManager.currentScreamInsult.punchline && (
              <p className="text-lg md:text-xl text-white/90 mb-12">
                {replacePlaceholders(alertManager.currentScreamInsult.punchline, {
                  inactiveMinutes: alertManager.screamModeInactiveMinutes,
                  distractionsToday: alertManager.alertTracking.distractionsToday ?? 0,
                  timeWasted: alertManager.alertTracking.timeWasted ?? 0,
                })}
              </p>
            )}

            <p className="text-sm text-white/70 mt-16">Click anywhere to acknowledge</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x lg:divide-neutral-900/20 lg:min-h-screen pb-64 lg:pb-72">
        <div
          className={`flex items-center justify-center pt-16 lg:sticky lg:top-0 lg:h-screen ${
            timer.isRunning ? "lg:col-span-3" : "lg:col-span-1"
          }`}
        >
          <div className="w-full max-w-2xl">
            <Timer
              timeLeft={timer.timeLeft}
              onTimeChange={timer.setTimeLeft}
              isOvertime={timer.isOvertime}
              overtimeSeconds={timer.overtimeSeconds}
              onOvertimeChange={timer.handleOvertimeChange}
              activeTask={categoryManager.activeTask}
              activeProject={categoryManager.activeProject}
              isRunning={timer.isRunning}
              sessionStarted={timer.sessionStarted}
              timerMode={timer.timerMode}
              onToggleRunning={timer.handleToggleRunning}
              onEndSession={timer.handleEndSession}
              initialTime={timer.initialTime}
              onSkipBreak={timer.handleSkipBreak}
              isLongBreakAvailable={timer.isLongBreakAvailable}
              onChangeMode={timer.handleSelectTimerMode}
              onCheckDailyReset={handleCheckDailyReset}
            />
          </div>
        </div>

        {!timer.isRunning && (
          <div className="lg:col-span-2 lg:flex lg:items-center lg:min-h-screen">
            <div className="max-w-3xl mx-auto w-full">
              <TaskCategories
                categories={categoryManager.categories}
                activeTaskId={categoryManager.activeTaskId}
                onTaskToggle={categoryManager.handleTaskToggle}
                onSetActiveTask={categoryManager.handleSetActiveTask}
                onUpdateCategory={categoryManager.handleUpdateCategory}
                onDeleteCategory={categoryManager.handleDeleteCategory}
                onAddTask={categoryManager.handleAddTask}
                onDeleteTask={categoryManager.handleDeleteTask}
                onEditTask={categoryManager.handleEditTask}
                isFocusMode={timer.isRunning}
                onCreateProjectAt={handleCreateProjectAt}
                onReorderCategories={categoryManager.handleReorderCategories}
              />
            </div>
          </div>
        )}
      </div>

      {isCreatingProject && (
        <ModalPortal>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-0 flex items-center justify-center z-50"
            onClick={() => setIsCreatingProject(false)}
          >
            <div
              className="bg-neutral-950 border border-neutral-400 p-6 max-w-md w-full mx-4 font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Create Project</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="new-project-name" className="block text-sm text-neutral-500 mb-2">
                    Project Name
                  </label>
                  <input
                    id="new-project-name"
                    name="new-project-name"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none font-mono"
                    placeholder="Enter project name"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="project-type" className="block text-sm text-neutral-500 mb-2">
                    Project Type
                  </label>
                  <select
                    id="project-type"
                    name="project-type"
                    value={newProjectType}
                    onChange={(e) => {
                      const nextType = e.target.value as "project" | "habit" | "work"
                      setNewProjectType(nextType)
                      setNewProjectIsHabitProject(nextType === "habit")
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none font-mono"
                  >
                  <option value="project">Focus Sessions</option>
                  <option value="habit">Habit Tracking</option>
                  <option value="work">Time Tracking</option>
                </select>
                <div className="text-xs text-neutral-500 mt-1">
                  {newProjectType === "project" && "Standard pomodoro tracking with daily goals"}
                  {newProjectType === "habit" && "Tasks reset to undone at configured end-of-day cutoff"}
                  {newProjectType === "work" && "Duration-based tracking in hours/minutes"}
                </div>
              </div>

                <div>
                  <div className="block text-sm text-neutral-500 mb-2">Color</div>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { name: "Red", value: "#ff6b6b" },
                      { name: "Orange", value: "#ff9f43" },
                      { name: "Yellow", value: "#feca57" },
                      { name: "Forest", value: "#27ae60" },
                      { name: "Mint", value: "#1dd1a1" },
                      { name: "Green", value: "#48dbfb" },
                      { name: "Blue", value: "#0abde3" },
                      { name: "Purple", value: "#9b59b6" },
                      { name: "Pink", value: "#ff5fa2" },
                      { name: "White", value: "#ffffff" },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => setNewProjectColor(preset.value)}
                        className={`w-8 h-8 rounded-full border-2 transition ${
                          newProjectColor === preset.value ? "border-white scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: preset.value }}
                        aria-label={`Select ${preset.name}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleSaveNewProject}
                    className="flex-1 bg-white text-black px-4 py-2 hover:bg-neutral-200 transition font-semibold"
                    disabled={!newProjectName.trim()}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setIsCreatingProject(false)}
                    className="flex-1 border border-neutral-700 px-4 py-2 hover:bg-neutral-900 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </main>
  )
}
