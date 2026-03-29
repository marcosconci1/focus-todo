import type { AlertTemplate, ScreamModeInsult } from "@/lib/alert-types"
import type { Category, Task } from "@/lib/types"

export interface CategoryRow {
  id: string
  name: string
  color: string
  daily_goal_hours: number | null
  project_type: "project" | "habit" | "work" | null
  is_habit_project: number | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface TaskRow {
  id: string
  category_id: string
  name: string
  completed: number
  daily_goal: number
  current_progress: number
  spent_time: number | null
  icon: string | null
  emoji: string | null
  completed_at: number | null
  streak: number | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface HistoryRow {
  id: number
  task_id: string
  completed_at: number
  start_time: number | null
  duration: number | null
  overtime_duration: number | null
  calendar_event_id: string | null
  created_at: string
}

export interface SettingsRow {
  id: number
  data: string
  created_at: string
  updated_at: string
}

export interface AlertTemplateRow {
  id: string
  type: string
  title: string
  message: string
  tone: string
  enabled: number
  author_id: string
  created_at: string
  updated_at: string
}

export interface AlertTrackingRow {
  id: number
  data: string
  created_at: string
  updated_at: string
}

export interface MetadataRow {
  id: number
  last_reset_date: string | null
  overtime_session_state: string | null
  pending_calendar_updates: string | null
  version: string
  created_at: string
  updated_at: string
}

export interface GoogleCalendarTokensRow {
  id: number
  access_token: string | null
  refresh_token: string | null
  expiry_date: number | null
  token_type: string | null
  scope: string | null
  user_email: string | null
  connected_at: string | null
  last_refreshed: string | null
  updated_at: string
}

export interface ScreamModeInsultRow {
  id: string
  title: string
  message: string
  punchline: string | null
  enabled: number
  created_at: string
  updated_at: string
}

const booleanToInt = (value: boolean): number => (value ? 1 : 0)
const nullableBooleanToInt = (value: boolean | undefined): number | null =>
  value === undefined ? null : value ? 1 : 0

export function categoryRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    tasks: [],
    dailyGoalHours: row.daily_goal_hours ?? undefined,
    projectType: row.project_type ?? undefined,
    isHabitProject: row.is_habit_project === null ? undefined : row.is_habit_project === 1,
  }
}

export function taskRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    completed: row.completed === 1,
    dailyGoal: row.daily_goal,
    currentProgress: row.current_progress,
    spentTime: row.spent_time ?? undefined,
    icon: row.icon ?? undefined,
    emoji: row.emoji || "📝",
    completedAt: row.completed_at ?? undefined,
    streak: row.streak ?? undefined,
  }
}

export function categoryToRow(category: Category): Partial<CategoryRow> {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    daily_goal_hours: category.dailyGoalHours ?? null,
    project_type: category.projectType ?? null,
    is_habit_project: nullableBooleanToInt(category.isHabitProject),
  }
}

export function taskToRow(task: Task): Partial<TaskRow> {
  return {
    id: task.id,
    name: task.name,
    completed: booleanToInt(task.completed),
    daily_goal: task.dailyGoal,
    current_progress: task.currentProgress,
    spent_time: task.spentTime ?? null,
    icon: task.icon ?? null,
    emoji: task.emoji,
    completed_at: task.completedAt ?? null,
    streak: task.streak ?? null,
  }
}

export interface Metadata {
  id: number
  lastResetDate: string | null
  overtimeSessionState: string | null
  pendingCalendarUpdates: string | null
  version: string
  createdAt: string
  updatedAt: string
}

export function alertTemplateRowToAlertTemplate(row: AlertTemplateRow): AlertTemplate {
  return {
    id: row.id,
    type: row.type as AlertTemplate["type"],
    title: row.title,
    message: row.message,
    tone: row.tone as AlertTemplate["tone"],
    enabled: row.enabled === 1,
    authorId: row.author_id,
  }
}

export function alertTemplateToRow(template: AlertTemplate): Partial<AlertTemplateRow> {
  return {
    id: template.id,
    type: template.type,
    title: template.title,
    message: template.message,
    tone: template.tone,
    enabled: booleanToInt(template.enabled),
    author_id: template.authorId,
  }
}

export function metadataRowToMetadata(row: MetadataRow): Metadata {
  return {
    id: row.id,
    lastResetDate: row.last_reset_date,
    overtimeSessionState: row.overtime_session_state ?? null,
    pendingCalendarUpdates: row.pending_calendar_updates ?? null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function screamModeInsultRowToScreamModeInsult(
  row: ScreamModeInsultRow,
): ScreamModeInsult {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    punchline: row.punchline ?? undefined,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  }
}

export function screamModeInsultToRow(
  insult: ScreamModeInsult,
): Partial<ScreamModeInsultRow> {
  return {
    id: insult.id,
    title: insult.title,
    message: insult.message,
    punchline: insult.punchline ?? null,
    enabled: booleanToInt(insult.enabled),
  }
}
