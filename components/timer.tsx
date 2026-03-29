"use client"

import { useEffect, useRef } from "react"
import type { Task, Category } from "@/lib/types"
import { getDayWindowKey } from "@/lib/daily-reset"
import { getMaxStreak, getStreakColor, getStreakText } from "@/lib/habit-streak"
import { formatDuration, getOvertimeColors } from "@/lib/time-utils"

interface TimerProps {
  timeLeft: number
  onTimeChange: (time: number) => void
  isOvertime: boolean
  overtimeSeconds: number
  onOvertimeChange: (seconds: number) => void
  activeTask: Task | null
  activeProject: Category | null
  isRunning: boolean
  sessionStarted: boolean
  timerMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK"
  onToggleRunning: () => void
  initialTime: number
  onSkipBreak?: () => void
  onEndSession?: () => void
  isLongBreakAvailable: boolean
  onChangeMode: (mode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK") => void
  onCheckDailyReset: () => void
}

const getProgressBarStyles = (_color?: string | null, isOvertime = false, overtimeSeconds = 0) => {
  if (isOvertime) {
    const overtimePalette = getOvertimeColors(overtimeSeconds)
    const gradientAlphaMap: Record<string, string> = {
      "#facc15": "rgba(250,204,21,0.16)",
      "#fb923c": "rgba(251,146,60,0.16)",
      "#f97316": "rgba(249,115,22,0.16)",
      "#ef4444": "rgba(239,68,68,0.16)",
    }
    const gradientColor = gradientAlphaMap[overtimePalette.text] ?? "rgba(250,204,21,0.16)"

    return {
      containerStyle: {
        backgroundImage: `linear-gradient(90deg, transparent, ${gradientColor}, transparent)`,
        backgroundColor: overtimePalette.bg,
        borderColor: overtimePalette.border,
      } as React.CSSProperties,
      textStyle: { color: overtimePalette.text } as React.CSSProperties,
    }
  }

  return {
    containerStyle: {
      backgroundImage: "linear-gradient(90deg, transparent, rgba(212,212,216,0.12), transparent)",
      backgroundColor: "rgba(212,212,216,0.08)",
      borderColor: "rgba(212,212,216,0.2)",
    } as React.CSSProperties,
    textStyle: { color: "#d4d4d8" } as React.CSSProperties,
  }
}

function HabitProgressBar({
  activeProject,
  completed,
  elapsedTime,
  totalTime,
  isOvertime,
  overtimeSeconds,
}: {
  activeProject: Category | null
  completed: boolean
  elapsedTime: number
  totalTime: number
  isOvertime: boolean
  overtimeSeconds: number
}) {
  const { containerStyle, textStyle } = getProgressBarStyles(activeProject?.color, isOvertime, overtimeSeconds)
  const safeTotal = Math.max(totalTime, 0)
  const clampedElapsed = Math.min(Math.max(elapsedTime, 0), safeTotal)
  const linearProgress = completed ? 1 : safeTotal > 0 ? clampedElapsed / safeTotal : 0

  const barLength = 20
  const filledLength = Math.round(linearProgress * barLength)
  const emptyLength = barLength - filledLength

  const filled = "▓".repeat(filledLength)
  const empty = "░".repeat(emptyLength)

  return (
    <span className="inline-flex items-center">
      <span className="tracking-wider" style={textStyle}>
        [{filled}
        {empty}]
      </span>
    </span>
  )
}

function AsciiProgressBar({
  activeProject,
  elapsedTime,
  totalTime,
  isOvertime,
  overtimeSeconds,
}: {
  activeProject: Category | null
  elapsedTime: number
  totalTime: number
  isOvertime: boolean
  overtimeSeconds: number
}) {
  const { containerStyle, textStyle } = getProgressBarStyles(activeProject?.color, isOvertime, overtimeSeconds)
  const safeTotal = Math.max(totalTime, 0)
  const clampedElapsed = Math.min(Math.max(elapsedTime, 0), safeTotal)
  const linearProgress = safeTotal > 0 ? clampedElapsed / safeTotal : 0

  const barLength = 20
  const filledLength = Math.round(linearProgress * barLength)
  const emptyLength = barLength - filledLength

  const filled = "▓".repeat(filledLength)
  const empty = "░".repeat(emptyLength)

  return (
    <span className="inline-flex items-center">
      <span className="tracking-wider" style={textStyle}>
        [{filled}
        {empty}]
      </span>
    </span>
  )
}

export default function Timer({
  timeLeft,
  onTimeChange,
  isOvertime,
  overtimeSeconds,
  onOvertimeChange,
  activeTask,
  activeProject,
  isRunning,
  sessionStarted,
  timerMode,
  onToggleRunning,
  initialTime,
  onSkipBreak,
  onEndSession,
  isLongBreakAvailable,
  onChangeMode,
  onCheckDailyReset,
}: TimerProps) {
  const timeLeftRef = useRef(timeLeft)
  const overtimeSecondsRef = useRef(overtimeSeconds)

  useEffect(() => {
    onCheckDailyReset()
  }, [onCheckDailyReset])

  useEffect(() => {
    timeLeftRef.current = timeLeft
  }, [timeLeft])

  useEffect(() => {
    overtimeSecondsRef.current = overtimeSeconds
  }, [overtimeSeconds])

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      if (isOvertime) {
        const nextOvertime = overtimeSecondsRef.current + 1
        overtimeSecondsRef.current = nextOvertime
        onOvertimeChange(nextOvertime)
        return
      }
      const nextTime = timeLeftRef.current > 0 ? timeLeftRef.current - 1 : 0
      timeLeftRef.current = nextTime
      onTimeChange(nextTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, isOvertime, onOvertimeChange, onTimeChange])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const resolvedProjectType =
    activeProject?.projectType === "project" ||
    activeProject?.projectType === "habit" ||
    activeProject?.projectType === "work"
      ? activeProject.projectType
      : activeProject?.isHabitProject
        ? "habit"
        : "project"
  const isHabitProject = resolvedProjectType === "habit"
  const isWorkProject = resolvedProjectType === "work"
  const maxStreak = isHabitProject ? getMaxStreak(activeProject?.tasks ?? []) : 0
  const activeStreak = activeTask?.streak ?? 0
  const streakColor = isHabitProject ? getStreakColor(activeStreak, maxStreak) : ""
  const streakText = getStreakText(activeStreak)
  const spentTime = typeof activeTask?.spentTime === "number" ? activeTask.spentTime : 0
  const goalHours =
    typeof activeTask?.dailyGoal === "number" && Number.isFinite(activeTask.dailyGoal) && activeTask.dailyGoal > 0
      ? activeTask.dailyGoal
      : 8
  const goalSeconds = goalHours * 3600
  const progressRatio = goalSeconds > 0 ? spentTime / goalSeconds : 0
  const workColorClass =
    spentTime === 0 ? "text-neutral-500" : progressRatio >= 1 ? "text-green-400" : "text-amber-400"
  const availableModes: Array<"FOCUS" | "SHORT_BREAK" | "LONG_BREAK"> = isLongBreakAvailable
    ? ["FOCUS", "SHORT_BREAK", "LONG_BREAK"]
    : ["FOCUS", "SHORT_BREAK"]
  const resolvedModeIndex = availableModes.indexOf(timerMode)
  const activeModeIndex = resolvedModeIndex >= 0 ? resolvedModeIndex : 0
  const prevMode =
    availableModes[(activeModeIndex - 1 + availableModes.length) % availableModes.length] ?? "FOCUS"
  const nextMode = availableModes[(activeModeIndex + 1) % availableModes.length] ?? "FOCUS"
  const modeLabel = timerMode === "FOCUS" ? "FOCUS" : timerMode === "LONG_BREAK" ? "LONG BREAK" : "BREAK"
  const displayLabel = isOvertime ? "OVERTIME" : modeLabel
  const canNavigateModes = !isRunning && availableModes.length > 1
  const displayTime = isOvertime ? overtimeSeconds : timeLeft
  const overtimeColors = isOvertime ? getOvertimeColors(overtimeSeconds) : null

