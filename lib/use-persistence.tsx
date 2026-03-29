"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import type { Category, Task } from "@/lib/types"
import type { Database } from "@/lib/storage"
import type { AlertTemplate } from "@/lib/alert-types"
import { classifySqliteError } from "@/lib/db/error-classifier"
import { computeBackoffMs, getCircuitBreakerUntil, shouldOpenCircuitBreaker } from "@/lib/db/retry-utils"
import {
  DEFAULT_ADRIAN_AUTHOR,
  DEFAULT_ALERT_TEMPLATES,
  DEFAULT_ALERT_TRACKING,
  DEFAULT_ROCKY_AUTHOR,
} from "@/lib/alert-types"
import { generateRealityCheckTemplates, loadRealityCheckMessages } from "@/lib/reality-checks"
import { normalizeCategory } from "@/lib/validation/category-validation"
import { PersistenceError } from "@/lib/errors/persistence-error"

const DEBOUNCE_MS = 500
const MAX_RETRIES = 3
const MAX_RETRY_WINDOW_MS = 30000
const LOAD_MAX_RETRIES = 3
const LOAD_CIRCUIT_BREAK_COUNT = 5
const LOAD_CIRCUIT_BREAK_MS = 60000

type SaveOptions = {
  onRollback?: (data: Database) => void
}

type LoadResult = {
  data: Database
  wasExternalChange: boolean
}

const ensureString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback

const ensureNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const ensureBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

const parseErrorPayload = async (response: Response) => {
  let details = ""
  let reason = ""
  let code: string | null = null
  let retryable: boolean | null = null
  let requestId: string | null = null

  try {
    const payload = (await response.clone().json()) as {
      error?: unknown
      details?: unknown
      reason?: unknown
      code?: unknown
      retryable?: unknown
      requestId?: unknown
    }
    if (payload && typeof payload === "object") {
      if ("details" in payload && payload.details !== undefined) {
        details = String(payload.details)
      } else if ("error" in payload && payload.error !== undefined) {
        details = String(payload.error)
      }
      if ("reason" in payload && payload.reason !== undefined) {
        reason = String(payload.reason)
      }
      if ("code" in payload && payload.code !== undefined) {
        code = payload.code ? String(payload.code) : null
      }
      if ("retryable" in payload && payload.retryable !== undefined) {
        retryable = Boolean(payload.retryable)
      }
      if ("requestId" in payload && payload.requestId !== undefined) {
        requestId = payload.requestId ? String(payload.requestId) : null
      }
    }
  } catch (error) {
    // Ignore JSON parse errors and fall back to text.
  }
  if (!details) {
    try {
      const text = await response.text()
      details = text.trim()
    } catch (error) {
      // Ignore text parse errors.
    }
  }

  return { details, reason, code, retryable, requestId }
}

const buildErrorMessage = (
  status: number,
  details: string,
  reason: string,
  code: string | null,
  retryable: boolean | null,
) => {
  const suffix = `${details ? ` - ${details}` : ""}${reason ? ` (reason: ${reason})` : ""}`
  const codeInfo = code ? ` [${code}]` : ""
  const retryInfo = retryable === null ? "" : retryable ? " (retryable)" : " (not retryable)"
  return `Save failed: ${status}${suffix}${codeInfo}${retryInfo}`
}

const validateDatabasePayload = (data: Database): string | null => {
  if (!data || !Array.isArray(data.categories)) {
    return "Invalid database payload"
  }
  for (const category of data.categories) {
    if (
      !category ||
      typeof category.id !== "string" ||
      typeof category.name !== "string" ||
      typeof category.color !== "string" ||
      !Array.isArray(category.tasks)
    ) {
      return "Invalid category payload"
    }
    for (const task of category.tasks) {
      if (
        !task ||
        typeof task.id !== "string" ||
        typeof task.name !== "string" ||
        typeof task.completed !== "boolean" ||
        typeof task.dailyGoal !== "number" ||
        typeof task.currentProgress !== "number" ||
        typeof task.emoji !== "string"
      ) {
        return "Invalid task payload"
      }
    }
  }

  if (!Array.isArray(data.alertTemplates)) {
    return "Invalid alert templates payload"
  }
  for (const template of data.alertTemplates) {
    if (
      !template ||
      typeof template.id !== "string" ||
      typeof template.type !== "string" ||
      typeof template.title !== "string" ||
      typeof template.message !== "string" ||
      typeof template.tone !== "string" ||
      typeof template.enabled !== "boolean" ||
      typeof template.authorId !== "string"
    ) {
      return "Invalid alert template payload"
    }
  }

  if (!data.alertTracking || typeof data.alertTracking !== "object") {
    return "Invalid alert tracking payload"
  }

  return null
}

