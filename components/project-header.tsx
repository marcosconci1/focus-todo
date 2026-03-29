"use client"

import { useRef, useState } from "react"
import { X, Trash2 } from "lucide-react"
import DragHandle from "@/components/drag-handle"
import ModalShell from "@/components/modal-shell"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/types"

type ProjectType = "project" | "habit" | "work"

interface ProjectHeaderProps {
  category: Category
  onUpdate: (updatedCategory: Category) => void | Promise<void>
  onDelete: () => void
  dragListeners?: any
  dragAttributes?: any
}

const PRESET_COLORS = [
  { name: "Red", value: "#ff6b6b" },
  { name: "Orange", value: "#ff9f43" },
  { name: "Yellow", value: "#feca57" },
  { name: "Forest", value: "#27ae60" },
  { name: "Mint", value: "#1dd1a1" },
  { name: "Green", value: "#48dbfb" },
  { name: "Blue", value: "#0abde3" },
  { name: "Purple", value: "#9b59b6" },
  { name: "Pink", value: "#ff5fa2" },
  { name: "White", value: "#ffffff" },
]

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  project: "Project",
  habit: "Habit",
  work: "Work",
}

const PROJECT_TYPE_DESCRIPTIONS: Record<ProjectType, string> = {
  project: "Standard pomodoro tracking with daily goals",
  habit: "Tasks reset to undone at configured end-of-day cutoff",
  work: "Duration-based tracking in hours/minutes",
}

const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectType; label: string }> = [
  { value: "project", label: "Project (Focus tracking)" },
  { value: "habit", label: "Habit (Daily reset)" },
  { value: "work", label: "Work (Time tracking)" },
]

function getProjectTypeBadgeClass(projectType: ProjectType) {
  if (projectType === "habit") {
    return "border-cyan-700 bg-cyan-900/30 text-cyan-200"
  }
  if (projectType === "work") {
    return "border-violet-700 bg-violet-900/30 text-violet-200"
  }
  return "border-white/20 bg-white/10 text-white"
}

