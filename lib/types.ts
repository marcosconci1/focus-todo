export interface Task {
  id: string
  name: string
  completed: boolean
  dailyGoal: number
  currentProgress: number
  spentTime?: number
  icon?: string
  emoji: string
  completedAt?: number
  streak?: number // Add streak field for habit tasks
}

export interface Category {
  id: string
  name: string
  color: string
  tasks: Task[]
  dailyGoalHours?: number
  projectType?: "project" | "habit" | "work"
  isHabitProject?: boolean
}

export interface HistoryEntry {
  id?: number
  taskId: string
  completedAt: number
  startTime?: number
  duration?: number
  overtimeDuration?: number
  calendarEventId?: string
}

export type GoogleCalendarEventFormat = "" | "task" | "project-task" | "emoji" | "emoji-task-project"
