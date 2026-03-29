"use client"

import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import type { QueuedAlert } from "@/lib/alert-types"
import { calculateAlertDuration, replacePlaceholders } from "@/lib/alert-types"

interface RealityCheckAlertProps {
  alert: QueuedAlert | null
  onDismiss: () => void
  onHover: (hovered: boolean) => void
  onSnooze?: () => void
  onPlaySound?: (volume: number) => void
}

export default function RealityCheckAlert({
  alert,
  onDismiss,
  onHover,
  onSnooze,
  onPlaySound,
}: RealityCheckAlertProps) {
  const lastAlertIdRef = useRef<string | null>(null)
  const [timeProgress, setTimeProgress] = useState(100)

  useEffect(() => {
    if (!alert) return
    if (lastAlertIdRef.current === alert.id) return
    lastAlertIdRef.current = alert.id
    onPlaySound?.(1)
  }, [alert, onPlaySound])

  useEffect(() => {
    if (!alert) return

    const startTime = Date.now()
    const duration = calculateAlertDuration(alert.template.type, alert.round)

    const tick = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setTimeProgress(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
      }
    }

    const interval = setInterval(tick, 50)
    const kickoff = setTimeout(tick, 0)

    return () => {
      clearInterval(interval)
      clearTimeout(kickoff)
    }
  }, [alert])

  if (!alert) return null

  return (
    <div
      className="fixed top-4 right-4 z-50 max-w-sm animate-in slide-in-from-top-4"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <Alert className="flex gap-3 bg-neutral-950/95 border-neutral-700">
        <Avatar className="rounded-sm">
          <AvatarFallback
            className="text-xs font-mono text-white"
            style={{ backgroundColor: alert.authorColor || "#ff6b6b", opacity: 0.9 }}
          >
            {alert.template.title.replace("@", "")}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex-1 flex-col justify-center gap-1">
            <AlertTitle className="font-mono" style={{ color: alert.authorColor || "#ff6b6b" }}>
              {alert.template.title}
            </AlertTitle>
            <AlertDescription className="text-neutral-400 text-xs">
              {replacePlaceholders(alert.template.message, {
                hoursLeft: alert.hoursLeft,
                habitCountLeft: alert.habitCountLeft,
              })}
            </AlertDescription>
          </div>
          <Progress
            value={timeProgress}
            className="bg-amber-600/20 *:bg-amber-600 dark:bg-amber-400/20 dark:*:bg-amber-400"
            aria-label="Alert progress"
          />
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onDismiss}
            className="text-neutral-600 hover:text-neutral-400 text-xs"
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      </Alert>
    </div>
  )
}