  return (
    <div className="text-center mb-16 relative">
      <div
        className="mb-4 text-sm font-mono font-extrabold leading-3 tracking-wider underline transition-opacity duration-500 text-neutral-300"
        style={{
          opacity: isRunning ? 0.05 : 1,
          transition: "opacity 0.8s ease",
        }}
      >
        {activeProject && (
          <>
            <span
              className="inline-block w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: activeProject.color }}
            ></span>
            {activeProject.name}
          </>
        )}
      </div>

      <div className="group flex items-center justify-center gap-3 mb-2 text-center">
        <button
          type="button"
          onClick={() => onChangeMode(prevMode)}
          disabled={!canNavigateModes}
          className="font-mono tracking-[0.2em] text-neutral-500 opacity-0 transition-opacity duration-300 ease-in-out hover:text-neutral-300 group-hover:opacity-100 disabled:opacity-0 disabled:group-hover:opacity-30 disabled:hover:text-neutral-500"
          aria-label="Previous timer mode"
        >
          {"[<]"}
        </button>
        <div className="flex flex-col items-center gap-1">
          <div
            className={`text-[10px] tracking-[0.3em] transition-colors duration-700 ease-in-out ${
              isOvertime
                ? ""
                : "text-neutral-500"
            }`}
            style={isOvertime && overtimeColors ? {
              color: overtimeColors.text,
            } : undefined}
          >
            {displayLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChangeMode(nextMode)}
          disabled={!canNavigateModes}
          className="font-mono tracking-[0.2em] text-neutral-500 opacity-0 transition-opacity duration-300 ease-in-out hover:text-neutral-300 group-hover:opacity-100 disabled:opacity-0 disabled:group-hover:opacity-30 disabled:hover:text-neutral-500"
          aria-label="Next timer mode"
        >
          {"[>]"}
        </button>
      </div>
      {timerMode === "FOCUS" && isLongBreakAvailable && (
        <div className="text-[10px] tracking-[0.25em] text-amber-400 mb-1">LONG BREAK READY</div>
      )}

      <div className="flex items-center justify-center mb-6">
        <div
          className={`text-7xl font-bold font-mono tracking-wider transition-all duration-700 ease-in-out hover:opacity-100 ${
            isOvertime
              ? ""
              : "text-neutral-300"
          }`}
          style={{
            opacity: isRunning && !isOvertime ? 0.05 : 1,
            transition: "opacity 0.8s ease",
            ...(isOvertime && overtimeColors ? {
              color: overtimeColors.text,
            } : {}),
          }}
        >
          {formatTime(displayTime)}
        </div>
      </div>

      {/* Control button - consistent color */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={onToggleRunning}
          className="font-mono text-lg font-bold tracking-widest hover:underline transition-all duration-300 px-4 py-2 text-neutral-300"
          style={{
            opacity: isRunning && !isOvertime ? 0.05 : 1,
            transition: "opacity 0.8s ease",
          }}
          aria-label={isRunning ? "Pause" : "Start"}
        >
          [{isRunning ? "PAUSE" : "START"}]
        </button>
      </div>
      {isOvertime && onEndSession && (
        <div className="flex justify-center mb-8">
          <button
            onClick={onEndSession}
            className="font-mono text-sm font-bold tracking-widest hover:underline transition-all duration-300 px-4 py-2"
            style={{
              color: overtimeColors?.text ?? "#d4d4d8",
            }}
            aria-label="End session"
          >
            [END SESSION]
          </button>
        </div>
      )}

      {(timerMode === "SHORT_BREAK" || timerMode === "LONG_BREAK") && onSkipBreak && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2">
          <button
            onClick={onSkipBreak}
            className={`font-mono text-sm font-bold tracking-widest hover:underline transition-all duration-300 px-3 py-2 text-neutral-400 hover:text-neutral-200 opacity-0 ${
              isRunning ? "hover:opacity-5 focus-visible:opacity-5" : "hover:opacity-30 focus-visible:opacity-30"
            }`}
            style={{
              transition: "opacity 0.8s ease",
            }}
            aria-label="Skip break"
          >
            [SKIP →]
          </button>
        </div>
      )}

      {/* Active task info + ASCII progress bar in focus mode */}
      {activeTask && isRunning && (
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className="flex flex-col items-center text-center gap-2 font-mono font-semibold transition-all duration-500 text-neutral-300"
            style={{
              fontSize: isRunning ? "1.125rem" : "0.875rem",
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-base">{activeTask.emoji}</span>
              <span className="underline">{activeTask.name}</span>
            </div>
            {isHabitProject ? (
              <span className={`text-xs font-mono whitespace-nowrap tabular-nums ${streakColor}`}>{streakText}</span>
            ) : null}
          </div>

          {timerMode === "FOCUS" && (
            <div className="w-full flex justify-center font-mono text-sm text-center transition-all duration-500">
              {isHabitProject ? (
                <HabitProgressBar
                  activeProject={activeProject}
                  completed={activeTask?.completed ?? false}
                  elapsedTime={initialTime - timeLeft}
                  totalTime={initialTime}
                  isOvertime={isOvertime}
                  overtimeSeconds={overtimeSeconds}
                />
              ) : (
                <AsciiProgressBar
                  activeProject={activeProject}
                  elapsedTime={initialTime - timeLeft}
                  totalTime={initialTime}
                  isOvertime={isOvertime}
                  overtimeSeconds={overtimeSeconds}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
