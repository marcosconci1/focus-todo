"use client"

import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import type { Task } from "@/lib/types"
import { getStreakColor, getStreakText } from "@/lib/habit-streak"
import { formatDuration } from "@/lib/time-utils"

interface TaskItemProps {
  task: Task
  isActive: boolean
  onToggle: () => void
  onSetActive: () => void
  onEdit?: () => void
  isHabitProject?: boolean
  projectType?: "project" | "habit" | "work"
  maxStreak?: number
}

export default function TaskItem({
  task,
  isActive,
  onToggle,
  onSetActive,
  onEdit,
  isHabitProject,
  projectType,
  maxStreak = 1,
}: TaskItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const resolvedProjectType =
    projectType === "project" || projectType === "habit" || projectType === "work"
      ? projectType
      : isHabitProject
        ? "habit"
        : "project"
  const isHabit = resolvedProjectType === "habit"
  const streak = task.streak ?? 0
  const streakColor = isHabit ? getStreakColor(streak, maxStreak) : ""
  const streakText = isHabit ? getStreakText(streak) : ""
  const spentTime = typeof task.spentTime === "number" ? task.spentTime : 0
  const goalHours =
    typeof task.dailyGoal === "number" && Number.isFinite(task.dailyGoal) && task.dailyGoal > 0
      ? task.dailyGoal
      : 8
  const goalSeconds = goalHours * 3600
  const progressRatio = goalSeconds > 0 ? spentTime / goalSeconds : 0
  const workColorClass =
    spentTime === 0 ? "text-neutral-500" : progressRatio >= 1 ? "text-green-400" : "text-amber-400"

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex items-center gap-1 transition-colors ${isActive ? "bg-white/5" : ""} -mx-2 px-4 pr-4 py-1`}
    >
      <span className="text-sm font-mono text-neutral-500 shrink-0">-</span>
      <span className="w-2 shrink-0"></span>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="text-sm font-mono text-neutral-500 hover:text-neutral-300 transition shrink-0 cursor-pointer"
      >
        {task.completed ? "[x]" : "[ ]"}
      </button>

      <div onClick={onSetActive} className="flex-1 min-w-0 cursor-pointer flex items-center gap-2 ml-2">
        <span className="text-base shrink-0">{task.emoji}</span>
        <span
          className={`text-sm truncate font-semibold ${
            task.completed ? "line-through text-neutral-600 opacity-60" : "text-neutral-300"
          } ${isActive && !task.completed ? "text-neutral-100 underline" : ""}`}
        >
          {task.name}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isHabit ? (
          <div className={`text-xs font-mono ${streakColor} w-16 text-right whitespace-nowrap tabular-nums`}>
            {streakText}
          </div>
        ) : resolvedProjectType === "work" ? (
          <div className={`text-xs font-mono w-16 text-right whitespace-nowrap tabular-nums ${workColorClass}`}>
            {formatDuration(spentTime)}
          </div>
        ) : (
          <div className="text-xs font-mono text-neutral-500 w-16 text-right whitespace-nowrap tabular-nums">
            ({task.currentProgress}/{task.dailyGoal})
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit?.()
          }}
          className={`text-neutral-500 hover:text-neutral-300 transition ${isHovered ? "opacity-100" : "opacity-0"}`}
          aria-label="Edit task"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  )
}
