import type { Category, Task } from "@/lib/types"

const ensureString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback

const ensureNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const ensureBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

export const normalizeColor = (value: unknown): string => {
  if (typeof value !== "string") return "#ffffff"
  const trimmed = value.trim()
  if (!trimmed) return "#ffffff"
  const lower = trimmed.toLowerCase()
  if (lower === "white") return "#ffffff"

  const hex = lower.startsWith("#") ? lower.slice(1) : lower
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex
      .split("")
      .map((ch) => ch + ch)
      .join("")}`
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex}`
  }
  return "#ffffff"
}

export const resolveIsHabitProject = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

export const normalizeTask = (task: Partial<Task> | null | undefined, index: number): Task => {
  const safeTask = task ?? {}
  const id = ensureString(safeTask.id, `task-${Date.now()}-${index}`)
  return {
    id,
    name: ensureString(safeTask.name, "Untitled task"),
    completed: ensureBoolean(safeTask.completed, false),
    dailyGoal: ensureNumber(safeTask.dailyGoal, 0),
    currentProgress: ensureNumber(safeTask.currentProgress, 0),
    spentTime: ensureNumber(safeTask.spentTime, 0),
    emoji: ensureString(safeTask.emoji, "*"),
    icon: typeof safeTask.icon === "string" ? safeTask.icon : undefined,
    completedAt: typeof safeTask.completedAt === "number" ? safeTask.completedAt : undefined,
    streak: typeof safeTask.streak === "number" ? safeTask.streak : undefined,
  }
}

export const normalizeCategory = (category: Partial<Category> | null | undefined, index: number): Category => {
  const safeCategory = category ?? {}
  const id = ensureString(safeCategory.id, `category-${Date.now()}-${index}`)
  const tasks = Array.isArray(safeCategory.tasks) ? safeCategory.tasks : []
  const isHabitProject = typeof safeCategory.isHabitProject === "boolean" ? safeCategory.isHabitProject : undefined
  const rawProjectType = safeCategory.projectType
  const projectType =
    rawProjectType === "project" || rawProjectType === "habit" || rawProjectType === "work"
      ? rawProjectType
      : isHabitProject
        ? "habit"
        : "project"
  const dailyGoalHours = ensureNumber(safeCategory.dailyGoalHours, 8)
  return {
    id,
    name: ensureString(safeCategory.name, "Untitled category"),
    color: normalizeColor(safeCategory.color),
    projectType,
    dailyGoalHours,
    ...(isHabitProject !== undefined ? { isHabitProject } : {}),
    tasks: tasks.map((task, taskIndex) => {
      const normalizedTask = normalizeTask(task, taskIndex)
      if (projectType === "work") {
        const taskGoal = (task as Task | undefined)?.dailyGoal
        normalizedTask.dailyGoal =
          typeof taskGoal === "number" && Number.isFinite(taskGoal) ? taskGoal : 8
      }
      return normalizedTask
    }),
  }
}

export const normalizeCategoriesForSave = (rawCategories: Category[]): Category[] => {
  return (rawCategories ?? []).map((category, categoryIndex) => {
    const safeCategory = category ?? ({} as Category)
    const resolvedIsHabit = resolveIsHabitProject((safeCategory as Category).isHabitProject)
    const rawProjectType = (safeCategory as Category).projectType
    const projectType =
      rawProjectType === "project" || rawProjectType === "habit" || rawProjectType === "work"
        ? rawProjectType
        : resolvedIsHabit
          ? "habit"
          : "project"
    const isHabitProject = projectType === "habit"
    const dailyGoalHoursRaw = (safeCategory as Category).dailyGoalHours
    const dailyGoalHours =
      projectType === "work" && typeof dailyGoalHoursRaw === "number" && Number.isFinite(dailyGoalHoursRaw)
        ? dailyGoalHoursRaw
        : projectType === "work"
          ? 8
          : undefined
    const tasks = (safeCategory.tasks ?? []).filter(Boolean).map((task, taskIndex) => {
      const safeTask = task ?? ({} as Task)
      const dailyGoal = isHabitProject
        ? 1
        : projectType === "work"
          ? typeof safeTask.dailyGoal === "number" && Number.isFinite(safeTask.dailyGoal)
            ? safeTask.dailyGoal
            : 8
          : typeof safeTask.dailyGoal === "number" && Number.isFinite(safeTask.dailyGoal)
            ? safeTask.dailyGoal
            : 0
      const spentTime =
        isHabitProject
          ? 0
          : typeof safeTask.spentTime === "number" && Number.isFinite(safeTask.spentTime)
            ? safeTask.spentTime
            : 0
      const currentProgress =
        isHabitProject
          ? 0
          : typeof safeTask.currentProgress === "number" && Number.isFinite(safeTask.currentProgress)
            ? safeTask.currentProgress
            : 0
      return {
        id:
          typeof safeTask.id === "string"
            ? safeTask.id
            : `task-${Date.now()}-${categoryIndex}-${taskIndex}`,
        name: typeof safeTask.name === "string" ? safeTask.name : "Untitled task",
        completed: typeof safeTask.completed === "boolean" ? safeTask.completed : false,
        dailyGoal,
        currentProgress,
        spentTime,
        emoji: typeof safeTask.emoji === "string" ? safeTask.emoji : "*",
        icon: typeof safeTask.icon === "string" ? safeTask.icon : undefined,
        completedAt: typeof safeTask.completedAt === "number" ? safeTask.completedAt : undefined,
        streak: typeof safeTask.streak === "number" ? safeTask.streak : undefined,
      }
    })

    const normalizedColor = normalizeColor(safeCategory.color)

    return {
      id: typeof safeCategory.id === "string" ? safeCategory.id : `category-${Date.now()}-${categoryIndex}`,
      name: typeof safeCategory.name === "string" ? safeCategory.name : "Untitled category",
      color: normalizedColor,
      projectType,
      dailyGoalHours,
      isHabitProject,
      tasks,
    }
  })
}
