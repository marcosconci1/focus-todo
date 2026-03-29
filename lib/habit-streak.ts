import type { Task } from "./types"

export function getMaxStreak(tasks: Task[] = []): number {
  if (tasks.length === 0) return 0
  return Math.max(
    0,
    ...tasks.map((task) => (typeof task?.streak === "number" ? task.streak : 0)),
  )
}

export function getStreakText(streak: number): string {
  if (streak === 0) {
    return "( - 0x )"
  }
  if (streak > 0) {
    return `(↑ ${streak}x)`
  }
  return `(↓ ${Math.abs(streak)}x)`
}

export function getStreakColor(streak: number, maxStreak: number): string {
  if (streak === 0) return "text-neutral-500"
  if (streak > 0) {
    const safeMax = maxStreak > 0 ? maxStreak : streak
    if (streak >= safeMax) return "text-green-400"

    const ratio = streak / safeMax

    if (ratio >= 0.9) return "text-green-500"
    if (ratio >= 0.8) return "text-green-600"
    if (ratio >= 0.7) return "text-green-700"
    if (ratio >= 0.6) return "text-green-800"
    if (ratio >= 0.5) return "text-green-900"
    return "text-green-950"
  }

  const absStreak = Math.abs(streak)
  const maxNegativeReference = maxStreak > 0 ? maxStreak : 10
  const negativeRatio = absStreak / maxNegativeReference

  if (negativeRatio >= 0.9 || absStreak >= 9) return "text-red-500"
  if (negativeRatio >= 0.7 || absStreak >= 7) return "text-red-600"
  if (negativeRatio >= 0.5 || absStreak >= 5) return "text-red-700"
  if (negativeRatio >= 0.3 || absStreak >= 3) return "text-red-800"
  if (negativeRatio >= 0.1 || absStreak >= 1) return "text-red-900"
  return "text-red-900"
}
