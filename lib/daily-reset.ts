import type { AlertTracking } from "./alert-types"
import type { Category } from "./types"

type EndOfDayTime = {
  hours: number
  minutes: number
}

const parseEndOfDayTime = (endOfDayTime?: string): EndOfDayTime => {
  if (endOfDayTime === undefined) {
    return { hours: 0, minutes: 0 }
  }
  if (typeof endOfDayTime !== "string") {
    throw new TypeError("endOfDayTime must be a string in HH:MM format")
  }
  const match = endOfDayTime.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    throw new TypeError(`endOfDayTime must match HH:MM format (received "${endOfDayTime}")`)
  }
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) {
    throw new RangeError(`endOfDayTime hours must be between 0 and 23 (received "${match[1]}")`)
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    throw new RangeError(`endOfDayTime minutes must be between 0 and 59 (received "${match[2]}")`)
  }
  return { hours, minutes }
}

const getWindowStart = (now: Date, endOfDayTime?: string): Date => {
  const { hours, minutes } = parseEndOfDayTime(endOfDayTime)
  const cutoff = new Date(now)
  cutoff.setHours(hours, minutes, 0, 0)
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1)
  }
  return cutoff
}

export const getDayWindowKey = (now: Date, endOfDayTime?: string): string => {
  const windowStart = getWindowStart(now, endOfDayTime)
  const year = windowStart.getFullYear()
  const month = String(windowStart.getMonth() + 1).padStart(2, "0")
  const day = String(windowStart.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function checkAndResetDailyProjects(
  categories: Category[],
  lastResetDate?: string,
  endOfDayTime?: string,
  options?: { alertTracking?: AlertTracking; resetSessionCounterDaily?: boolean },
): { categories: Category[]; shouldSave: boolean; alertTracking?: AlertTracking } {
  // Caller is responsible for persisting updated metadata and alert tracking to SQLite (see page.tsx).
  const today = getDayWindowKey(new Date(), endOfDayTime)

  if (lastResetDate !== today) {
    const isHabitCategory = (category: Category) =>
      Boolean(category.isHabitProject) || category.projectType === "habit"
    const habitProjects = categories.filter((category) => isHabitCategory(category))
    const workProjects = categories.filter((category) => category.projectType === "work")
    const habitTaskCount = habitProjects.reduce((sum, category) => sum + (category.tasks?.length ?? 0), 0)
    const workTaskCount = workProjects.reduce((sum, category) => sum + (category.tasks?.length ?? 0), 0)
    const previousKey = lastResetDate ?? "none"
    console.log(`Daily reset triggered: ${previousKey} -> ${today}`)
    console.log(
      `Resetting ${habitProjects.length} habit projects (${habitTaskCount} tasks), ${workProjects.length} work projects (${workTaskCount} tasks)`,
    )

    const resetCategories = categories.map((category) => {
      if (isHabitCategory(category)) {
        const tasks = Array.isArray(category.tasks) ? category.tasks : []
        return {
          ...category,
          tasks: tasks.map((task) => {
            const nextStreak = task.completed ? (task.streak || 0) + 1 : Math.max(0, (task.streak || 0) - 1)
            return {
              ...task,
              streak: nextStreak,
              spentTime: 0,
              completed: false,
              completedAt: undefined,
            }
          }),
        }
      }

      if (category.projectType === "work") {
        const tasks = Array.isArray(category.tasks) ? category.tasks : []
        return {
          ...category,
          tasks: tasks.map((task) => ({
            ...task,
            spentTime: 0,
          })),
        }
      }

      return category
    })

    const shouldResetCounter = Boolean(options?.resetSessionCounterDaily)
    const currentTracking = options?.alertTracking
    let nextTracking: AlertTracking | undefined
    if (currentTracking) {
      nextTracking = {
        ...currentTracking,
        lastTaskCompletedAt: null,
        lastBreakActivatedAt: null,
        breakReminderRound: 0,
        firedAlertsToday: [],
        distractionsToday: 0,
        timeWasted: 0,
      }
      if (shouldResetCounter) {
        nextTracking.globalSessionCounter = 0
      }
    } else if (shouldResetCounter) {
      console.warn("Daily reset skipped session counter reset due to missing alertTracking.")
    }

    return {
      categories: resetCategories,
      shouldSave: true,
      ...(nextTracking ? { alertTracking: nextTracking } : {}),
    }
  }

  return { categories, shouldSave: false }
}

export function sortCategoriesWithHabitsFirst(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a.isHabitProject && !b.isHabitProject) return -1
    if (!a.isHabitProject && b.isHabitProject) return 1
    return 0
  })
}

export function isValidDragMove(categories: Category[], activeId: string, overId: string): boolean {
  const activeCategory = categories.find((c) => c.id === activeId)
  const overCategory = categories.find((c) => c.id === overId)

  if (!activeCategory || !overCategory) return true

  // If dragging a standard project over a habit project, check if it would go above it
  if (!activeCategory.isHabitProject && overCategory.isHabitProject) {
    return false // Standard projects can't be placed above habit projects
  }

  return true
}
