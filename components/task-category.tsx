"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import TaskItem from "@/components/task-item"
import ProjectHeader from "@/components/project-header"
import EmojiPicker from "@/components/emoji-picker"
import ModalShell from "@/components/modal-shell"
import type { Category, Task } from "@/lib/types"
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core"
import { getRandomEmoji } from "@/lib/emoji-utils"
import { getMaxStreak, getStreakColor, getStreakText } from "@/lib/habit-streak"

interface TaskCategoryProps {
  category: Category
  activeTaskId: string | null
  onTaskToggle: (categoryId: string, taskId: string) => void
  onSetActiveTask: (taskId: string) => void
  onUpdateCategory: (categoryId: string, updatedCategory: Category) => void | Promise<void>
  onDeleteCategory: () => void
  onAddTask: (categoryId: string, task: Task) => void
  onDeleteTask: (categoryId: string, taskId: string) => void
  onEditTask: (categoryId: string, task: Task) => void
  dragListeners?: DraggableSyntheticListeners
  dragAttributes?: DraggableAttributes
  isDragging?: boolean
}

export default function TaskCategory({
  category,
  activeTaskId,
  onTaskToggle,
  onSetActiveTask,
  onUpdateCategory,
  onDeleteCategory,
  onAddTask,
  onDeleteTask,
  onEditTask,
  dragListeners,
  dragAttributes,
  isDragging,
}: TaskCategoryProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false)
  const [showCreateEmojiPicker, setShowCreateEmojiPicker] = useState(false)
  const [editDailyGoalInput, setEditDailyGoalInput] = useState<string>("")
  const [createDailyGoalInput, setCreateDailyGoalInput] = useState<string>("10")
  const [isEditGoalFocused, setIsEditGoalFocused] = useState(false)
  const [isCreateGoalFocused, setIsCreateGoalFocused] = useState(false)
  const editGoalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createGoalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editGoalInputRef = useRef<HTMLInputElement | null>(null)
  const createGoalInputRef = useRef<HTMLInputElement | null>(null)
  const [newTask, setNewTask] = useState<Task>({
    id: "",
    name: "",
    emoji: getRandomEmoji(),
    completed: false,
    currentProgress: 0,
    dailyGoal: 10,
    spentTime: 0,
  })
  const editTitleId = editingTask ? `task-edit-title-${editingTask.id}` : undefined
  const editNameId = editingTask ? `task-edit-name-${editingTask.id}` : undefined
  const editGoalId = editingTask ? `task-edit-goal-${editingTask.id}` : undefined
  const editEmojiId = editingTask ? `task-edit-emoji-${editingTask.id}` : undefined
  const createTitleId = `task-create-title-${category.id}`
  const createDescriptionId = `task-create-description-${category.id}`
  const createNameId = `task-create-name-${category.id}`
  const createGoalId = `task-create-goal-${category.id}`
  const createEmojiId = `task-create-emoji-${category.id}`

  const maxStreak = useMemo(() => {
    if (!category.isHabitProject) return 0
    return getMaxStreak(category.tasks ?? [])
  }, [category.tasks, category.isHabitProject])
  const resolvedProjectType =
    category.projectType === "project" || category.projectType === "habit" || category.projectType === "work"
      ? category.projectType
      : category.isHabitProject
        ? "habit"
        : "project"

  const clearEditGoalDebounce = useCallback(() => {
    if (editGoalDebounceRef.current) {
      clearTimeout(editGoalDebounceRef.current)
      editGoalDebounceRef.current = null
    }
  }, [])

  const clearCreateGoalDebounce = useCallback(() => {
    if (createGoalDebounceRef.current) {
      clearTimeout(createGoalDebounceRef.current)
      createGoalDebounceRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearEditGoalDebounce()
      clearCreateGoalDebounce()
    }
  }, [clearEditGoalDebounce, clearCreateGoalDebounce])

  useEffect(() => {
    if (!editingTask || category.isHabitProject || !isEditGoalFocused || !editGoalInputRef.current) return
    if (document.activeElement !== editGoalInputRef.current) {
      editGoalInputRef.current.focus({ preventScroll: true })
    }
  }, [editingTask, category.isHabitProject, isEditGoalFocused])

  useEffect(() => {
    if (!isCreating || category.isHabitProject || !isCreateGoalFocused || !createGoalInputRef.current) return
    if (document.activeElement !== createGoalInputRef.current) {
      createGoalInputRef.current.focus({ preventScroll: true })
    }
  }, [isCreating, category.isHabitProject, isCreateGoalFocused, newTask])

  const sortedTasks = useMemo(() => {
    return [...(category.tasks ?? [])].sort((a, b) => {
      // Primary sort: completed status (active first)
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1
      }
      // Secondary sort for completed tasks: by completedAt (most recent at bottom)
      if (a.completed && b.completed) {
        const aTime = a.completedAt || 0
        const bTime = b.completedAt || 0
        return aTime - bTime
      }
      // Keep original order for active tasks
      return 0
    })
  }, [category.tasks])

  const handleOpenCreateDialog = () => {
    const isHabit = category.isHabitProject
    const defaultDailyGoal = isHabit ? 1 : resolvedProjectType === "work" ? 8 : 10
    clearCreateGoalDebounce()
    setIsCreateGoalFocused(false)
    setShowCreateEmojiPicker(false)
    setNewTask({
      id: crypto.randomUUID(),
      name: "",
      emoji: getRandomEmoji(),
      completed: false,
      currentProgress: 0,
      dailyGoal: defaultDailyGoal,
      spentTime: 0,
    })
    setCreateDailyGoalInput(String(defaultDailyGoal))
    setIsCreating(true)
  }

  const handleSaveNewTask = () => {
    clearCreateGoalDebounce()
    const parsedDailyGoal =
      resolvedProjectType === "work"
        ? Number.parseFloat(createDailyGoalInput) || 1
        : Number.parseInt(createDailyGoalInput, 10) || 1
    const nextTask = { ...newTask, dailyGoal: parsedDailyGoal }
    if (newTask.name.trim()) {
      const normalized = category.isHabitProject
        ? { ...nextTask, dailyGoal: 1, currentProgress: 0, spentTime: 0 }
        : nextTask
      onAddTask(category.id, normalized)
      setIsCreating(false)
      setIsCreateGoalFocused(false)
      setShowCreateEmojiPicker(false)
    }
  }

  return (
    <div
      style={{
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.4)" : "none",
      }}
    >
      <ProjectHeader
        category={category}
        onUpdate={(updatedCategory) => {
          onUpdateCategory(category.id, updatedCategory)
        }}
        onDelete={onDeleteCategory}
        dragListeners={dragListeners}
        dragAttributes={dragAttributes}
      />

      <div className="space-y-0 ml-5 group divide-y divide-neutral-900/40">
        <AnimatePresence mode="popLayout">
          {sortedTasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{
                layout: { type: "spring", stiffness: 500, damping: 40 },
                opacity: { duration: 0.2 },
              }}
            >
              <TaskItem
                task={task}
                isActive={activeTaskId === task.id}
                onToggle={() => onTaskToggle(category.id, task.id)}
                onSetActive={() => onSetActiveTask(task.id)}
                onEdit={() => {
                  clearEditGoalDebounce()
                  setEditingTask(task)
                  setEditDailyGoalInput(String(task.dailyGoal))
                  setIsEditGoalFocused(false)
                  setShowEditEmojiPicker(false)
                  if (!category.isHabitProject) {
                    setTimeout(() => {
                      editGoalInputRef.current?.focus({ preventScroll: true })
                      setIsEditGoalFocused(true)
                    }, 0)
                  }
                }}
                isHabitProject={category.isHabitProject}
                projectType={category.projectType}
                maxStreak={maxStreak}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          onClick={handleOpenCreateDialog}
          className={`text-sm text-neutral-500 hover:text-white transition font-mono ml-6 py-1 ${
            (category.tasks?.length ?? 0) > 0 ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          }`}
        >
          + Add task
        </button>
      </div>

      {/* Edit Task Dialog */}
      {editingTask && (
        <ModalShell
          onClose={() => {
            clearEditGoalDebounce()
            setEditingTask(null)
            setIsEditGoalFocused(false)
            setShowEditEmojiPicker(false)
          }}
          panelClassName="border p-6 max-w-md w-full mx-4 bg-neutral-900 border-neutral-700 shadow-2xl shadow-black/60"
          ariaLabelledby={editTitleId}
        >
            <h3 id={editTitleId} className="text-lg font-semibold mb-4 font-mono">
              {category.isHabitProject ? "Edit Habit Task" : "Edit Task"}
            </h3>

            <div className="space-y-4">
              <div>
                <label htmlFor={editNameId} className="text-sm text-neutral-400 mb-2 block font-mono">
                  {category.isHabitProject ? "Habit Name" : "Task Name"}
                </label>
                <input
                  id={editNameId}
                  name={editNameId}
                  type="text"
                  value={editingTask.name}
                  onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
                  className="w-full border px-3 py-2 text-white font-mono border-neutral-800 bg-transparent"
                />
              </div>

              {!category.isHabitProject && (
                <div>
                  <label htmlFor={editGoalId} className="text-sm text-neutral-400 mb-2 block font-mono">
                    {resolvedProjectType === "work" ? "Daily Goal (hours)" : "Daily Goal (Pomodoros)"}
                  </label>
                  <input
                    ref={editGoalInputRef}
                    id={editGoalId}
                    name={editGoalId}
                    type="number"
                    value={editDailyGoalInput}
                    onFocus={() => setIsEditGoalFocused(true)}
                    onBlur={() => setIsEditGoalFocused(false)}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      setEditDailyGoalInput(inputValue)
                      clearEditGoalDebounce()
                      editGoalDebounceRef.current = setTimeout(() => {
                        setEditingTask((prev) => {
                          if (!prev) return prev
                          return {
                            ...prev,
                            dailyGoal:
                              resolvedProjectType === "work"
                                ? Number.parseFloat(inputValue) || 1
                                : Number.parseInt(inputValue, 10) || 1,
                          }
                        })
                        editGoalDebounceRef.current = null
                      }, 400)
                    }}
                    className="w-full border px-3 py-2 text-white font-mono bg-transparent border-neutral-800"
                    min={resolvedProjectType === "work" ? 0.5 : 1}
                    max={resolvedProjectType === "work" ? 16 : undefined}
                    step={resolvedProjectType === "work" ? 0.5 : 1}
                  />
                </div>
              )}

              {category.isHabitProject && (
                <div className="text-xs font-mono">
                  <span className="text-neutral-400">Current streak: </span>
                  <span className={getStreakColor(editingTask.streak ?? 0, maxStreak)}>
                    {getStreakText(editingTask.streak ?? 0)}
                  </span>
                </div>
              )}

              <div>
                <label htmlFor={editEmojiId} className="text-sm text-neutral-400 mb-2 block font-mono">
                  Emoji
                </label>
                <div className="relative">
                  <div className="flex items-stretch gap-2">
                    <input
                      id={editEmojiId}
                      name={editEmojiId}
                      type="text"
                      value={editingTask.emoji}
                      onChange={(e) => setEditingTask({ ...editingTask, emoji: e.target.value })}
                      className="flex-1 h-10 border px-3 py-2 font-mono text-white bg-transparent border-neutral-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditEmojiPicker((prev) => !prev)}
                      aria-label={`Open emoji picker for editing ${category.isHabitProject ? 'habit' : 'task'} emoji`}
                      className="h-10 border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:text-white transition"
                    >
                      Pick
                    </button>
                  </div>
                  {showEditEmojiPicker && (
                    <div className="absolute left-0 right-0 mt-2 z-10">
                      <EmojiPicker
                        value={editingTask.emoji}
                        onSelect={(emoji) => setEditingTask({ ...editingTask, emoji })}
                        onClose={() => setShowEditEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  clearEditGoalDebounce()
                  const parsedDailyGoal =
                    resolvedProjectType === "work"
                      ? Number.parseFloat(editDailyGoalInput) || 1
                      : Number.parseInt(editDailyGoalInput, 10) || 1
                  const syncedTask = { ...editingTask, dailyGoal: parsedDailyGoal }
                  const nextTask = category.isHabitProject
                    ? { ...syncedTask, dailyGoal: 1, currentProgress: 0 }
                    : syncedTask
                  onEditTask(category.id, nextTask)
                  setEditingTask(null)
                  setIsEditGoalFocused(false)
                  setShowEditEmojiPicker(false)
                }}
                className="flex-1 bg-white text-black px-4 py-2 hover:bg-neutral-200 transition font-mono"
              >
                Save
              </button>
              <button
                onClick={() => {
                  const shouldDelete = window.confirm("Delete this task?")
                  if (!shouldDelete) return
                  clearEditGoalDebounce()
                  onDeleteTask(category.id, editingTask.id)
                  setEditingTask(null)
                  setIsEditGoalFocused(false)
                  setShowEditEmojiPicker(false)
                }}
                className="px-4 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition font-mono"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  clearEditGoalDebounce()
                  setEditingTask(null)
                  setIsEditGoalFocused(false)
                  setShowEditEmojiPicker(false)
                }}
                className="flex-1 text-white px-4 py-2 hover:bg-neutral-700 transition font-mono bg-neutral-800"
              >
                Cancel
              </button>
            </div>
        </ModalShell>
      )}

      {isCreating && (
        <ModalShell
          onClose={() => {
            clearCreateGoalDebounce()
            setIsCreating(false)
            setIsCreateGoalFocused(false)
            setShowCreateEmojiPicker(false)
          }}
          panelClassName="bg-neutral-900 border border-neutral-700 p-6 max-w-md w-full mx-4 shadow-2xl shadow-black/60"
          ariaLabelledby={createTitleId}
          ariaDescribedby={createDescriptionId}
        >
            <h3 id={createTitleId} className="text-lg font-semibold mb-4 font-mono">
              {category.isHabitProject ? "Create Habit Task" : "Create Task"}
            </h3>
            <p id={createDescriptionId} className="text-sm text-neutral-400 mb-4 font-mono">
              Adding to: <span className="text-white">{category.name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor={createNameId} className="text-sm text-neutral-400 mb-2 block font-mono">
                  {category.isHabitProject ? "Habit Name" : "Task Name"}
                </label>
                <input
                  id={createNameId}
                  name={createNameId}
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                  className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 text-white font-mono"
                  placeholder="Enter task name..."
                  autoFocus
                />
              </div>

              {!category.isHabitProject && (
                <div>
                  <label htmlFor={createGoalId} className="text-sm text-neutral-400 mb-2 block font-mono">
                    {resolvedProjectType === "work" ? "Daily Goal (hours)" : "Daily Goal (Pomodoros)"}
                  </label>
                  <input
                    ref={createGoalInputRef}
                    id={createGoalId}
                    name={createGoalId}
                    type="number"
                    value={createDailyGoalInput}
                    onFocus={() => setIsCreateGoalFocused(true)}
                    onBlur={() => setIsCreateGoalFocused(false)}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      setCreateDailyGoalInput(inputValue)
                      clearCreateGoalDebounce()
                      createGoalDebounceRef.current = setTimeout(() => {
                        setNewTask((prev) => ({
                          ...prev,
                          dailyGoal:
                            resolvedProjectType === "work"
                              ? Number.parseFloat(inputValue) || 1
                              : Number.parseInt(inputValue, 10) || 1,
                        }))
                        createGoalDebounceRef.current = null
                      }, 400)
                    }}
                    className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 text-white font-mono"
                    min={resolvedProjectType === "work" ? 0.5 : 1}
                    max={resolvedProjectType === "work" ? 16 : undefined}
                    step={resolvedProjectType === "work" ? 0.5 : 1}
                  />
                </div>
              )}

              <div>
                <label htmlFor={createEmojiId} className="text-sm text-neutral-400 mb-2 block font-mono">
                  Emoji
                </label>
                <div className="relative">
                  <div className="flex items-stretch gap-2">
                    <input
                      id={createEmojiId}
                      name={createEmojiId}
                      type="text"
                      value={newTask.emoji}
                      onChange={(e) => setNewTask({ ...newTask, emoji: e.target.value })}
                      className="flex-1 h-10 bg-neutral-800 border border-neutral-700 px-3 py-2 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateEmojiPicker((prev) => !prev)}
                      aria-label={`Open emoji picker for creating ${category.isHabitProject ? 'habit' : 'task'} emoji`}
                      className="h-10 border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:text-white transition"
                    >
                      Pick
                    </button>
                  </div>
                  {showCreateEmojiPicker && (
                    <div className="absolute left-0 right-0 mt-2 z-10">
                      <EmojiPicker
                        value={newTask.emoji}
                        onSelect={(emoji) => setNewTask({ ...newTask, emoji })}
                        onClose={() => setShowCreateEmojiPicker(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSaveNewTask}
                disabled={!newTask.name.trim()}
                className="flex-1 bg-white text-black px-4 py-2 hover:bg-neutral-200 transition font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                onClick={() => {
                  clearCreateGoalDebounce()
                  setIsCreating(false)
                  setIsCreateGoalFocused(false)
                  setShowCreateEmojiPicker(false)
                }}
                className="flex-1 bg-neutral-800 text-white px-4 py-2 hover:bg-neutral-700 transition font-mono"
              >
                Cancel
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  )
}