export default function ProjectHeader({
  category,
  onUpdate,
  onDelete,
  dragListeners,
  dragAttributes,
}: ProjectHeaderProps) {
  const titleId = `project-edit-title-${category.id}`
  const nameInputId = `project-edit-name-${category.id}`
  const nameErrorId = `project-edit-name-error-${category.id}`
  const resolvedProjectType: ProjectType =
    category.projectType === "project" || category.projectType === "habit" || category.projectType === "work"
      ? category.projectType
      : category.isHabitProject
        ? "habit"
        : "project"

  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const [projectType, setProjectType] = useState<ProjectType>(resolvedProjectType)
  const [dailyGoalHours, setDailyGoalHours] = useState(category.dailyGoalHours ?? 8)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [showTypeChangeConfirm, setShowTypeChangeConfirm] = useState(false)
  const [pendingProjectType, setPendingProjectType] = useState<ProjectType | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  const handleOpenEdit = () => {
    setName(category.name)
    setColor(category.color)
    setProjectType(resolvedProjectType)
    setDailyGoalHours(category.dailyGoalHours ?? 8)
    setShowDeleteConfirm(false)
    setNameError(null)
    setShowTypeChangeConfirm(false)
    setPendingProjectType(null)
    setIsUpdating(false)
    setIsEditing(true)
  }

  const handleCancelTypeChange = () => {
    setShowTypeChangeConfirm(false)
    setPendingProjectType(null)
    setProjectType(resolvedProjectType)
  }

  const handleConfirmTypeChange = () => {
    if (!pendingProjectType) {
      setShowTypeChangeConfirm(false)
      return
    }
    setProjectType(pendingProjectType)
    setPendingProjectType(null)
    setShowTypeChangeConfirm(false)
  }

  const handleSave = async () => {
    if (showTypeChangeConfirm || isUpdating) {
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name cannot be empty.")
      nameInputRef.current?.focus()
      return
    }

    if (projectType !== "project" && projectType !== "habit" && projectType !== "work") {
      setNameError("Invalid project type selected.")
      return
    }

    const trimmedColor = color.trim()
    const safeColor = trimmedColor ? trimmedColor : category.color

    const updatedCategory: Category = {
      id: category.id,
      name: trimmedName,
      color: safeColor,
      projectType,
      isHabitProject: projectType === "habit",
      ...(projectType === "work" ? { dailyGoalHours } : {}),
      tasks: category.tasks ?? [],
    }

    setIsUpdating(true)
    try {
      await onUpdate(updatedCategory)
      setIsEditing(false)
    } catch (error) {
      console.error("Failed to save project:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = () => {
    onDelete()
    setIsEditing(false)
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4 group">
        <DragHandle listeners={dragListeners} attributes={dragAttributes} />
        <div
          onClick={handleOpenEdit}
          className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition flex-1"
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }}></div>
          <h2 className="text-lg font-semibold font-sans shadow-none underline text-neutral-200">{category.name}</h2>
        </div>
      </div>

      {isEditing && (
        <ModalShell
          onClose={() => !isUpdating && setIsEditing(false)}
          panelClassName="bg-zinc-900 border border-zinc-700 p-6 w-full max-w-md font-mono"
          ariaLabelledby={titleId}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 id={titleId} className="text-lg font-semibold">
              Edit Details
            </h3>
            <button
              onClick={() => !isUpdating && setIsEditing(false)}
              className="text-gray-400 hover:text-white transition"
              disabled={isUpdating}
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-1 text-xs border uppercase tracking-wide ${getProjectTypeBadgeClass(projectType)}`}
                >
                  {PROJECT_TYPE_LABELS[projectType]}
                </span>
                <span className="text-xs text-gray-500">{PROJECT_TYPE_DESCRIPTIONS[projectType]}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Project Type</label>
              <Select
                value={projectType}
                onValueChange={(value) => {
                  if (value !== "project" && value !== "habit" && value !== "work") {
                    return
                  }
                  if (value === resolvedProjectType) {
                    setProjectType(value)
                    setPendingProjectType(null)
                    setShowTypeChangeConfirm(false)
                    return
                  }
                  setPendingProjectType(value)
                  setShowTypeChangeConfirm(true)
                }}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-full border-zinc-700 bg-black text-white focus:ring-0">
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 text-white">
                  {PROJECT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor={nameInputId} className="block text-sm text-gray-400 mb-2">
                {`${PROJECT_TYPE_LABELS[projectType]} Name`}
              </label>
              <input
                id={nameInputId}
                name={nameInputId}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError && e.target.value.trim()) {
                    setNameError(null)
                  }
                }}
                ref={nameInputRef}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? nameErrorId : undefined}
                className={`w-full bg-black border px-3 py-2 text-white focus:outline-none ${
                  nameError ? "border-red-500 focus:border-red-400" : "border-zinc-700 focus:border-white"
                }`}
                placeholder={`Enter ${PROJECT_TYPE_LABELS[projectType].toLowerCase()} name`}
                disabled={isUpdating}
              />
              {nameError && (
                <p id={nameErrorId} role="alert" className="mt-2 text-xs text-red-400">
                  {nameError}
                </p>
              )}
            </div>

            {projectType === "work" && (
              <div>
                <label htmlFor={`${category.id}-daily-goal-hours`} className="block text-sm text-gray-400 mb-2">
                  Daily Goal (hours)
                </label>
                <input
                  id={`${category.id}-daily-goal-hours`}
                  name={`${category.id}-daily-goal-hours`}
                  type="number"
                  min={1}
                  max={16}
                  step={0.5}
                  value={dailyGoalHours}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    if (!Number.isNaN(parsed)) {
                      setDailyGoalHours(Math.min(16, Math.max(1, parsed)))
                    }
                  }}
                  className="w-full bg-black border px-3 py-2 text-white focus:outline-none border-zinc-700 focus:border-white"
                  disabled={isUpdating}
                />
              </div>
            )}

            <div>
              <div className="block text-sm text-gray-400 mb-2">Color</div>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setColor(preset.value)}
                    className={`w-8 h-8 rounded-full border-2 transition ${
                      color === preset.value ? "border-white scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: preset.value }}
                    aria-label={`Select ${preset.name}`}
                    disabled={isUpdating}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={isUpdating || showTypeChangeConfirm}
                className="flex-1 bg-white text-black px-4 py-2 hover:bg-gray-200 transition font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isUpdating ? "Updating..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isUpdating}
                className="px-4 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label={`Delete ${PROJECT_TYPE_LABELS[projectType].toLowerCase()}`}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {showDeleteConfirm && (
              <div className="border border-red-500 p-4 mt-4">
                <p className="text-sm text-red-500 mb-3">
                  {`Delete this ${PROJECT_TYPE_LABELS[projectType].toLowerCase()}? All tasks will be lost.`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    className="flex-1 bg-red-500 text-white px-4 py-2 hover:bg-red-600 transition"
                    disabled={isUpdating}
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 border border-zinc-700 px-4 py-2 hover:bg-zinc-800 transition"
                    disabled={isUpdating}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      <Dialog
        open={showTypeChangeConfirm}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelTypeChange()
          }
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white" showCloseButton={!isUpdating}>
          <DialogHeader>
            <DialogTitle>Confirm Project Type Change</DialogTitle>
            <DialogDescription className="text-zinc-300">
              Change from {PROJECT_TYPE_LABELS[resolvedProjectType]} to{" "}
              {pendingProjectType ? PROJECT_TYPE_LABELS[pendingProjectType] : "selected type"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-amber-300 border border-amber-500/30 bg-amber-950/40 px-3 py-2">
              Resetting progress clears completion status, progress, and tracked time on all tasks in this project.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleCancelTypeChange}
              className="border border-zinc-700 px-4 py-2 hover:bg-zinc-800 transition"
              disabled={isUpdating}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmTypeChange}
              className="bg-white text-black px-4 py-2 hover:bg-gray-200 transition font-semibold"
              disabled={isUpdating}
            >
              Confirm Change
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
