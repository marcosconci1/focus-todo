"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ModalShell from "@/components/modal-shell"
import type { ScreamModeInsult } from "@/lib/alert-types"

type ScreamModeEditorProps = {
  onClose: () => void
}

type ParsedInsult = {
  id: string
  title: string
  message: string
  punchline?: string
  enabled: boolean
}

export default function ScreamModeEditor({ onClose }: ScreamModeEditorProps) {
  const [rawText, setRawText] = useState("")
  const [previewInsults, setPreviewInsults] = useState<ParsedInsult[]>([])
  const [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const isMountedRef = useRef(true)
  const enabledMapRef = useRef<Map<string, boolean>>(new Map())
  const idMapRef = useRef<Map<string, string>>(new Map())

  const buildKey = useCallback((title: string, message: string, punchline?: string) => {
    return JSON.stringify([title, message, punchline ?? ""])
  }, [])

  const generateId = useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `scream-insult-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  const validateInsult = useCallback(
    (insult: ParsedInsult, lineNumber: number): string | null => {
      const titleLength = insult.title.length
      const messageLength = insult.message.length
      const punchlineLength = insult.punchline ? insult.punchline.length : 0

      if (titleLength < 3) {
        return `Line ${lineNumber}: Title must be at least 3 characters.`
      }
      if (titleLength > 100) {
        return `Line ${lineNumber}: Title must be 100 characters or fewer.`
      }
      if (messageLength < 10) {
        return `Line ${lineNumber}: Message must be at least 10 characters.`
      }
      if (messageLength > 500) {
        return `Line ${lineNumber}: Message must be 500 characters or fewer.`
      }
      if (punchlineLength > 200) {
        return `Line ${lineNumber}: Punchline must be 200 characters or fewer.`
      }
      return null
    },
    [],
  )

  const parseInsults = useCallback(
    (text: string) => {
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      const parsed: ParsedInsult[] = []
      let errorMessage = ""
      const warningMessages: string[] = []

      lines.forEach((line, index) => {
        let cleaned = line
        if (cleaned.endsWith(",")) {
          cleaned = cleaned.slice(0, -1).trim()
        }
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"")) {
          cleaned = cleaned.slice(1, -1)
        }
        const parts = cleaned.split("|").map((part) => part.trim())
        if (parts.length < 2) {
          if (!errorMessage) {
            errorMessage = `Line ${index + 1}: Format must be Title | Message | Punchline (punchline optional).`
          }
          return
        }
        const title = parts[0] ?? ""
        const message = parts[1] ?? ""
        const punchline = parts.length > 2 ? parts.slice(2).join(" | ").trim() : ""
        const key = buildKey(title, message, punchline)
        const enabled = enabledMapRef.current.get(key) ?? true
        const id = idMapRef.current.get(key) ?? generateId()
        idMapRef.current.set(key, id)

        const candidate: ParsedInsult = {
          id,
          title,
          message,
          punchline: punchline.length > 0 ? punchline : undefined,
          enabled,
        }

        const validationError = validateInsult(candidate, index + 1)
        if (validationError) {
          if (!errorMessage) {
            errorMessage = validationError
          }
          return
        }

        const content = [candidate.title, candidate.message, candidate.punchline ?? ""].join(" ")
        const keywordPattern = /\b(app|opened|notification|inbox|email|browser|tab|ping)\b/i
        if (keywordPattern.test(content)) {
          warningMessages.push(
            `Line ${index + 1}: Avoid app/tech references (app, opened, notification, inbox, email, browser, tab, ping).`,
          )
        }

        parsed.push(candidate)
      })

      if (parsed.length === 0) {
        errorMessage = errorMessage || "No valid messages found"
      }

      setPreviewInsults(parsed)
      setError(errorMessage)
      setWarnings(warningMessages)
    },
    [buildKey, generateId, validateInsult],
  )

  useEffect(() => {
    isMountedRef.current = true
    fetch("/api/scream-mode-insults", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load insults: ${response.status}`)
        }
        const data = (await response.json()) as { insults?: ScreamModeInsult[] }
        return data.insults ?? []
      })
      .then((insults) => {
        if (!isMountedRef.current) return
        const formatted = insults
          .map((insult) => {
            const punchline = insult.punchline ? ` | ${insult.punchline}` : ""
            const key = buildKey(insult.title, insult.message, insult.punchline)
            enabledMapRef.current.set(key, insult.enabled)
            idMapRef.current.set(key, insult.id)
            return `${insult.title} | ${insult.message}${punchline}`
          })
          .join("\n")
        setRawText(formatted)
      })
      .catch((loadError) => {
        console.error("Failed to load scream mode messages:", loadError)
        if (!isMountedRef.current) return
        setError("Failed to load messages")
      })

    return () => {
      isMountedRef.current = false
    }
  }, [buildKey])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isMountedRef.current) return
      parseInsults(rawText)
    }, 300)
    return () => clearTimeout(timeout)
  }, [parseInsults, rawText])

  const handleSave = async () => {
    if (isSaving || error || previewInsults.length === 0) {
      setError(error || "No valid messages found")
      return
    }

    try {
      setIsSaving(true)
      const createdAt = new Date().toISOString()
      const payload = previewInsults.map((insult) => ({
        id: insult.id,
        title: insult.title,
        message: insult.message,
        punchline: insult.punchline,
        enabled: insult.enabled,
        createdAt,
      }))
      const response = await fetch("/api/scream-mode-insults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insults: payload }),
      })
      if (!response.ok) {
        throw new Error(`Failed to save insults: ${response.status}`)
      }

      if (!isMountedRef.current) return
      onClose()
    } catch (saveError) {
      console.error("Failed to save scream mode messages:", saveError)
      if (!isMountedRef.current) return
      setError("Failed to save messages")
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false)
      }
    }
  }

  const previewSample = previewInsults.slice(0, 5)

  return (
    <ModalShell onClose={onClose} panelClassName="bg-neutral-950 border border-neutral-700 p-6 w-full max-w-3xl">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Scream Mode Messages</h3>

        <div className="space-y-2">
          <label
            htmlFor="scream-mode-messages"
            className="text-xs uppercase tracking-[0.25em] text-neutral-500"
          >
            Messages (one per line)
          </label>
          <textarea
            id="scream-mode-messages"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            className="w-full h-64 bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-300 focus:border-neutral-400 focus:outline-none font-mono"
            spellCheck={false}
          />
          {error ? (
            <div className="text-xs text-red-400">{error}</div>
          ) : (
            <div className="text-xs text-emerald-400">✓ {previewInsults.length} messages found</div>
          )}
          {warnings.length > 0 && (
            <div className="text-xs text-amber-400 space-y-1">
              {warnings.slice(0, 3).map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
              {warnings.length > 3 ? <div>...and {warnings.length - 3} more</div> : null}
            </div>
          )}
        </div>

        <div className="text-xs text-neutral-500 space-y-1">
          <div>Format: Title | Message | Punchline (punchline optional)</div>
          <div>
            Example: Focus Who? | Focus called. You sent it to voicemail. | Again.
          </div>
          <div>Quotes and trailing commas are optional. Empty lines are ignored.</div>
          <div>Focus messages on: inactivity, procrastination, and lack of timer usage.</div>
          <div>Avoid messages about: app interactions, technical actions, or specific tools.</div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Preview (first 5)</div>
          <div className="max-h-52 overflow-y-auto space-y-2">
            {previewSample.map((insult, index) => (
              <div key={`${insult.title}-${index}`} className="border border-neutral-700 bg-neutral-800/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-neutral-100 font-semibold">{insult.title}</div>
                  <label className="flex items-center gap-2 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      checked={insult.enabled}
                      onChange={(event) => {
                        const nextEnabled = event.target.checked
                        const key = buildKey(insult.title, insult.message, insult.punchline)
                        enabledMapRef.current.set(key, nextEnabled)
                        setPreviewInsults((prev) =>
                          prev.map((item, idx) =>
                            idx === index ? { ...item, enabled: nextEnabled } : item,
                          ),
                        )
                      }}
                      className="h-3 w-3"
                    />
                    Enabled
                  </label>
                </div>
                <div className="text-sm text-neutral-300 mt-1">{insult.message}</div>
                {insult.punchline ? (
                  <div className="text-sm text-neutral-400 mt-1 italic">{insult.punchline}</div>
                ) : null}
              </div>
            ))}
            {previewSample.length === 0 ? (
              <div className="text-xs text-neutral-500 border border-dashed border-neutral-700 p-3">
                Add messages above to preview them here.
              </div>
            ) : null}
          </div>
          <div className="text-xs text-neutral-500">Total parsed: {previewInsults.length}</div>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSave}
            className="flex-1 bg-white text-black px-4 py-2 hover:bg-neutral-200 disabled:opacity-70"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button onClick={onClose} className="flex-1 border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
