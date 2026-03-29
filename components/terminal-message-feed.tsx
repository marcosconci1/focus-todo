"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { QueuedAlert } from "@/lib/alert-types"
import { calculateAlertDuration, formatElapsedTime, replacePlaceholders } from "@/lib/alert-types"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/time-utils"

interface TerminalMessageFeedProps {
  messages: QueuedAlert[]
  onHover?: (messageId: string, hovered: boolean) => void
  timeKeeperEnabled: boolean
  lastTimerStartAt: number | null
  isTimerRunning: boolean
}

const MAX_MESSAGES = 3
const FALLBACK_AUTHOR_COLORS: Record<string, string> = {
  "author-rocky": "#ff6b6b",
  "author-adrian": "#9b59b6",
  "author-system": "#00bcd4",
}
const DEFAULT_AUTHOR_COLOR = "#ff6b6b"

const formatRemainingTime = (ms: number): string => {
  if (!Number.isFinite(ms)) {
    return "∞"
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function TerminalMessageFeed({
  messages,
  onHover,
  timeKeeperEnabled,
  lastTimerStartAt,
  isTimerRunning,
}: TerminalMessageFeedProps) {
  const visibleMessages = useMemo(() => messages.slice(-MAX_MESSAGES), [messages])
  const opacityClasses = useMemo(
    () => ["opacity-20", "opacity-50", "opacity-50"] as const,
    [],
  )
  const [remainingById, setRemainingById] = useState<Record<string, number>>({})
  const [timeKeeperNow, setTimeKeeperNow] = useState<number>(() => Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (visibleMessages.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const updateRemaining = () => {
      const next: Record<string, number> = {}
      for (const message of visibleMessages) {
        const duration = calculateAlertDuration(
          message.template.type,
          message.round,
          message.authorMessageDuration ?? 5,
        )
        const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.now()
        const elapsed = Date.now() - timestamp
        const remaining = Math.max(0, duration - elapsed)
        next[message.id] = remaining
      }
      setRemainingById(next)
    }

    updateRemaining()
    intervalRef.current = setInterval(updateRemaining, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [visibleMessages])

  useEffect(() => {
    if (!timeKeeperEnabled || !lastTimerStartAt) return

    const updateElapsed = () => {
      setTimeKeeperNow(Date.now())
    }

    const kickoff = setTimeout(updateElapsed, 0)
    const interval = setInterval(updateElapsed, 10000)

    return () => {
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [timeKeeperEnabled, lastTimerStartAt])

  const handleHover = useCallback(
    (messageId: string, hovered: boolean) => {
      onHover?.(messageId, hovered)
    },
    [onHover],
  )

  const showTimeKeeper = timeKeeperEnabled && Boolean(lastTimerStartAt)
  const elapsedTime = useMemo(() => {
    if (!showTimeKeeper || !lastTimerStartAt) return ""
    const elapsed = Math.max(0, timeKeeperNow - lastTimerStartAt)
    return formatElapsedTime(elapsed)
  }, [showTimeKeeper, lastTimerStartAt, timeKeeperNow])
  if (visibleMessages.length === 0 && !showTimeKeeper) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-5 lg:px-6 pt-6 pb-16 lg:pb-20"
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Alert message console"
    >
      <div className="mx-auto max-w-7xl">
        {showTimeKeeper && (
          <div
            className={cn(
              "mb-3 font-mono text-sm leading-7 tracking-wider border-b border-neutral-800 pb-2",
              isTimerRunning ? "bg-emerald-950/10" : "bg-amber-950/10",
            )}
          >
            <div className="flex items-start gap-2">
              <span className="select-none text-[#666666]">~</span>
              <span className="select-none text-[#666666]">&gt;</span>
              <span className="font-bold" style={{ color: "#f39c12" }}>
                @TimeKeeper
              </span>
              <span className={cn("flex-1", isTimerRunning ? "text-emerald-200" : "text-amber-200")}>
                {isTimerRunning ? `Active session: ${elapsedTime}` : `Idle for ${elapsedTime}`}
              </span>
              <span className="text-xs text-[#888888] animate-pulse">⏱ LIVE</span>
            </div>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {visibleMessages.map((message, index) => {
            const remaining = remainingById[message.id] ?? 0
            const opacityClass = opacityClasses[index] ?? "opacity-50"
            const rawTitle = message.template.title?.trim() || "Author"
            const authorLabel = rawTitle.startsWith("@") ? rawTitle : `@${rawTitle}`
            const messageText = replacePlaceholders(message.template.message, {
              hoursLeft: message.hoursLeft,
              habitCountLeft: message.habitCountLeft,
              elapsedTime: message.elapsedTime,
            })
            const durationId = `alert-duration-${message.id}`
            const fallbackColor =
              (message.template.authorId &&
                FALLBACK_AUTHOR_COLORS[message.template.authorId]) ||
              DEFAULT_AUTHOR_COLOR
            const authorColor = message.authorColor || fallbackColor

            return (
              <motion.div
                key={message.id}
                className={cn(
                  "group relative mb-2 font-mono text-sm leading-7 tracking-wider transition-opacity duration-200 ease-in-out hover:opacity-100",
                  opacityClass,
                )}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                role="article"
                aria-label={`Alert from ${authorLabel}: ${messageText}`}
                aria-describedby={durationId}
                onMouseEnter={() => handleHover(message.id, true)}
                onMouseLeave={() => handleHover(message.id, false)}
              >
                <div className="flex items-start gap-2">
                  <span className="select-none text-[#666666]">~ &gt;</span>
                  <span
                    className="font-bold"
                    style={{ color: authorColor }}
                  >
                    {authorLabel}
                  </span>
                  <span className="flex-1 text-[#e0e0e0]">
                    {messageText}
                  </span>
                  <span
                    id={durationId}
                    className="text-xs tabular-nums text-[#888888]"
                    title={formatDuration(Math.max(0, remaining))}
                  >
                    {formatRemainingTime(remaining)}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default React.memo(TerminalMessageFeed)