const normalizeDatabase = (raw: Partial<Database> | null | undefined): Database => {
  const safeRaw = raw ?? {}
  const rawUserSettings =
    typeof safeRaw.userSettings === "object" && safeRaw.userSettings !== null ? safeRaw.userSettings : {}
  const categories = Array.isArray(safeRaw.categories) ? safeRaw.categories : []
  const history = Array.isArray(safeRaw.history) ? safeRaw.history : []
  const metadata =
    typeof safeRaw.metadata === "object" && safeRaw.metadata !== null ? safeRaw.metadata : {}
  const versionValue =
    typeof metadata.version === "string"
      ? metadata.version
      : typeof metadata.version === "number"
        ? String(metadata.version)
        : "1"
  const rawAuthors = Array.isArray(rawUserSettings?.authors)
    ? rawUserSettings.authors
    : [DEFAULT_ROCKY_AUTHOR, DEFAULT_ADRIAN_AUTHOR]
  const authors = rawAuthors.some((author) => author.id === "author-adrian")
    ? rawAuthors
    : [...rawAuthors, DEFAULT_ADRIAN_AUTHOR]
  const rawTemplates = Array.isArray(safeRaw.alertTemplates) ? safeRaw.alertTemplates : []
  const templatesById = new Map<string, AlertTemplate>()
  for (const template of rawTemplates) {
    if (template && typeof template.id === "string") {
      templatesById.set(template.id, template as AlertTemplate)
    }
  }
  const defaultTemplateIds = new Set(DEFAULT_ALERT_TEMPLATES.map((template) => template.id))
  const mergedDefaults = DEFAULT_ALERT_TEMPLATES.map((template) => {
    const override = templatesById.get(template.id)
    const nextAuthorId =
      override && typeof override.authorId === "string" && override.authorId.trim().length > 0
        ? override.authorId
        : template.authorId || "author-rocky"
    return {
      ...template,
      ...override,
      authorId: nextAuthorId,
    }
  })
  const extraTemplates = rawTemplates
    .filter((template) => template && typeof template.id === "string" && !defaultTemplateIds.has(template.id))
    .map((template) => {
      const typedTemplate = template as AlertTemplate
      const nextAuthorId =
        typeof typedTemplate.authorId === "string" && typedTemplate.authorId.trim().length > 0
          ? typedTemplate.authorId
          : "author-rocky"
      return {
        ...typedTemplate,
        authorId: nextAuthorId,
      }
    })
  const alertTemplates = rawTemplates.length > 0 ? [...mergedDefaults, ...extraTemplates] : DEFAULT_ALERT_TEMPLATES
  const pendingCalendarUpdates = Array.isArray(safeRaw.pendingCalendarUpdates)
    ? safeRaw.pendingCalendarUpdates.filter(
        (entry) =>
          entry &&
          typeof entry.eventId === "string" &&
          typeof entry.startTime === "string" &&
          typeof entry.durationMinutes === "number" &&
          Number.isFinite(entry.durationMinutes) &&
          typeof entry.description === "string" &&
          typeof entry.retryCount === "number" &&
          Number.isFinite(entry.retryCount) &&
          typeof entry.lastAttempt === "number" &&
          Number.isFinite(entry.lastAttempt),
      )
    : []

  return {
    userSettings: {
      ...rawUserSettings,
      authors,
    },
    categories: categories.map((category, index) => normalizeCategory(category, index)),
    history: history.map((item) => ({
      taskId: ensureString(item?.taskId, `history-${Date.now()}`),
      completedAt: ensureNumber(item?.completedAt, Date.now()),
      duration: typeof item?.duration === "number" ? item.duration : undefined,
    })),
    pendingCalendarUpdates,
    alertTemplates,
    alertTracking:
      typeof safeRaw.alertTracking === "object" && safeRaw.alertTracking !== null
        ? (safeRaw.alertTracking as Database["alertTracking"])
        : DEFAULT_ALERT_TRACKING,
    metadata: {
      ...metadata,
      version: versionValue,
    },
  }
}

