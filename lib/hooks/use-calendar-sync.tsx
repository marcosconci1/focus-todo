"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { Category, Task, GoogleCalendarEventFormat } from "@/lib/types"
import type { Database } from "@/lib/storage"
import { DEFAULT_SETTINGS, type NudgeSettings } from "@/lib/settings-store"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"

type PendingCalendarUpdate = NonNullable<Database["pendingCalendarUpdates"]>[number]

interface UseCalendarSyncParams {
  settings: NudgeSettings
  updateSettings: (partial: Partial<NudgeSettings>) => void
  buildDatabase: (categories: Category[]) => Database
  categoriesRef: React.RefObject<Category[]>
  dataLoadedRef: React.RefObject<boolean>
  saveDataImmediate: (data: Database, options?: { onRollback?: () => void }) => void
  applyDatabase: (data: Database) => void
}

function useCalendarSync({
  settings,
  updateSettings,
  buildDatabase,
  categoriesRef,
  dataLoadedRef,
  saveDataImmediate,
  applyDatabase,
}: UseCalendarSyncParams) {
  const [pendingCalendarUpdates, setPendingCalendarUpdates] = useState<Database["pendingCalendarUpdates"]>([])
  const [calendarSyncNotificationShown, setCalendarSyncNotificationShown] = useState(false)

  const pendingCalendarUpdatesRef = useRef<Database["pendingCalendarUpdates"]>([])
  const calendarUpdateRetryableRef = useRef(true)
  const calendarUpdateRetryInFlightRef = useRef(false)
  const calendarSyncNotificationShownRef = useRef(false)

  // pendingCalendarUpdatesRef sync
  useEffect(() => {
    pendingCalendarUpdatesRef.current = pendingCalendarUpdates ?? []
  }, [pendingCalendarUpdates])

  // calendarSyncNotificationShownRef sync
  useEffect(() => {
    calendarSyncNotificationShownRef.current = calendarSyncNotificationShown
  }, [calendarSyncNotificationShown])

  const updateGoogleCalendarEvent = useCallback(async (
    eventId: string,
    startTime: string,
    durationMinutes: number,
    description: string,
  ): Promise<boolean> => {
    calendarUpdateRetryableRef.current = true
    try {
      try {
        const statusResponse = await fetch("/api/google/status", { cache: "no-store" })
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as { connected?: boolean; needsRefresh?: boolean }
          if (status.connected === false) {
            updateSettings({
              googleCalendarConnected: false,
              googleCalendarUserEmail: "",
              googleCalendarAutoSync: false,
            })
            toast({
              title: "\u{1F512} Google Calendar disconnected",
              description: "Please reconnect in Settings.",
              variant: "destructive",
            })
            calendarUpdateRetryableRef.current = false
            return false
          }
          if (status.needsRefresh) {
            try {
              const refreshResponse = await fetch("/api/google/refresh-token", { method: "POST" })
              if (refreshResponse.status === 401) {
                updateSettings({
                  googleCalendarConnected: false,
                  googleCalendarUserEmail: "",
                  googleCalendarAutoSync: false,
                })
                toast({
                  title: "\u{1F512} Google Calendar disconnected",
                  description: "Your session expired. Please reconnect in Settings.",
                  variant: "destructive",
                })
                calendarUpdateRetryableRef.current = false
                return false
              }
              if (!refreshResponse.ok) {
                console.error("Failed to refresh Google Calendar token:", refreshResponse.status)
              }
            } catch (error) {
              console.error("Failed to refresh Google Calendar token:", error)
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch Google Calendar status:", error)
      }

      const response = await fetch("/api/google/update-event", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          startTime,
          durationMinutes,
          description,
        }),
      })

      let data: { success?: unknown; error?: unknown } = {}
      try {
        data = (await response.json()) as { success?: unknown; error?: unknown }
      } catch {
        data = {}
      }
      if (data?.success === true) {
        toast({
          title: "Calendar updated",
          description: "Overtime synced to Google Calendar.",
          duration: 3000,
        })
        return true
      }

      if (response.status === 401) {
        updateSettings({
          googleCalendarConnected: false,
          googleCalendarUserEmail: "",
          googleCalendarAutoSync: false,
        })
        toast({
          title: "Calendar disconnected",
          description: "Please reconnect in Settings.",
          variant: "destructive",
        })
        calendarUpdateRetryableRef.current = false
        return false
      }
      if (response.status === 403) {
        toast({
          title: "Calendar permission denied",
          description: "Reconnect Google Calendar to update events.",
          variant: "destructive",
        })
        calendarUpdateRetryableRef.current = false
        return false
      }
      if (response.status === 404) {
        toast({
          title: "Calendar event not found",
          description: "The event may have been deleted.",
          variant: "destructive",
        })
        calendarUpdateRetryableRef.current = false
        return false
      }
      if (response.status === 429) {
        toast({
          title: "Calendar rate limited",
          description: "We'll retry the update shortly.",
        })
        calendarUpdateRetryableRef.current = true
        return false
      }

      const errorMessage = typeof data?.error === "string" ? data.error : "Could not update calendar event."
      console.error("Google Calendar update failed:", errorMessage)
      toast({
        title: "Calendar update failed",
        description: errorMessage,
        variant: "destructive",
      })
      calendarUpdateRetryableRef.current = true
      return false
    } catch (error) {
      console.error("Failed to update Google Calendar event:", error)
      toast({
        title: "Calendar update failed",
        description: "Network error - will retry automatically.",
        variant: "destructive",
      })
      calendarUpdateRetryableRef.current = true
      return false
    }
  }, [updateSettings])

  const updatePendingCalendarUpdates = useCallback(
    (updater: (prev: PendingCalendarUpdate[]) => PendingCalendarUpdate[]) => {
      const safePrev = Array.isArray(pendingCalendarUpdatesRef.current) ? pendingCalendarUpdatesRef.current : []
      const next = updater(safePrev)
      setPendingCalendarUpdates(next)

      if (!dataLoadedRef.current) {
        return
      }

      const currentCategories = categoriesRef.current
      const previousData = buildDatabase(currentCategories)
      const nextData: Database = {
        ...previousData,
        pendingCalendarUpdates: next,
      }
      saveDataImmediate(nextData, { onRollback: () => applyDatabase(previousData) })
    },
    [applyDatabase, buildDatabase, categoriesRef, dataLoadedRef, saveDataImmediate],
  )

  const queueCalendarUpdate = useCallback(
    (update: Omit<PendingCalendarUpdate, "retryCount" | "lastAttempt">) => {
      updatePendingCalendarUpdates((prev) => [
        ...prev,
        {
          ...update,
          retryCount: 0,
          lastAttempt: 0,
        },
      ])
    },
    [updatePendingCalendarUpdates],
  )

  const createGoogleCalendarEvent = async (
    task: Task | null,
    project: Category | null,
    durationMinutes: number,
    eventFormat: GoogleCalendarEventFormat,
    isBreak?: boolean,
    breakType?: "SHORT_BREAK" | "LONG_BREAK",
  ): Promise<string | null> => {
    try {
      const safeEventFormat: GoogleCalendarEventFormat =
        eventFormat === "task" ||
        eventFormat === "project-task" ||
        eventFormat === "emoji" ||
        eventFormat === "emoji-task-project"
          ? eventFormat
          : DEFAULT_SETTINGS.googleCalendarEventFormat
      const isBreakSession =
        isBreak === true && (breakType === "SHORT_BREAK" || breakType === "LONG_BREAK")
      const breakTitle = breakType === "LONG_BREAK" ? "Long Break" : "Short Break"
      const breakEmoji = breakType === "LONG_BREAK" ? "\u{1F9D8}" : "\u2615"
      const taskName = isBreakSession ? breakTitle : task?.name ?? ""
      const projectName = isBreakSession ? "Break Session" : project?.name ?? ""
      const emoji = isBreakSession ? breakEmoji : task?.emoji || "\u{1F4CC}"
      const colorId = isBreakSession ? "8" : settings.googleCalendarColorId
      const calendarFormat: GoogleCalendarEventFormat = isBreakSession ? "task" : safeEventFormat
      try {
        const statusResponse = await fetch("/api/google/status", { cache: "no-store" })
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as { connected?: boolean; needsRefresh?: boolean }
          if (status.connected === false) {
            updateSettings({
              googleCalendarConnected: false,
              googleCalendarUserEmail: "",
              googleCalendarAutoSync: false,
            })
            toast({
              title: "\u{1F512} Google Calendar disconnected",
              description: "Please reconnect in Settings.",
              variant: "destructive",
            })
            return null
          }
          if (status.needsRefresh) {
            try {
              const refreshResponse = await fetch("/api/google/refresh-token", { method: "POST" })
              if (refreshResponse.status === 401) {
                updateSettings({
                  googleCalendarConnected: false,
                  googleCalendarUserEmail: "",
                  googleCalendarAutoSync: false,
                })
                toast({
                  title: "\u{1F512} Google Calendar disconnected",
                  description: "Your session expired. Please reconnect in Settings.",
                  variant: "destructive",
                })
                return null
              }
              if (!refreshResponse.ok) {
                console.error("Failed to refresh Google Calendar token:", refreshResponse.status)
              }
            } catch (error) {
              console.error("Failed to refresh Google Calendar token:", error)
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch Google Calendar status:", error)
      }
      const response = await fetch("/api/google/create-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskName,
          projectName,
          emoji,
          colorId,
          startTime: new Date().toISOString(),
          durationMinutes,
          eventFormat: calendarFormat,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      const data = await response.json()
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid response format")
      }
      const parsedData = data as { success?: unknown; error?: unknown; eventId?: unknown }

      if (parsedData.success === true) {
        const eventId = typeof parsedData.eventId === "string" ? parsedData.eventId : null
        if (!eventId) {
          throw new Error("Missing eventId from Google Calendar response")
        }
        toast({
          title: isBreakSession ? "Break added to Calendar" : "\u{1F4C5} Added to Calendar",
          description: `"${taskName}" scheduled for ${durationMinutes}min`,
          duration: 3000,
        })
        return eventId
      } else {
        if (response.status === 401) {
          toast({
            title: "Calendar Disconnected",
            description: "Please reconnect in settings",
            variant: "destructive",
            duration: 5000,
          })
          updateSettings({
            googleCalendarConnected: false,
            googleCalendarUserEmail: "",
            googleCalendarAutoSync: false,
          })
        } else if (response.status === 403) {
          toast({
            title: "Calendar permission denied",
            description: "Reconnect Google Calendar to grant calendar permissions.",
            variant: "destructive",
            duration: 5000,
          })
          updateSettings({
            googleCalendarConnected: false,
            googleCalendarAutoSync: false,
          })
        } else {
          const errorMessage =
            typeof parsedData.error === "string" ? parsedData.error : undefined
          console.error("Google Calendar API error:", errorMessage)
          toast({
            title: "Calendar sync failed",
            description: errorMessage || "Could not add to calendar",
            variant: "destructive",
            duration: 5000,
          })
        }
        return null
      }
    } catch (error) {
      console.error("Failed to create Google Calendar event:", error)
      toast({
        title: "Calendar sync failed",
        description: "Network error - timer will continue",
        variant: "destructive",
        duration: 5000,
      })
      return null
    }
  }

  const getCalendarUpdateBackoffMs = (retryCount: number) => {
    if (retryCount <= 0) return 60_000
    if (retryCount === 1) return 5 * 60_000
    return 15 * 60_000
  }

  const retryPendingCalendarUpdates = useCallback(
    async (source: "startup" | "interval" | "online") => {
      if (calendarUpdateRetryInFlightRef.current) return
      if (
        !settings.googleCalendarConnected ||
        !settings.googleCalendarAutoSync ||
        !settings.googleCalendarSyncOvertime
      ) {
        return
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) return

      const queue = pendingCalendarUpdatesRef.current ?? []
      if (queue.length === 0) return

      calendarUpdateRetryInFlightRef.current = true
      try {
        const now = Date.now()
        const nextQueue: PendingCalendarUpdate[] = []
        const droppedCount = queue.filter((u) => u.retryCount >= 5).length
        for (const update of queue) {
          if (update.retryCount >= 5) {
            console.warn("Calendar update permanently failed after 5 retries:", update.eventId)
            continue
          }
          const delayMs = getCalendarUpdateBackoffMs(update.retryCount)
          const due = update.lastAttempt === 0 || now - update.lastAttempt >= delayMs
          if (!due) {
            nextQueue.push(update)
            continue
          }

          const success = await updateGoogleCalendarEvent(
            update.eventId,
            update.startTime,
            update.durationMinutes,
            update.description,
          )
          if (success) {
            continue
          }
          if (!calendarUpdateRetryableRef.current) {
            continue
          }
          const nextRetryCount = update.retryCount + 1
          if (nextRetryCount >= 5) {
            continue
          }
          nextQueue.push({
            ...update,
            retryCount: nextRetryCount,
            lastAttempt: now,
          })
        }
        const queueChanged =
          nextQueue.length !== queue.length || nextQueue.some((entry, index) => entry !== queue[index])
        if (source === "interval" || source === "online") {
          if (nextQueue.length < queue.length) {
            toast({
              title: "Calendar updates synced",
              description: "Pending updates were applied.",
              duration: 3000,
            })
          }
        }
        if (droppedCount > 0) {
          toast({
            title: "Calendar sync issues",
            description: `${droppedCount} update${droppedCount > 1 ? "s" : ""} couldn't be synced after multiple retries.`,
            variant: "destructive",
          })
        }
        if (queueChanged) {
          updatePendingCalendarUpdates(() => nextQueue)
        }
      } finally {
        calendarUpdateRetryInFlightRef.current = false
      }
    },
    [
      settings.googleCalendarAutoSync,
      settings.googleCalendarConnected,
      settings.googleCalendarSyncOvertime,
      updateGoogleCalendarEvent,
      updatePendingCalendarUpdates,
    ],
  )

  // Token refresh interval
  useEffect(() => {
    if (!settings.googleCalendarConnected && !settings.googleCalendarAutoSync) return

    let warningShown = false

    const checkAndRefreshToken = async () => {
      const showCalendarDisconnectedToast = () => {
        if (settings.googleCalendarAutoSync && !calendarSyncNotificationShownRef.current) {
          toast({
            title: "\u{1F512} Google Calendar Not Connected",
            description: "Auto-sync is enabled but your calendar is disconnected. Reconnect now?",
            variant: "destructive",
            action: (
              <div className="flex items-center gap-2">
                <ToastAction
                  altText="Reconnect"
                  onClick={() => {
                    window.location.href = "/api/google/auth"
                  }}
                >
                  Yes
                </ToastAction>
                <ToastAction altText="Dismiss">No</ToastAction>
              </div>
            ),
          })
          setCalendarSyncNotificationShown(true)
        } else {
          toast({
            title: "\u{1F512} Google Calendar disconnected",
            description: "Your session expired. Please reconnect in Settings.",
            variant: "destructive",
          })
        }
      }

      try {
        const statusResponse = await fetch("/api/google/status", { cache: "no-store" })
        if (!statusResponse.ok) return
        const status = (await statusResponse.json()) as { connected?: boolean; needsRefresh?: boolean }
        if (status.connected === false) {
          updateSettings({
            googleCalendarConnected: false,
            googleCalendarUserEmail: "",
            googleCalendarAutoSync: false,
          })
          showCalendarDisconnectedToast()
          return
        }
        if (!status.needsRefresh) return

        const response = await fetch("/api/google/refresh-token", { method: "POST" })
        if (response.status === 200) {
          return
        }
        if (response.status === 401) {
          updateSettings({
            googleCalendarConnected: false,
            googleCalendarUserEmail: "",
            googleCalendarAutoSync: false,
          })
          showCalendarDisconnectedToast()
          return
        }
        console.error("Failed to refresh Google Calendar token:", response.status)
      } catch (error) {
        console.error("Failed to refresh Google Calendar token:", error)
        if (!warningShown) {
          warningShown = true
          toast({
            title: "Connection issue",
            description: "Unable to refresh Google Calendar session. Will retry automatically.",
          })
        }
      }
    }

    void checkAndRefreshToken()
    const intervalMs = 5 * 60 * 1000
    const jitterMs = Math.floor(Math.random() * 60 * 1000)
    let intervalId: ReturnType<typeof setInterval> | null = null
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(checkAndRefreshToken, intervalMs)
    }, jitterMs)

    return () => {
      clearTimeout(timeoutId)
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [settings.googleCalendarAutoSync, settings.googleCalendarConnected, updateSettings])

  // Retry pending updates + online handler
  useEffect(() => {
    void retryPendingCalendarUpdates("startup")
    const intervalId = setInterval(() => {
      void retryPendingCalendarUpdates("interval")
    }, 60_000)
    const handleOnline = () => {
      void retryPendingCalendarUpdates("online")
    }
    window.addEventListener("online", handleOnline)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener("online", handleOnline)
    }
  }, [retryPendingCalendarUpdates])

  /** Initialize the queue without triggering persistence (for loadDatabase hydration). */
  const initializePendingCalendarUpdates = useCallback(
    (updates: Database["pendingCalendarUpdates"]) => {
      setPendingCalendarUpdates(updates)
    },
    [],
  )

  return {
    pendingCalendarUpdates,
    initializePendingCalendarUpdates,
    createGoogleCalendarEvent,
    updateGoogleCalendarEvent,
    queueCalendarUpdate,
    calendarUpdateRetryableRef,
    retryPendingCalendarUpdates,
  }
}

export default useCalendarSync
export type { PendingCalendarUpdate }
