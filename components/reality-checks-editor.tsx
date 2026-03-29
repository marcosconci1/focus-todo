"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ModalShell from "@/components/modal-shell"
import type { AlertTemplate } from "@/lib/alert-types"
import {
  generateRealityCheckTemplates,
  loadRealityCheckMessages,
  saveRealityCheckMessages,
} from "@/lib/reality-checks"

type RealityChecksEditorProps = {
  alertTemplates: AlertTemplate[]
  onUpdateAlertTemplates: (templates: AlertTemplate[]) => void
  onClose: () => void
}

export default function RealityChecksEditor({
  alertTemplates,
  onUpdateAlertTemplates,
  onClose,
}: RealityChecksEditorProps) {
  const [rawText, setRawText] = useState("")
  const [previewMessages, setPreviewMessages] = useState<string[]>([])
  const [error, setError] = useState("")
  const isMountedRef = useRef(true)

  const parseMessages = useCallback((text: string) => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const messages = lines
      .map((line) => line.match(/^"(.+?)",?$/)?.[1])
      .filter((message): message is string => Boolean(message))
    setPreviewMessages(messages)
    setError(messages.length === 0 ? "No valid messages found" : "")
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    loadRealityCheckMessages()
      .then((messages) => {
        if (!isMountedRef.current) return
        const formatted = messages.map((message) => `"${message}",`).join("\n")
        setRawText(formatted)
      })
      .catch((err) => {
        console.error("Failed to load reality check messages:", err)
        if (!isMountedRef.current) return
        setError("Failed to load messages")
      })
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isMountedRef.current) return
      parseMessages(rawText)
    }, 300)
    return () => clearTimeout(timeout)
  }, [parseMessages, rawText])

  const handleSave = async () => {
    if (previewMessages.length === 0) {
      setError("No valid messages found")
      return
    }

    try {
      await saveRealityCheckMessages(previewMessages)
      if (!isMountedRef.current) return
      const updatedMessages = await loadRealityCheckMessages()
      if (!isMountedRef.current) return
      const realityTemplates = generateRealityCheckTemplates(updatedMessages, alertTemplates)
      const generatedIds = new Set(realityTemplates.map((template) => template.id))
      const extraRealityTemplates = alertTemplates.filter(
        (template) => template.type === "REALITY_CHECKS" && !generatedIds.has(template.id),
      )
      const baseTemplates = alertTemplates.filter((template) => template.type !== "REALITY_CHECKS")
      onUpdateAlertTemplates([...baseTemplates, ...realityTemplates, ...extraRealityTemplates])
      onClose()
    } catch (err) {
      console.error("Failed to save reality check messages:", err)
      if (!isMountedRef.current) return
      setError("Failed to save messages")
    }
  }

  return (
    <ModalShell onClose={onClose} panelClassName="bg-neutral-950 border border-neutral-700 p-6 w-full max-w-2xl">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Reality Check Messages</h3>

        <div className="space-y-2">
          <label
            htmlFor="reality-check-messages"
            className="text-xs uppercase tracking-[0.25em] text-neutral-500"
          >
            Messages (one per line)
          </label>
          <textarea
            id="reality-check-messages"
            value={rawText}
            onChange={(event) => {
              const nextValue = event.target.value
              setRawText(nextValue)
            }}
            className="w-full h-64 bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-300 focus:border-neutral-400 focus:outline-none font-mono"
            spellCheck={false}
          />
          {error ? (
            <div className="text-xs text-red-400">{error}</div>
          ) : (
            <div className="text-xs text-emerald-400">✓ {previewMessages.length} messages found</div>
          )}
        </div>

        <div className="text-xs text-neutral-500 space-y-1">
          <div>Format rules:</div>
          <div>- Each line must be wrapped in quotes, with an optional trailing comma</div>
          <div>- Example: &quot;Are you focused on the right thing?&quot;,</div>
          <div>- Empty lines are ignored</div>
          <div>Tip: Ask an AI to generate quotes in this format and paste here.</div>
        </div>

        <div className="flex gap-2 pt-4">
          <button onClick={handleSave} className="flex-1 bg-white text-black px-4 py-2 hover:bg-neutral-200">
            Save
          </button>
          <button onClick={onClose} className="flex-1 border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