const incrementVersion = (version?: string) => {
  const base = Number.parseInt(version ?? "0", 10)
  if (Number.isNaN(base)) {
    return "1"
  }
  return String(base + 1)
}

const resolveVersionBase = (localVersion?: string | null, lastKnownVersion?: string | null) => {
  const local = Number.parseInt(localVersion ?? "0", 10)
  const known = Number.parseInt(lastKnownVersion ?? "0", 10)

  if (Number.isNaN(local) && Number.isNaN(known)) {
    return "0"
  }
  if (Number.isNaN(local)) {
    return String(known)
  }
  if (Number.isNaN(known)) {
    return String(local)
  }
  return String(Math.max(local, known))
}

export function usePersistence() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null)
  const [isStale, setIsStale] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuedDataRef = useRef<Database | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const saveAbortRef = useRef<AbortController | null>(null)
  const saveAbortReasonRef = useRef<"superseded" | "unmount" | "unknown">("unknown")
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const lastGoodDataRef = useRef<Database | null>(null)
  const lastAttemptRef = useRef<Database | null>(null)
  const lastKnownVersionRef = useRef<string | null>(null)
  const loadFailureCountRef = useRef(0)
  const loadBlockedUntilRef = useRef<number | null>(null)
  const isUnmountedRef = useRef(false)

  const clearDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true
      clearDebounce()
      loadAbortRef.current?.abort()
      saveAbortReasonRef.current = "unmount"
      saveAbortRef.current?.abort()
    }
  }, [clearDebounce])

  const enqueue = useCallback((request: () => Promise<void>) => {
    queueRef.current = queueRef.current
      .then(request)
      .catch(() => request())
    return queueRef.current
  }, [])

  const notifySaveFailure = useCallback(
    (message: string, retry: () => void, restore: (() => void) | null, details?: string) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: message,
        action: (
          <ToastAction altText="Retry" onClick={retry}>
            Retry
          </ToastAction>
        ),
      })

      if (restore) {
        toast({
          variant: "destructive",
          title: "Restore backup",
          description: "Restore the last known good state.",
          action: (
            <ToastAction altText="Restore" onClick={restore}>
              Restore
            </ToastAction>
          ),
        })
      }

      if (details) {
        toast({
          variant: "destructive",
          title: "View details",
          description: "Tap to view the full error context.",
          action: (
            <ToastAction
              altText="Details"
              onClick={() => {
                toast({
                  title: "Save error details",
                  description: details,
                })
              }}
            >
              Details
            </ToastAction>
          ),
        })
      }
    },
    [],
  )

  const initializeDb = useCallback(async () => {
    const response = await fetch("/api/db", { method: "GET", cache: "no-store" })
    if (!response.ok) {
      const { details, reason, code, retryable } = await parseErrorPayload(response)
      throw new Error(buildErrorMessage(response.status, details, reason, code, retryable))
    }
  }, [])

  const performSave = useCallback(
    async (data: Database, options?: SaveOptions) => {
      saveAbortReasonRef.current = "superseded"
      saveAbortRef.current?.abort()
      const controller = new AbortController()
      saveAbortRef.current = controller

      const versionBase = resolveVersionBase(data.metadata?.version, lastKnownVersionRef.current)
      const dataToSave: Database = {
        ...data,
        metadata: {
          ...data.metadata,
          version: incrementVersion(versionBase),
        },
      }

      const validationError = validateDatabasePayload(dataToSave)
      if (validationError) {
        throw new Error(`Save failed: ${validationError}`)
      }

      const body = JSON.stringify(dataToSave)
      if (!body.trim()) {
        throw new Error("Save failed: empty payload")
      }

      lastAttemptRef.current = dataToSave
      setIsSaving(true)
      setError(null)

      const startTime = Date.now()
      let attempt = 0
      let schemaRecoveryAttempted = false
      while (attempt < MAX_RETRIES) {
        try {
          const response = await fetch("/api/db", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          })

          if (!response.ok) {
            const { details, reason, code, retryable, requestId } = await parseErrorPayload(response)
            throw new PersistenceError(
              buildErrorMessage(response.status, details, reason, code, retryable),
              reason || undefined,
              code ?? undefined,
              retryable ?? undefined,
              requestId ?? undefined,
            )
          }

          lastGoodDataRef.current = dataToSave
          lastKnownVersionRef.current = dataToSave.metadata?.version ?? null
          setError(null)
          setIsSaving(false)
          return
        } catch (saveError) {
          if (controller.signal.aborted || isUnmountedRef.current) {
            setIsSaving(false)
            const shouldRollback = saveAbortReasonRef.current !== "superseded"
            if (options?.onRollback && shouldRollback) {
              options.onRollback(lastGoodDataRef.current ?? dataToSave)
            }
            return
          }

          attempt += 1
          const classification = classifySqliteError(saveError)
          const errorCode = (saveError instanceof PersistenceError ? saveError.code : null) ?? classification.code
          const errorReason = (saveError instanceof PersistenceError ? saveError.reason ?? "" : "").toLowerCase()
          const retryable =
            (saveError instanceof PersistenceError ? saveError.retryable : null) ?? classification.retryable

          if (!schemaRecoveryAttempted && errorCode === "SQLITE_ERROR" && errorReason === "schema") {
            schemaRecoveryAttempted = true
            try {
              await initializeDb()
              continue
            } catch (initializeError) {
              console.error("Failed to self-heal database schema before retrying save:", initializeError)
            }
          }

          const elapsed = Date.now() - startTime
          if (!retryable || attempt >= MAX_RETRIES || elapsed > MAX_RETRY_WINDOW_MS) {
            setIsSaving(false)
            console.error("Failed to save database:", saveError)
            const message = saveError instanceof Error ? saveError.message : "Unknown error"
            setError(message)
            if (options?.onRollback) {
              options.onRollback(lastGoodDataRef.current ?? dataToSave)
            }
            const retry = () => {
              if (lastAttemptRef.current) {
                enqueue(() => performSave(lastAttemptRef.current as Database, options))
              }
            }
            const restore =
              options?.onRollback && lastGoodDataRef.current ? () => options.onRollback!(lastGoodDataRef.current!) : null
            const details = JSON.stringify(
              {
                code: errorCode,
                category: classification.category,
                retryable,
                requestId: (saveError instanceof PersistenceError ? saveError.requestId : null) ?? null,
              },
              null,
              2,
            )
            notifySaveFailure(message, retry, restore, details)
            return
          }
          const backoffMs = computeBackoffMs(500, attempt, 1000)
          console.info(`Retrying save in ${Math.round(backoffMs)}ms (attempt ${attempt}/${MAX_RETRIES})`, {
            code: errorCode,
          })
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
      }
    },
    [enqueue, initializeDb, notifySaveFailure],
  )

  const saveDataImmediate = useCallback(
    (data: Database, options?: SaveOptions) => {
      clearDebounce()
      queuedDataRef.current = null
      return enqueue(() => performSave(data, options))
    },
    [clearDebounce, enqueue, performSave],
  )

  const queuedOptionsRef = useRef<SaveOptions | undefined>(undefined)

  const saveData = useCallback(
    (data: Database, options?: SaveOptions) => {
      queuedDataRef.current = data
      queuedOptionsRef.current = options
      clearDebounce()
      debounceRef.current = setTimeout(() => {
        if (queuedDataRef.current) {
          saveDataImmediate(queuedDataRef.current, queuedOptionsRef.current)
          queuedDataRef.current = null
          queuedOptionsRef.current = undefined
        }
      }, DEBOUNCE_MS)
    },
    [clearDebounce, saveDataImmediate],
  )

  const loadData = useCallback(async (): Promise<LoadResult> => {
    setIsLoading(true)
    setError(null)
    setIsOffline(false)
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller

    const blockedUntil = loadBlockedUntilRef.current
    if (blockedUntil && Date.now() < blockedUntil) {
      const message = "Load paused after repeated failures. Try again shortly."
      setError(message)
      setIsLoading(false)
      throw new Error(message)
    }

    const startTime = Date.now()
    let attempt = 0

    while (attempt < LOAD_MAX_RETRIES) {
      try {
        const response = await fetch("/api/db", { signal: controller.signal })
        if (!response.ok) {
          const { details, reason, code, retryable, requestId } = await parseErrorPayload(response)
          const suffix = `${details ? ` - ${details}` : ""}${reason ? ` (reason: ${reason})` : ""}`
          const codeInfo = code ? ` [${code}]` : ""
          const retryInfo = retryable === null ? "" : retryable ? " (retryable)" : " (not retryable)"
          throw new PersistenceError(
            `Load failed: ${response.status}${suffix}${codeInfo}${retryInfo}`,
            reason || undefined,
            code ?? undefined,
            retryable ?? undefined,
            requestId ?? undefined,
          )
        }

        const raw = (await response.json()) as Database
        let normalized = normalizeDatabase(raw)
        const messageSource = Array.isArray(raw.alertTemplates) ? raw.alertTemplates : normalized.alertTemplates
        let realityMessages: string[]
        try {
          realityMessages = await loadRealityCheckMessages()
        } catch (error) {
          console.error("Failed to load reality check messages:", error)
          realityMessages = []
        }
        const realityTemplates = generateRealityCheckTemplates(realityMessages, messageSource)
        const generatedIds = new Set(realityTemplates.map((template) => template.id))
        const extraRealityTemplates = messageSource
          .filter(
            (template) =>
              template &&
              template.type === "REALITY_CHECKS" &&
              typeof template.id === "string" &&
              !generatedIds.has(template.id),
          )
          .map((template) => {
            const typedTemplate = template as AlertTemplate
            const authorId =
              typeof typedTemplate.authorId === "string" && typedTemplate.authorId.trim().length > 0
                ? typedTemplate.authorId
                : "author-adrian"
            return {
              ...typedTemplate,
              authorId,
            }
          })
        const baseTemplates = normalized.alertTemplates.filter((template) => template.type !== "REALITY_CHECKS")
        normalized = {
          ...normalized,
          alertTemplates: [...baseTemplates, ...realityTemplates, ...extraRealityTemplates],
        }
        const incomingVersion = normalized.metadata?.version ?? null
        const wasExternalChange =
          lastKnownVersionRef.current !== null &&
          incomingVersion !== null &&
          incomingVersion !== lastKnownVersionRef.current

        lastGoodDataRef.current = normalized
        lastKnownVersionRef.current = incomingVersion
        loadFailureCountRef.current = 0
        loadBlockedUntilRef.current = null
        setIsStale(false)
        setLastLoadedAt(Date.now())

        if (wasExternalChange) {
          toast({
            title: "Data updated elsewhere",
            description: "The database changed outside this session.",
          })
        }

        setIsLoading(false)
        return { data: normalized, wasExternalChange }
      } catch (loadError) {
        if (controller.signal.aborted || isUnmountedRef.current) {
          setIsLoading(false)
          return {
            data: normalizeDatabase({ userSettings: {}, categories: [], history: [], metadata: {} }),
            wasExternalChange: false,
          }
        }

        if (loadError instanceof TypeError && typeof navigator !== "undefined" && !navigator.onLine) {
          setIsOffline(true)
          const message = "Offline - showing last saved data."
          setError(message)
          setIsLoading(false)
          setIsStale(true)
          if (lastGoodDataRef.current) {
            return { data: lastGoodDataRef.current, wasExternalChange: false }
          }
          throw loadError
        }

        attempt += 1
        loadFailureCountRef.current += 1
        if (shouldOpenCircuitBreaker(loadFailureCountRef.current, LOAD_CIRCUIT_BREAK_COUNT)) {
          loadBlockedUntilRef.current = getCircuitBreakerUntil(Date.now(), LOAD_CIRCUIT_BREAK_MS)
        }

        const classification = classifySqliteError(loadError)
        const retryable =
          (loadError instanceof PersistenceError ? loadError.retryable : null) ?? classification.retryable
        const elapsed = Date.now() - startTime

        if (!retryable || attempt >= LOAD_MAX_RETRIES || elapsed > MAX_RETRY_WINDOW_MS) {
          console.error("Failed to load database:", loadError)
          const message = loadError instanceof Error ? loadError.message : "Unknown error"
          setError(message)
          setIsLoading(false)
          setIsStale(Boolean(lastGoodDataRef.current))
          throw loadError
        }

        const backoffMs = computeBackoffMs(500, attempt, 1000)
        console.info(`Retrying load in ${Math.round(backoffMs)}ms (attempt ${attempt}/${LOAD_MAX_RETRIES})`, {
          code: (loadError instanceof PersistenceError ? loadError.code : null) ?? classification.code,
        })
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
    throw new Error("Load failed: retry loop exited unexpectedly")
  }, [])

  return {
    loadData,
    saveData,
    saveDataImmediate,
    isLoading,
    isSaving,
    error,
    lastLoadedAt,
    isStale,
    isOffline,
  }
}
