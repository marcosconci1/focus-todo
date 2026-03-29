"use client"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useMemo, useState } from "react"
import TaskCategory from "@/components/task-category"
import ProjectSeparator from "@/components/project-separator"
import type { Category, Task } from "@/lib/types"
import { isValidDragMove } from "@/lib/daily-reset"

interface TaskCategoriesProps {
  categories: Category[]
  activeTaskId: string | null
  onTaskToggle: (categoryId: string, taskId: string) => void
  onSetActiveTask: (taskId: string) => void
  onUpdateCategory: (categoryId: string, updatedCategory: Category) => void | Promise<void>
  onDeleteCategory: (categoryId: string) => void
  onAddTask: (categoryId: string, task: Task) => void
  onDeleteTask: (categoryId: string, taskId: string) => void
  onEditTask: (categoryId: string, task: Task) => void
  isFocusMode: boolean
  onCreateProjectAt: (index: number) => void
  onReorderCategories: (categories: Category[]) => void
}

function SortableProject({
  category,
  activeTaskId,
  onTaskToggle,
  onSetActiveTask,
  onUpdateCategory,
  onDeleteCategory,
  onAddTask,
  onDeleteTask,
  onEditTask,
}: {
  category: Category
  activeTaskId: string | null
  onTaskToggle: (categoryId: string, taskId: string) => void
  onSetActiveTask: (taskId: string) => void
  onUpdateCategory: (categoryId: string, updatedCategory: Category) => void | Promise<void>
  onDeleteCategory: (categoryId: string) => void
  onAddTask: (categoryId: string, task: Task) => void
  onDeleteTask: (categoryId: string, taskId: string) => void
  onEditTask: (categoryId: string, task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCategory
        category={category}
        activeTaskId={activeTaskId}
        onTaskToggle={onTaskToggle}
        onSetActiveTask={onSetActiveTask}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={() => onDeleteCategory(category.id)}
        onAddTask={(catId, task) => onAddTask(catId, task)}
        onDeleteTask={(catId, taskId) => onDeleteTask(catId, taskId)}
        onEditTask={onEditTask}
        dragListeners={listeners}
        dragAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  )
}

export default function TaskCategories({
  categories,
  activeTaskId,
  onTaskToggle,
  onSetActiveTask,
  onUpdateCategory,
  onDeleteCategory,
  onAddTask,
  onDeleteTask,
  onEditTask,
  isFocusMode,
  onCreateProjectAt,
  onReorderCategories,
}: TaskCategoriesProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const orderedCategories = useMemo(() => {
    const habit = categories.filter((category) => category.isHabitProject)
    const rest = categories.filter((category) => !category.isHabitProject)
    return [...habit, ...rest]
  }, [categories])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      if (!isValidDragMove(orderedCategories, active.id as string, over.id as string)) {
        setActiveId(null)
        return // Reject the move
      }

      const oldIndex = orderedCategories.findIndex((cat) => cat.id === active.id)
      const newIndex = orderedCategories.findIndex((cat) => cat.id === over.id)

      const reordered = [...orderedCategories]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)

      onReorderCategories(reordered)
    }

    setActiveId(null)
  }

  const activeCategory = orderedCategories.find((cat) => cat.id === activeId)
  const projectCount = orderedCategories.filter((category) => !category.isHabitProject).length
  const isZeroState = projectCount === 0

  const renderHoverSeparator = (index: number) => (
    <div className="group h-10 flex items-center" onClick={() => onCreateProjectAt(index)}>
      <ProjectSeparator className="opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
    </div>
  )

  if (orderedCategories.length === 0) {
    return (
      <div
        className="space-y-5 transition-all duration-800"
        style={{
          opacity: isFocusMode ? 0 : 1,
          pointerEvents: isFocusMode ? "none" : "auto",
          transform: isFocusMode ? "translateY(20px)" : "translateY(0)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div className="mt-10 flex h-10 items-center justify-center">
          <ProjectSeparator className="opacity-100" onCreateProject={() => onCreateProjectAt(0)} />
        </div>
      </div>
    )
  }
  return (
    <div
      className="space-y-5 transition-all duration-800"
      style={{
        opacity: isFocusMode ? 0 : 1,
        pointerEvents: isFocusMode ? "none" : "auto",
        transform: isFocusMode ? "translateY(20px)" : "translateY(0)",
        transition: "opacity 0.8s ease, transform 0.8s ease",
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedCategories.map((cat) => cat.id)} strategy={verticalListSortingStrategy}>
          {orderedCategories.map((category, index) => (
            <div key={category.id ?? `category-${index}`}>
              <SortableProject
                category={category}
                activeTaskId={activeTaskId}
                onTaskToggle={onTaskToggle}
                onSetActiveTask={onSetActiveTask}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={() => onDeleteCategory(category.id)}
                onAddTask={onAddTask}
                onDeleteTask={onDeleteTask}
                onEditTask={onEditTask}
              />

              {!isZeroState && index < orderedCategories.length - 1 && (
                <>
                  {renderHoverSeparator(index + 1)}
                </>
              )}

              {index === orderedCategories.length - 1 && (
                <>
                  {isZeroState ? (
                    <div className="mt-6 flex h-10 items-center justify-center">
                      <ProjectSeparator className="opacity-100" onCreateProject={() => onCreateProjectAt(orderedCategories.length)} />
                    </div>
                  ) : (
                    renderHoverSeparator(orderedCategories.length)
                  )}
                </>
              )}
            </div>
          ))}
        </SortableContext>

        <DragOverlay>
          {activeCategory ? (
            <div className="opacity-90">
              <TaskCategory
                category={activeCategory}
                activeTaskId={activeTaskId}
                onTaskToggle={onTaskToggle}
                onSetActiveTask={onSetActiveTask}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={() => onDeleteCategory(activeCategory.id)}
                onAddTask={(catId, task) => onAddTask(catId, task)}
                onDeleteTask={(catId, taskId) => onDeleteTask(catId, taskId)}
                onEditTask={onEditTask}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
