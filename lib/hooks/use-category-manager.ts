"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type { Category, Task, GoogleCalendarEventFormat } from "@/lib/types"
import type { Database } from "@/lib/storage"
import type { NudgeSettings } from "@/lib/settings-store"
import type { AlertTracking } from "@/lib/alert-types"
import { toast } from "@/hooks/use-toast"
import { normalizeColor, resolveIsHabitProject } from "@/lib/validation/category-validation"
import { sortCategoriesWithHabitsFirst } from "@/lib/daily-reset"

interface UseCategoryManagerOptions {
  buildDatabase: (categories: Category[]) => Database
  persistCategories: (nextCategories: Category[], previousData: Database, immediate?: boolean) => void
  timerMode: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK"
  settings: NudgeSettings
  alertTrackingRef: React.RefObject<AlertTracking>
  handleUpdateTracking: (tracking: AlertTracking) => void
  createGoogleCalendarEvent: (
    task: Task | null,
    project: Category | null,
    durationMinutes: number,
    eventFormat: GoogleCalendarEventFormat,
    isBreak?: boolean,
    breakType?: "SHORT_BREAK" | "LONG_BREAK",
  ) => Promise<string | null>
}

function useCategoryManager({
  buildDatabase,
  persistCategories,
  timerMode,
  settings,
  alertTrackingRef,
  handleUpdateTracking,
  createGoogleCalendarEvent,
}: UseCategoryManagerOptions) {
  const [categories, setCategories] = useState<Category[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const categoriesRef = useRef<Category[]>([])
  const habitCompletionSyncRef = useRef<Map<string, number>>(new Map())

  // Sync categoriesRef with categories state
  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  const handleTaskToggle = async (categoryId: string, taskId: string) => {
    const targetCategory = categories.find((cat) => cat.id === categoryId)
    const targetTask = targetCategory?.tasks.find((task) => task.id === taskId)
    if (!targetCategory || !targetTask) return

    const willBeCompleted = !targetTask.completed
    const isHabitProject = targetCategory.isHabitProject || targetCategory.projectType === "habit"
    const shouldSyncCalendar =
      willBeCompleted &&
      !targetTask.completed &&
      isHabitProject &&
      settings.googleCalendarAutoSync &&
      settings.googleCalendarConnected


    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = cats.map((cat) => {
        if (cat.id !== categoryId) return cat

        return {
          ...cat,
          tasks: cat.tasks.map((task) => {
            if (task.id !== taskId) return task

            const willBeCompleted = !task.completed

            return {
              ...task,
              completed: willBeCompleted,
              completedAt: willBeCompleted ? Date.now() : undefined,
            }
          }),
        }
      })
      persistCategories(updated, previousData)
      return updated
    })

    if (willBeCompleted) {
      const updatedTracking = {
        ...alertTrackingRef.current,
        lastTaskCompletedAt: new Date().toISOString(),
        breakReminderRound: 0,
      }
      handleUpdateTracking(updatedTracking)
    }

    if (!shouldSyncCalendar) return
    if (habitCompletionSyncRef.current.has(taskId)) return

    habitCompletionSyncRef.current.set(taskId, targetTask.streak || 0)
    try {
      const eventId = await createGoogleCalendarEvent(
        targetTask,
        targetCategory,
        settings.pomodoroMinutes,
        settings.googleCalendarEventFormat,
      )
      if (!eventId) return
    } finally {
      habitCompletionSyncRef.current.delete(taskId)
    }
  }

  const handleSetActiveTask = (taskId: string) => {
    if (timerMode === "SHORT_BREAK" || timerMode === "LONG_BREAK") {
      toast({
        title: "Cannot assign task during break",
        description: "Breaks should remain standalone. Wait for the break to finish.",
        variant: "destructive",
      })
      return
    }
    setActiveTaskId(taskId)
  }

  const handleUpdateCategory = async (
    categoryId: string,
    updatedCategory: Category,
  ) => {
    const currentCategory = categoriesRef.current.find((category) => category.id === categoryId)
    if (!currentCategory) {
      return
    }
    const currentProjectType =
      currentCategory.projectType === "project" ||
      currentCategory.projectType === "habit" ||
      currentCategory.projectType === "work"
        ? currentCategory.projectType
        : currentCategory.isHabitProject
          ? "habit"
          : "project"
    const nextProjectType =
      updatedCategory.projectType === "project" ||
      updatedCategory.projectType === "habit" ||
      updatedCategory.projectType === "work"
        ? updatedCategory.projectType
        : resolveIsHabitProject(updatedCategory.isHabitProject ?? currentCategory.isHabitProject)
          ? "habit"
          : "project"
    const hasProjectTypeChange = currentProjectType !== nextProjectType
    const shouldResetProgress = hasProjectTypeChange

    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = sortCategoriesWithHabitsFirst(
        cats.map((cat) =>
          cat.id === categoryId
            ? (() => {
                const nextIsHabitProject = resolveIsHabitProject(
                  updatedCategory.isHabitProject ?? cat.isHabitProject,
                )
                const resolvedNextProjectType =
                  updatedCategory.projectType === "project" ||
                  updatedCategory.projectType === "habit" ||
                  updatedCategory.projectType === "work"
                    ? updatedCategory.projectType
                    : cat.projectType ?? (nextIsHabitProject ? "habit" : "project")
                const nextDailyGoalHours =
                  resolvedNextProjectType === "work" &&
                  typeof updatedCategory.dailyGoalHours === "number" &&
                  Number.isFinite(updatedCategory.dailyGoalHours)
                    ? updatedCategory.dailyGoalHours
                    : resolvedNextProjectType === "work"
                      ? cat.dailyGoalHours ?? 8
                      : undefined
                const baseTasks = cat.tasks ?? []
                const nextTasks = shouldResetProgress
                  ? baseTasks.map((task) => ({
                      ...task,
                      completed: false,
                      completedAt: undefined,
                      currentProgress: 0,
                      spentTime: 0,
                      streak: 0,
                      ...(nextIsHabitProject ? { dailyGoal: 1 } : {}),
                    }))
                  : nextIsHabitProject
                    ? baseTasks.map((task) => ({
                        ...task,
                        dailyGoal: 1,
                      }))
                    : baseTasks
                const hasValidColor =
                  typeof updatedCategory.color === "string" && updatedCategory.color.trim().length > 0
                const nextColor = hasValidColor ? normalizeColor(updatedCategory.color) : cat.color
                const nextCategory = {
                  ...cat,
                  name: updatedCategory.name?.trim() ? updatedCategory.name : cat.name,
                  color: nextColor,
                  projectType: resolvedNextProjectType,
                  ...(resolvedNextProjectType === "work" ? { dailyGoalHours: nextDailyGoalHours } : {}),
                  isHabitProject: nextIsHabitProject,
                  tasks: nextTasks,
                }
                return nextCategory
              })()
            : cat,
        ),
      )
      persistCategories(updated, previousData)
      return updated
    })

    if (hasProjectTypeChange) {
      if (activeTaskId && currentCategory.tasks.some((task) => task.id === activeTaskId)) {
        setActiveTaskId(null)
      }
      toast({
        title: "Project type updated. Progress has been reset.",
      })
      return
    }

    toast({
      title: "Project updated successfully.",
    })
  }

  const handleDeleteCategory = (categoryId: string) => {
    const currentCategories = categoriesRef.current
    const deletedCategory = currentCategories.find((cat) => cat.id === categoryId)
    if (deletedCategory && deletedCategory.tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(null)
    }
    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = cats.filter((cat) => cat.id !== categoryId)
      persistCategories(updated, previousData, true)
      return updated
    })
  }

  const handleAddTask = (categoryId: string, task: Task) => {
    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = cats.map((cat) => {
        if (cat.id !== categoryId) return cat
        const nextTask = cat.isHabitProject
          ? { ...task, dailyGoal: 1, currentProgress: 0, spentTime: 0 }
          : task
        return { ...cat, tasks: [...cat.tasks, nextTask] }
      })
      persistCategories(updated, previousData)
      return updated
    })
  }

  const handleDeleteTask = (categoryId: string, taskId: string) => {
    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = cats.map((cat) => {
        if (cat.id !== categoryId) return cat
        return {
          ...cat,
          tasks: (cat.tasks ?? []).filter((task) => task.id !== taskId),
        }
      })
      if (activeTaskId === taskId) {
        setActiveTaskId(null)
      }
      persistCategories(updated, previousData, true)
      return updated
    })
  }

  const handleEditTask = (categoryId: string, updatedTask: Task) => {
    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = cats.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              tasks: cat.tasks.map((task) => {
                if (task.id !== updatedTask.id) return task
                return cat.isHabitProject
                  ? { ...updatedTask, dailyGoal: 1, currentProgress: 0, spentTime: 0 }
                  : updatedTask
              }),
            }
          : cat,
      )
      persistCategories(updated, previousData)
      return updated
    })
  }

  const handleReorderCategories = (reorderedCategories: Category[]) => {
    setCategories((cats) => {
      const previousData = buildDatabase(cats)
      const updated = sortCategoriesWithHabitsFirst(reorderedCategories)
      persistCategories(updated, previousData)
      return updated
    })
  }

  const activeProject = useMemo(
    () => categories.find((cat) => cat.tasks?.some((task) => task.id === activeTaskId)) || null,
    [categories, activeTaskId],
  )

  const activeTask = useMemo(
    () => categories.flatMap((c) => c.tasks ?? []).find((t) => t.id === activeTaskId) || null,
    [categories, activeTaskId],
  )

  return {
    categories,
    setCategories,
    activeTaskId,
    setActiveTaskId,
    categoriesRef,
    activeProject,
    activeTask,
    handleTaskToggle,
    handleSetActiveTask,
    handleUpdateCategory,
    handleDeleteCategory,
    handleAddTask,
    handleDeleteTask,
    handleEditTask,
    handleReorderCategories,
  }
}

export default useCategoryManager
