"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { NudgeSettings } from "@/lib/settings-store"
import type { AlertAuthor, AlertTemplate } from "@/lib/alert-types"
import RealityChecksEditor from "@/components/reality-checks-editor"
import ScreamModeEditor from "@/components/scream-mode-editor"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import ModalShell from "@/components/modal-shell"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface SettingsMenuProps {
  settings: NudgeSettings
  updateSettings: (partial: Partial<NudgeSettings>) => void
  onGoogleCalendarReconnected?: () => void
  alertTemplates: AlertTemplate[]
  onUpdateAlertTemplates: (templates: AlertTemplate[]) => void
  onPlayTestSound?: (volume: number, soundFile?: string) => void
  onPlayAlertSound?: (volume: number) => void
  onTestAlert?: () => void
}

type SettingsTab = "timer" | "sound" | "alerts" | "integrations"

type SettingRowProps = {
  label: string
  description?: string
  control: ReactNode
  htmlFor?: string
}

type SoundOption = {
  file: string
  label: string
}

type DbHealthSummary = {
  status?: string
  integrity?: { ok: boolean; errors?: string[] }
  databaseSize?: number
  walSize?: number
  shmSize?: number
  backupInfo?: { lastBackupAt: string | null; lastBackupPath?: string | null }
}

const TAB_LABELS: Record<SettingsTab, string> = {
  timer: "Timer",
  sound: "Sound",
  alerts: "Alerts",
  integrations: "Integrations",
}

const PRESET_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#ff6b6b" },
  { name: "Orange", value: "#ff9f43" },
  { name: "Yellow", value: "#feca57" },
  { name: "Green", value: "#48dbfb" },
  { name: "Blue", value: "#0abde3" },
  { name: "Purple", value: "#9b59b6" },
]

const GOOGLE_CALENDAR_COLORS = [
  { id: "11", name: "Tomato", color: "#d50000" },
  { id: "4", name: "Flamingo", color: "#e67c73" },
  { id: "6", name: "Tangerine", color: "#f4511e" },
  { id: "5", name: "Banana", color: "#f6bf26" },
  { id: "10", name: "Basil", color: "#0b8043" },
  { id: "2", name: "Sage", color: "#33b679" },
  { id: "7", name: "Peacock", color: "#039be5" },
  { id: "9", name: "Blueberry", color: "#3f51b5" },
  { id: "1", name: "Lavender", color: "#7986cb" },
  { id: "3", name: "Grape", color: "#8e24aa" },
  { id: "8", name: "Graphite", color: "#616161" },
]

const TEST_SOUND_DURATION_MS = 800
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const normalizeSoundOptions = (data: unknown): SoundOption[] => {
  const rawSounds =
    data && typeof data === "object" && !Array.isArray(data) ? (data as { sounds?: unknown }).sounds : data

  let entries: Array<{ file: string; label: string }> = []

  if (rawSounds && typeof rawSounds === "object" && !Array.isArray(rawSounds)) {
    entries = Object.entries(rawSounds as Record<string, unknown>)
      .map(([label, file]) => ({
        label: String(label).trim(),
        file: typeof file === "string" ? file.trim() : "",
      }))
      .filter((entry) => entry.label && entry.file)
  } else if (Array.isArray(rawSounds)) {
    entries = rawSounds
      .map((entry) => {
        if (typeof entry === "string") {
          return { file: entry, label: entry }
        }
        if (entry && typeof entry === "object") {
          const raw = entry as { file?: unknown; label?: unknown }
          if (typeof raw.file === "string" && raw.file.trim()) {
            const label = typeof raw.label === "string" && raw.label.trim() ? raw.label : raw.file
            return { file: raw.file.trim(), label }
          }
        }
        return null
      })
      .filter((entry): entry is SoundOption => Boolean(entry))
  }

  return entries.filter((entry) => {
    const lower = entry.file.toLowerCase()
    return lower.endsWith(".mp3") || lower.endsWith(".wav")
  })
}

function SettingsTabs({ activeTab, onChange }: { activeTab: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  const tabs = Object.keys(TAB_LABELS) as SettingsTab[]
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.indexOf(activeTab)
    if (currentIndex < 0) return

    let nextIndex = currentIndex
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length
        break
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break
      case "Home":
        nextIndex = 0
        break
      case "End":
        nextIndex = tabs.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    onChange(tabs[nextIndex])
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  return (
    <div
      role="tablist"
      aria-label="Settings tabs"
      onKeyDown={handleKeyDown}
      className="flex gap-3 border-b border-neutral-800 pb-3"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          ref={(node) => {
            tabRefs.current[index] = node
          }}
          role="tab"
          id={`settings-tab-${tab}`}
          aria-selected={activeTab === tab}
          aria-controls={`settings-panel-${tab}`}
          tabIndex={activeTab === tab ? 0 : -1}
          className={`text-xs uppercase tracking-[0.3em] transition pb-2 border-b-2 ${
            activeTab === tab
              ? "text-white border-white"
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  )
}

function SettingRow({ label, description, control, htmlFor }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-semibold text-neutral-300 block">
            {label}
          </label>
        ) : (
          <div className="text-sm font-semibold text-neutral-300">{label}</div>
        )}
        {description ? <p className="text-xs text-neutral-500 mt-1">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export default function SettingsMenu({
  settings,
  updateSettings,
  onGoogleCalendarReconnected,
  alertTemplates,
  onUpdateAlertTemplates,
  onPlayTestSound,
  onPlayAlertSound,
  onTestAlert,
}: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isTestingSound, setIsTestingSound] = useState(false)
  const [isTestingAlertSound, setIsTestingAlertSound] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>("timer")
  const [soundOptions, setSoundOptions] = useState<SoundOption[]>([])
  const [isManagingMessages, setIsManagingMessages] = useState(false)
  const [isManagingScreamMode, setIsManagingScreamMode] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [dbHealth, setDbHealth] = useState<DbHealthSummary | null>(null)
  const [isDbHealthLoading, setIsDbHealthLoading] = useState(false)
  const [isBackupRunning, setIsBackupRunning] = useState(false)
  const [isRestoreRunning, setIsRestoreRunning] = useState(false)
  const [isOptimizeRunning, setIsOptimizeRunning] = useState(false)
  const [isRockySectionOpen, setIsRockySectionOpen] = useState(false)
  const [isAdrianSectionOpen, setIsAdrianSectionOpen] = useState(false)
  const [isTimekeeperSectionOpen, setIsTimekeeperSectionOpen] = useState(false)
  const [isRockyAdvancedOpen, setIsRockyAdvancedOpen] = useState(false)
  const [isScreamAdvancedOpen, setIsScreamAdvancedOpen] = useState(false)
  const restoreInputRef = useRef<HTMLInputElement | null>(null)
  const titleId = "settings-dialog-title"
  const hasCustomSound =
    settings.completionSoundFile !== "generated" &&
    soundOptions.some((option) => option.file === settings.completionSoundFile)
  const isGoogleConnected = settings.googleCalendarConnected

  useEffect(() => {
    const controller = new AbortController()
    const loadSounds = async () => {
      try {
        const response = await fetch("/sounds/manifest.json", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) return
        const data = (await response.json()) as unknown
        const options = normalizeSoundOptions(data)
        if (!controller.signal.aborted) {
          setSoundOptions(options)
        }
      } catch {
        if (!controller.signal.aborted) {
          setSoundOptions([])
        }
      }
    }
    loadSounds()
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const handleOAuthMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; success?: boolean; error?: string } | null
      if (!data || data.type !== "google_oauth_result") return

      if (data.success) {
        let email = ""
        try {
          const response = await fetch("/api/google/status", { cache: "no-store" })
          if (response.ok) {
            const statusData = (await response.json()) as { userEmail?: string | null }
            email = typeof statusData.userEmail === "string" ? statusData.userEmail : ""
          }
        } catch (statusError) {
          console.error("Failed to fetch Google status after connect:", statusError)
        }

        if (!isMounted) return

        updateSettings({
          googleCalendarConnected: true,
          googleCalendarUserEmail: email,
          googleCalendarAutoSync: true,
        })
        onGoogleCalendarReconnected?.()
        toast({
          title: "Connected to Google Calendar",
          description: email ? `Signed in as ${email}` : undefined,
        })
      } else {
        const error = data.error ?? "unknown"
        const errorMessages: Record<string, string> = {
          access_denied: "Permission was denied. Please try again if this was a mistake.",
          no_code: "Google did not return an authorization code.",
          token_exchange_failed: "Token exchange failed. Verify GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env match your Google Cloud Console.",
          missing_email: "Your Google account did not provide an email address.",
          invalid_state: "Security validation failed. Please try connecting again.",
          oauth_config_missing: "Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your .env file.",
          no_refresh_token: "No refresh token received. Go to https://myaccount.google.com/permissions, revoke this app's access, then reconnect.",
          missing_calendar_scope: "Calendar permission was not granted. Please reconnect and allow calendar access.",
          token_save_failed: "Failed to save credentials to database. Check database access and try again.",
          redirect_uri_mismatch: "Redirect URI mismatch. Ensure GOOGLE_REDIRECT_URI in .env matches the URI configured in Google Cloud Console.",
          invalid_client: "Invalid client credentials. Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env match your Google Cloud Console.",
          invalid_grant: "Authorization code expired or already used. Please try connecting again.",
        }
        const description = errorMessages[error] ?? `Connection failed (${error}). Check server logs for details.`
        console.error("Google Calendar OAuth error:", error)
        toast({
          title: "Google Calendar connection failed",
          description,
          variant: "destructive",
        })
      }

      if (!isMounted) return
      setIsConnecting(false)
    }

    window.addEventListener("message", handleOAuthMessage)
    return () => {
      isMounted = false
      window.removeEventListener("message", handleOAuthMessage)
    }
  }, [onGoogleCalendarReconnected, updateSettings])

  // Fallback: handle URL params when popup was blocked and full-page redirect was used
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("google_connected") === "true"
    const error = params.get("google_error")
    if (!connected && !error) return

    // Simulate the same message the popup would send
    window.postMessage(
      {
        type: "google_oauth_result",
        success: connected,
        ...(error ? { error } : {}),
      },
      window.location.origin,
    )

    // Clean up URL params
    const url = new URL(window.location.href)
    url.searchParams.delete("google_connected")
    url.searchParams.delete("google_error")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
  }, [])

  useEffect(() => {
    if (!settings.googleCalendarConnected) return
    let isMounted = true

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/google/status", { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as {
          connected?: boolean
          userEmail?: string | null
        }
        if (!isMounted) return

        if (data.connected === false) {
          updateSettings({
            googleCalendarConnected: false,
            googleCalendarUserEmail: "",
            googleCalendarAutoSync: false,
          })
          return
        }

        if (data.connected && typeof data.userEmail === "string") {
          if (data.userEmail !== settings.googleCalendarUserEmail) {
            updateSettings({ googleCalendarUserEmail: data.userEmail })
          }
        }
      } catch (statusError) {
        console.error("Failed to fetch Google status:", statusError)
      }
    }

    void loadStatus()
    return () => {
      isMounted = false
    }
  }, [settings.googleCalendarConnected, settings.googleCalendarUserEmail, updateSettings])

  const handleGoogleConnect = () => {
    setIsConnecting(true)
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      "/api/google/auth",
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    )
    if (!popup) {
      // Popup blocked — fall back to full-page redirect
      window.location.href = "/api/google/auth"
    } else {
      // Detect if the popup is closed without completing OAuth
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          setIsConnecting(false)
        }
      }, 500)
    }
  }

  const handleGoogleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const response = await fetch("/api/google/disconnect", { method: "POST" })
      if (!response.ok) {
        throw new Error("Disconnect failed")
      }
      updateSettings({
        googleCalendarConnected: false,
        googleCalendarUserEmail: "",
        googleCalendarAutoSync: false,
      })
      toast({ title: "Disconnected from Google Calendar" })
    } catch (error) {
      console.error("Failed to disconnect Google Calendar:", error)
      toast({
        title: "Failed to disconnect",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDisconnecting(false)
    }
  }

  const fetchDbHealth = useCallback(async () => {
    setIsDbHealthLoading(true)
    try {
      const response = await fetch("/api/db/health", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Health check failed")
      }
      const data = (await response.json()) as DbHealthSummary
      setDbHealth(data)
    } catch (error) {
      console.error("Failed to fetch database health:", error)
      toast({
        title: "Failed to fetch database health",
        description: "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDbHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || activeTab !== "integrations") return
    void fetchDbHealth()
  }, [activeTab, isOpen, fetchDbHealth])

  const handleBackup = async () => {
    setIsBackupRunning(true)
    try {
      const response = await fetch("/api/db/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup" }),
      })
      if (!response.ok) {
        throw new Error("Backup failed")
      }
      await fetchDbHealth()
      toast({ title: "Backup created" })
    } catch (error) {
      console.error("Failed to create backup:", error)
      toast({ title: "Backup failed", description: "Please try again.", variant: "destructive" })
    } finally {
      setIsBackupRunning(false)
    }
  }

  const handleRestore = async (file: File | null) => {
    if (!file) return
    setIsRestoreRunning(true)
    try {
      const formData = new FormData()
      formData.append("action", "restore")
      formData.append("file", file)
      const response = await fetch("/api/db/recovery", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        throw new Error("Restore failed")
      }
      await fetchDbHealth()
      toast({ title: "Database restored" })
      // Force page reload to sync in-memory state with restored database
      window.location.reload()
    } catch (error) {
      console.error("Failed to restore database:", error)
      toast({ title: "Restore failed", description: "Please try again.", variant: "destructive" })
    } finally {
      setIsRestoreRunning(false)
      if (restoreInputRef.current) {
        restoreInputRef.current.value = ""
      }
    }
  }

  const handleOptimize = async () => {
    setIsOptimizeRunning(true)
    try {
      const response = await fetch("/api/db/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "optimize" }),
      })
      if (!response.ok) {
        throw new Error("Optimize failed")
      }
      await fetchDbHealth()
      toast({ title: "Database optimized" })
    } catch (error) {
      console.error("Failed to optimize database:", error)
      toast({ title: "Optimize failed", description: "Please try again.", variant: "destructive" })
    } finally {
      setIsOptimizeRunning(false)
    }
  }

  function updateAuthorProperty(authorId: string, updates: Partial<AlertAuthor>) {
    const updatedAuthors = settings.authors.map((author) =>
      author.id === authorId ? { ...author, ...updates } : author,
    )
    updateSettings({ authors: updatedAuthors })
  }

  const rockyAuthor = settings.authors.find((author) => author.id === "author-rocky")
  const adrianAuthor = settings.authors.find((author) => author.id === "author-adrian")
  const timekeeperAuthor = settings.authors.find((author) => author.id === "author-elapsed-time-tracker")

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 text-zinc-700 hover:text-zinc-400 transition-colors duration-300 text-2xl font-bold z-40"
        aria-label="Open preferences"
      >
        ...
      </button>

      {isOpen && (
        <ModalShell
          onClose={() => setIsOpen(false)}
          panelClassName="bg-neutral-950 border border-neutral-700 w-full max-w-3xl mx-4 font-mono"
          ariaLabelledby={titleId}
        >
            <div className="max-h-[80vh] overflow-y-auto p-8 space-y-6">
              <h2 id={titleId} className="sr-only">
                Settings
              </h2>
              <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

              {activeTab === "timer" && (
                <div
                  role="tabpanel"
                  id="settings-panel-timer"
                  aria-labelledby="settings-tab-timer"
                  className="space-y-4"
                >
                  <div className="border border-neutral-800 rounded p-4 space-y-4">
                    <SettingRow
                      label="Pomodoro Timer"
                      description="Pomodoro length (minutes)"
                      htmlFor="pomodoro-length"
                      control={
                        <input
                          id="pomodoro-length"
                          type="number"
                          min={1}
                          max={999}
                          step={1}
                          value={settings.pomodoroMinutes}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            const clamped = Number.isNaN(parsed) ? 1 : clamp(parsed, 1, 999)
                            updateSettings({ pomodoroMinutes: clamped })
                          }}
                          className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm text-center"
                        />
                      }
                    />

                    <SettingRow
                      label="Short break"
                      description="Short break (minutes)"
                      htmlFor="short-break-length"
                      control={
                        <input
                          id="short-break-length"
                          type="number"
                          min={1}
                          max={60}
                          step={1}
                          value={settings.shortBreakMinutes}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            const clamped = Number.isNaN(parsed) ? 1 : clamp(parsed, 1, 60)
                            updateSettings({ shortBreakMinutes: clamped })
                          }}
                          className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm text-center"
                        />
                      }
                    />

                    <SettingRow
                      label="Long break"
                      description="Long break (minutes)"
                      htmlFor="long-break-length"
                      control={
                        <input
                          id="long-break-length"
                          type="number"
                          min={1}
                          max={120}
                          step={1}
                          value={settings.longBreakMinutes}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            const clamped = Number.isNaN(parsed) ? 1 : clamp(parsed, 1, 120)
                            updateSettings({ longBreakMinutes: clamped })
                          }}
                          className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm text-center"
                        />
                      }
                    />

                    <SettingRow
                      label="Long break frequency"
                      description={`Long break after every ${settings.longBreakEvery} completed sessions (across all projects)`}
                      htmlFor="long-break-frequency"
                      control={
                        <input
                          id="long-break-frequency"
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          value={settings.longBreakEvery}
                          onChange={(e) => {
                            const parsed = Number.parseInt(e.target.value, 10)
                            const clamped = Number.isNaN(parsed) ? 1 : clamp(parsed, 1, 10)
                            updateSettings({ longBreakEvery: clamped })
                          }}
                          className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm text-center"
                        />
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === "sound" && (
                <div
                  role="tabpanel"
                  id="settings-panel-sound"
                  aria-labelledby="settings-tab-sound"
                  className="space-y-4"
                >
                  <div className="border border-neutral-800 rounded p-4 space-y-4">
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Completion sound</div>
                    <SettingRow
                      label="Completion sound"
                      description="Subtle chime when a session ends"
                      htmlFor="completion-sound"
                      control={
                        <Switch
                          id="completion-sound"
                          checked={settings.completionSoundEnabled}
                          onCheckedChange={(checked) => updateSettings({ completionSoundEnabled: checked })}
                        />
                      }
                    />

                    <SettingRow
                      label="Sound file"
                      description="Choose a song from public/sounds"
                      htmlFor="completion-sound-file"
                      control={
                        <select
                          id="completion-sound-file"
                          name="completion-sound-file"
                          value={settings.completionSoundFile}
                          onChange={(event) => updateSettings({ completionSoundFile: event.target.value })}
                          className="w-48 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-xs font-mono"
                        >
                          <option value="generated">Default (generated)</option>
                          {!hasCustomSound && settings.completionSoundFile !== "generated" && (
                            <option value={settings.completionSoundFile}>
                              {settings.completionSoundFile}
                            </option>
                          )}
                          {soundOptions.map((option) => (
                            <option key={option.file} value={option.file}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      }
                    />
                    {soundOptions.length === 0 && (
                      <div className="text-xs text-neutral-500">
                        Add .mp3 or .wav files to `public/sounds` and list them in `public/sounds/manifest.json`.
                      </div>
                    )}

                    <SettingRow
                      label="Volume"
                      description="Adjust the completion sound level"
                      htmlFor="completion-volume"
                      control={
                        <div className="flex items-center gap-3">
                          <input
                            id="completion-volume"
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={settings.completionSoundVolume}
                            onChange={(e) =>
                              updateSettings({ completionSoundVolume: Number.parseFloat(e.target.value) || 0 })
                            }
                            className="w-32"
                            disabled={!settings.completionSoundEnabled}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!onPlayTestSound || isTestingSound) return
                              setIsTestingSound(true)
                              onPlayTestSound(settings.completionSoundVolume, settings.completionSoundFile)
                              setTimeout(() => setIsTestingSound(false), TEST_SOUND_DURATION_MS)
                            }}
                            className="text-zinc-400 hover:text-zinc-200 text-xs font-mono"
                            disabled={!onPlayTestSound || isTestingSound}
                          >
                            Play test
                          </button>
                        </div>
                      }
                    />

                    <SettingRow
                      label="Session confetti"
                      description="Celebrate session completion with confetti"
                      htmlFor="completion-confetti"
                      control={
                        <Switch
                          id="completion-confetti"
                          checked={settings.confettiEnabled}
                          onCheckedChange={(checked) => updateSettings({ confettiEnabled: checked })}
                        />
                      }
                    />
                  </div>

                  <div className="border border-neutral-800 rounded p-4 space-y-4">
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">ALERT SOUNDS</div>
                    <SettingRow
                      label="Alert notification sound"
                      description="Play sound when alerts appear"
                      control={
                        <Switch
                          checked={settings.alertSoundEnabled}
                          onCheckedChange={(checked) => updateSettings({ alertSoundEnabled: checked })}
                        />
                      }
                    />
                    <SettingRow
                      label="Volume"
                      description="Adjust alert sound level"
                      control={
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={settings.alertSoundVolume}
                            onChange={(event) =>
                              updateSettings({ alertSoundVolume: Number.parseFloat(event.target.value) || 0 })
                            }
                            className="w-32"
                            disabled={!settings.alertSoundEnabled}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!onPlayAlertSound || isTestingAlertSound) return
                              setIsTestingAlertSound(true)
                              onPlayAlertSound(settings.alertSoundVolume)
                              setTimeout(() => setIsTestingAlertSound(false), TEST_SOUND_DURATION_MS)
                            }}
                            className="text-zinc-400 hover:text-zinc-200 text-xs font-mono"
                            disabled={!onPlayAlertSound || isTestingAlertSound}
                          >
                            Play test
                          </button>
                        </div>
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === "alerts" && (
                <div
                  role="tabpanel"
                  id="settings-panel-alerts"
                  aria-labelledby="settings-tab-alerts"
                  className="space-y-4"
                >
                  <SettingRow
                    label="All alerts"
                    description="Master switch for every reminder / nudge"
                    htmlFor="alerts-enabled"
                    control={
                      <Switch
                        id="alerts-enabled"
                        checked={settings.alertsEnabled}
                        onCheckedChange={(checked) => updateSettings({ alertsEnabled: checked })}
                      />
                    }
                  />
                  <div className="text-xs text-neutral-500">
                    Note: All notifications (visual and audio) are automatically suppressed during active focus sessions
                    to minimize distractions. Notifications will resume when the timer is paused or during breaks.
                  </div>

                  <div className="space-y-4">
                    <Collapsible open={isRockySectionOpen} onOpenChange={setIsRockySectionOpen}>
                      <div
                        className={`border border-neutral-800 rounded p-4 space-y-4 ${
                          !settings.alertsEnabled ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-3 text-sm text-neutral-200 hover:text-neutral-100"
                              aria-expanded={isRockySectionOpen}
                              aria-controls="author-rocky-content"
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: rockyAuthor?.color ?? "#ff6b6b" }}
                                aria-hidden="true"
                              />
                              <span>{rockyAuthor?.name ?? "@Rocky"}</span>
                              <span className="ml-auto text-xs text-neutral-400">
                                {isRockySectionOpen ? "[-]" : "[+]"}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent id="author-rocky-content" className="space-y-4 pt-2">
                          <SettingRow
                            label="Inactivity nudges"
                            description="Remind you when you're idle"
                            control={
                              <Switch
                                checked={settings.enableInactivityNudges}
                                onCheckedChange={(checked) => updateSettings({ enableInactivityNudges: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <SettingRow
                            label="End of day countdown"
                            description="Remind you when the day is ending"
                            control={
                              <Switch
                                checked={settings.enableEndOfDayReminders}
                                onCheckedChange={(checked) => updateSettings({ enableEndOfDayReminders: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          {settings.enableEndOfDayReminders && (
                            <div className="ml-4">
                              <SettingRow
                                label="End of Day Time"
                                htmlFor="eod-time"
                                control={
                                  <input
                                    id="eod-time"
                                    type="time"
                                    value={settings.endOfDayTime}
                                    onChange={(e) => updateSettings({ endOfDayTime: e.target.value })}
                                    className="bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm"
                                    disabled={!settings.alertsEnabled}
                                  />
                                }
                              />
                            </div>
                          )}

                          <SettingRow
                            label="Habits ending day"
                            description="Nudge you to finish habits before the cutoff"
                            control={
                              <Switch
                                checked={settings.habitEndOfDayNudgesEnabled}
                                onCheckedChange={(checked) => updateSettings({ habitEndOfDayNudgesEnabled: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <SettingRow
                            label="Post-Task Break Reminders"
                            description="Get reminded to take breaks after completing tasks (3-round escalation: 5min, 10min, 15min)"
                            control={
                              <Switch
                                checked={settings.enableBreakReminders}
                                onCheckedChange={(checked) => updateSettings({ enableBreakReminders: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <SettingRow
                            label="Check-in frequency (minutes)"
                            htmlFor="rocky-checkin-frequency"
                            control={
                              <input
                                id="rocky-checkin-frequency"
                                type="number"
                                min={5}
                                max={999}
                                step={5}
                                value={rockyAuthor?.checkInFrequencyMinutes ?? 60}
                                onChange={(event) => {
                                  const parsed = Number.parseInt(event.target.value, 10)
                                  if (Number.isNaN(parsed)) return
                                  updateAuthorProperty("author-rocky", {
                                    checkInFrequencyMinutes: clamp(parsed, 5, 999),
                                  })
                                }}
                                className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <Collapsible open={isRockyAdvancedOpen} onOpenChange={setIsRockyAdvancedOpen}>
                            <CollapsibleTrigger
                              className="flex items-center justify-between w-full py-2 text-sm text-neutral-400 hover:text-neutral-200"
                              aria-expanded={isRockyAdvancedOpen}
                            >
                              <span>Advanced Options</span>
                              <span className="text-xs">{isRockyAdvancedOpen ? "[-]" : "[+]"}</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-4 pt-2">
                              {settings.enableBreakReminders && (
                                <div className="ml-4">
                                  <SettingRow
                                    label="Escalation interval (minutes)"
                                    description="Time between break reminder rounds"
                                    htmlFor="break-reminder-interval"
                                    control={
                                      <input
                                        id="break-reminder-interval"
                                        type="number"
                                        min={1}
                                        max={60}
                                        value={settings.breakReminderIntervalMinutes ?? 5}
                                        onChange={(event) =>
                                          (() => {
                                            const parsed = Number.parseInt(event.target.value, 10)
                                            if (Number.isNaN(parsed)) return
                                            updateSettings({ breakReminderIntervalMinutes: clamp(parsed, 1, 60) })
                                          })()
                                        }
                                        className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                        disabled={!settings.alertsEnabled}
                                      />
                                    }
                                  />
                                </div>
                              )}

                              <SettingRow
                                label="Cooldown (minutes)"
                                description="Minimum time between any alerts"
                                htmlFor="alert-cooldown"
                                control={
                                  <select
                                    id="alert-cooldown"
                                    value={settings.alertCooldownMinutes}
                                    onChange={(e) => updateSettings({ alertCooldownMinutes: Number(e.target.value) })}
                                    className="bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm"
                                    disabled={!settings.alertsEnabled}
                                  >
                                    <option value={30}>30</option>
                                    <option value={45}>45</option>
                                    <option value={60}>60</option>
                                    <option value={75}>75</option>
                                    <option value={90}>90</option>
                                  </select>
                                }
                              />

                              <SettingRow
                                label="Avoid same alert type twice"
                                description="Rotate alert types between nudges"
                                control={
                                  <Switch
                                    checked={settings.avoidSameAlertType}
                                    onCheckedChange={(checked) => updateSettings({ avoidSameAlertType: checked })}
                                    disabled={!settings.alertsEnabled}
                                  />
                                }
                              />
                            </CollapsibleContent>
                          </Collapsible>

                          <button
                            type="button"
                            onClick={() => onTestAlert?.()}
                            className="text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-700 px-3 py-2 w-full"
                            disabled={!onTestAlert || !settings.alertsEnabled}
                          >
                            Test Alert
                          </button>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>

                    <Collapsible open={isAdrianSectionOpen} onOpenChange={setIsAdrianSectionOpen}>
                      <div
                        className={`border border-neutral-800 rounded p-4 space-y-4 ${
                          !settings.alertsEnabled ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-3 text-sm text-neutral-200 hover:text-neutral-100"
                              aria-expanded={isAdrianSectionOpen}
                              aria-controls="author-adrian-content"
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: adrianAuthor?.color ?? "#9b59b6" }}
                                aria-hidden="true"
                              />
                              <span>{adrianAuthor?.name ?? "@Adrian"}</span>
                              <span className="ml-auto text-xs text-neutral-400">
                                {isAdrianSectionOpen ? "[-]" : "[+]"}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent id="author-adrian-content" className="space-y-4 pt-2">
                          <SettingRow
                            label="Reality Checks"
                            description="Short prompts to refocus on priorities"
                            control={
                              <Switch
                                checked={settings.enableRealityChecks}
                                onCheckedChange={(checked) => updateSettings({ enableRealityChecks: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          {settings.enableRealityChecks && (
                            <div className="ml-4 space-y-3">
                              <SettingRow
                                label="Max per day"
                                description="0 = unlimited (or set 1-50 for daily limit)"
                                htmlFor="reality-check-max"
                                control={
                                  <input
                                    id="reality-check-max"
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={settings.realityCheckSettings?.maxPerDay ?? 5}
                                    onChange={(event) =>
                                      (() => {
                                        const parsed = Number.parseInt(event.target.value, 10)
                                        if (Number.isNaN(parsed)) return
                                        const normalized = parsed === 0 ? 0 : clamp(parsed, 1, 50)
                                        updateSettings({
                                          realityCheckSettings: {
                                            ...(settings.realityCheckSettings ?? {}),
                                            maxPerDay: normalized,
                                          },
                                        })
                                      })()
                                    }
                                    className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                    disabled={!settings.alertsEnabled}
                                  />
                                }
                              />
                            </div>
                          )}

                          <SettingRow
                            label="Check-in frequency (minutes)"
                            htmlFor="adrian-checkin-frequency"
                            control={
                              <input
                                id="adrian-checkin-frequency"
                                type="number"
                                min={5}
                                max={999}
                                step={5}
                                value={adrianAuthor?.checkInFrequencyMinutes ?? 45}
                                onChange={(event) => {
                                  const parsed = Number.parseInt(event.target.value, 10)
                                  if (Number.isNaN(parsed)) return
                                  updateAuthorProperty("author-adrian", {
                                    checkInFrequencyMinutes: clamp(parsed, 5, 999),
                                  })
                                }}
                                className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <button
                            type="button"
                            onClick={() => setIsManagingMessages(true)}
                            className="w-full border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900 transition"
                          >
                            Manage Reality Check Messages
                          </button>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>

                    <Collapsible open={isTimekeeperSectionOpen} onOpenChange={setIsTimekeeperSectionOpen}>
                      <div
                        className={`border border-neutral-800 rounded p-4 space-y-4 ${
                          !settings.alertsEnabled ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-3 text-sm text-neutral-200 hover:text-neutral-100"
                              aria-expanded={isTimekeeperSectionOpen}
                              aria-controls="author-timekeeper-content"
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: timekeeperAuthor?.color ?? "#f39c12" }}
                                aria-hidden="true"
                              />
                              <span>{timekeeperAuthor?.name ?? "@TimeKeeper"}</span>
                              <span className="ml-auto text-xs text-neutral-400">
                                {isTimekeeperSectionOpen ? "[-]" : "[+]"}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent id="author-timekeeper-content" className="space-y-4 pt-2">
                          <SettingRow
                            label="TimeKeeper (Elapsed Time Tracker)"
                            description="Shows persistent timer counting time since your last session"
                            control={
                              <Switch
                                checked={settings.enableElapsedTimeTracker}
                                onCheckedChange={(checked) => updateSettings({ enableElapsedTimeTracker: checked })}
                                disabled={!settings.alertsEnabled}
                              />
                            }
                          />

                          <div className="flex items-center gap-2 text-xs text-amber-300">
                            <span className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1">
                              ∞ Always visible
                            </span>
                            <span className="text-neutral-500">Messages never expire.</span>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </div>

                  {/* Scream Mode Section */}
                  <div className="border border-red-800/50 rounded p-4 space-y-4 bg-red-950/10">
                    <div className="text-xs uppercase tracking-[0.25em] text-red-400">
                      SCREAM MODE (AGGRESSIVE)
                    </div>

                    <SettingRow
                      label="Enable Scream Mode"
                      description="Aggressive alerts when inactive (flashing screen + optional sound)"
                      htmlFor="scream-mode-enabled"
                      control={
                        <Switch
                          id="scream-mode-enabled"
                          checked={settings.enableScreamMode}
                          onCheckedChange={(checked) => updateSettings({ enableScreamMode: checked })}
                          disabled={!settings.alertsEnabled}
                        />
                      }
                    />

                    {settings.enableScreamMode && (
                      <div className="ml-4 space-y-3">
                        <SettingRow
                          label="Enable sound alerts"
                          description="Play loud sound with screen flash (disable for visual-only mode)"
                          htmlFor="scream-mode-sound"
                          control={
                            <Switch
                              id="scream-mode-sound"
                              checked={settings.screamModeSoundEnabled}
                              onCheckedChange={(checked) => updateSettings({ screamModeSoundEnabled: checked })}
                              disabled={!settings.alertsEnabled}
                            />
                          }
                        />

                        <Collapsible open={isScreamAdvancedOpen} onOpenChange={setIsScreamAdvancedOpen}>
                          <CollapsibleTrigger
                            className="flex items-center justify-between w-full py-2 text-sm text-red-300/80 hover:text-red-200"
                            aria-expanded={isScreamAdvancedOpen}
                          >
                            <span>Advanced</span>
                            <span className="text-xs">{isScreamAdvancedOpen ? "[-]" : "[+]"}</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-3 pt-2">
                            <SettingRow
                              label="Inactivity threshold (minutes)"
                              description="Trigger scream mode after X minutes without starting a timer"
                              htmlFor="scream-mode-threshold"
                              control={
                                <input
                                  id="scream-mode-threshold"
                                  type="number"
                                  min={5}
                                  max={120}
                                  step={5}
                                  value={settings.screamModeInactivityMinutes}
                                  onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10)
                                    if (Number.isNaN(parsed)) return
                                    updateSettings({
                                      screamModeInactivityMinutes: clamp(parsed, 5, 120),
                                    })
                                  }}
                                  className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                  disabled={!settings.alertsEnabled}
                                />
                              }
                            />

                            <SettingRow
                              label="Alert interval (minutes)"
                              description="Repeat alerts every X minutes while inactive"
                              htmlFor="scream-mode-interval"
                              control={
                                <input
                                  id="scream-mode-interval"
                                  type="number"
                                  min={1}
                                  max={15}
                                  value={settings.screamModeAlertIntervalMinutes}
                                  onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10)
                                    if (Number.isNaN(parsed)) return
                                    updateSettings({
                                      screamModeAlertIntervalMinutes: clamp(parsed, 1, 15),
                                    })
                                  }}
                                  className="w-20 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 text-center focus:border-neutral-400 focus:outline-none text-sm"
                                  disabled={!settings.alertsEnabled}
                                />
                              }
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsManagingScreamMode(true)}
                      className="w-full border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900 transition"
                    >
                      Manage Scream Mode Messages
                    </button>

                    <div className="text-xs text-red-400 border border-red-500/30 rounded bg-red-500/10 p-2">
                      Warning: Scream mode is intentionally disruptive. It will flash the screen red
                      {settings.screamModeSoundEnabled && " and play loud alerts"} repeatedly until you start a timer.
                    </div>
                </div>
                </div>
              )}

              {activeTab === "integrations" && (
                <div
                  role="tabpanel"
                  id="settings-panel-integrations"
                  aria-labelledby="settings-tab-integrations"
                  className="space-y-4"
                >
                  <div className="border border-neutral-800 rounded p-4 space-y-4">
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Google Calendar</div>
                    <div className="flex items-center justify-between gap-4 border border-neutral-800 rounded bg-neutral-900 p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isGoogleConnected ? "bg-emerald-400" : "bg-neutral-600"
                          }`}
                        />
                        <div>
                          <div className="text-sm text-neutral-200">
                            {isGoogleConnected ? "Connected" : "Not Connected"}
                          </div>
                          {isGoogleConnected && settings.googleCalendarUserEmail ? (
                            <div className="text-xs text-neutral-500">{settings.googleCalendarUserEmail}</div>
                          ) : null}
                        </div>
                      </div>
                      {isGoogleConnected ? (
                        <button
                          type="button"
                          onClick={handleGoogleDisconnect}
                          disabled={isDisconnecting}
                          className="border border-red-500 text-red-300 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-red-400 hover:text-red-200 disabled:opacity-50"
                        >
                          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleGoogleConnect}
                          disabled={isConnecting}
                          className="bg-white text-black px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:bg-neutral-200 disabled:opacity-50"
                        >
                          {isConnecting ? "Connecting..." : "Connect"}
                        </button>
                      )}
                    </div>

                    {isGoogleConnected && (
                      <div className="text-xs text-neutral-500">
                        Sessions automatically sync to Google Calendar when connected.
                      </div>
                    )}

                    <SettingRow
                      label="Event title format"
                      description="How task names appear in your calendar (default: Emoji + Task)"
                      htmlFor="calendar-event-format"
                      control={
                        <select
                          id="calendar-event-format"
                          name="calendar-event-format"
                          value={settings.googleCalendarEventFormat || "emoji"}
                          onChange={(event) =>
                            updateSettings({
                              googleCalendarEventFormat:
                                event.target.value as NudgeSettings["googleCalendarEventFormat"],
                            })
                          }
                          className="w-56 bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-xs font-mono"
                          disabled={!isGoogleConnected}
                        >
                          <option value="emoji">📝 Task Name (Emoji + Task)</option>
                          <option value="task">Task Name (Task Only)</option>
                          <option value="project-task">Project - Task Name (Project + Task)</option>
                          <option value="emoji-task-project">📝 Task Name - Project (Emoji + Task - Project)</option>
                        </select>
                      }
                    />

                    <SettingRow
                      label="Event color"
                      description="Choose the color for calendar events (default: Tomato)"
                      htmlFor="calendar-event-color"
                      control={
                        <div className="grid grid-cols-11 gap-1.5">
                          {GOOGLE_CALENDAR_COLORS.map((color) => (
                            <button
                              key={color.id}
                              type="button"
                              onClick={() => updateSettings({ googleCalendarColorId: color.id })}
                              className={`
                                w-7 h-7 rounded-full border-2 transition-all
                                ${
                                  settings.googleCalendarColorId === color.id
                                    ? "border-white scale-110 ring-2 ring-white ring-offset-2 ring-offset-neutral-950"
                                    : "border-transparent hover:scale-105 hover:border-neutral-600"
                                }
                              `}
                              style={{ backgroundColor: color.color }}
                              title={color.name}
                              aria-label={`Select ${color.name} color`}
                              disabled={!isGoogleConnected}
                            />
                          ))}
                        </div>
                      }
                    />

                    {isGoogleConnected && (
                      <SettingRow
                        label="Sync overtime to calendar"
                        description="Update calendar events with actual session duration including overtime"
                        htmlFor="calendar-sync-overtime"
                        control={
                          <Switch
                            id="calendar-sync-overtime"
                            checked={settings.googleCalendarSyncOvertime}
                            onCheckedChange={(checked) => updateSettings({ googleCalendarSyncOvertime: checked })}
                            disabled={!settings.googleCalendarAutoSync}
                          />
                        }
                      />
                    )}

                    {!isGoogleConnected && (
                      <div className="border border-neutral-800 rounded bg-neutral-900 p-3 text-xs text-neutral-400">
                        Connect your Google Calendar to automatically save focus sessions and keep your schedule in
                        sync.
                      </div>
                    )}
                    {isGoogleConnected && (
                      <div className="border border-neutral-800 rounded bg-neutral-900 p-3 text-xs text-neutral-400">
                        Focus sessions will be added to your calendar automatically.
                      </div>
                    )}
                  </div>

                  <div className="border border-neutral-800 rounded p-4 space-y-4">
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-500">Database Health</div>
                    <div className="flex items-center justify-between gap-4 border border-neutral-800 rounded bg-neutral-900 p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            dbHealth?.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                        />
                        <div>
                          <div className="text-sm text-neutral-200">
                            {dbHealth?.status === "healthy" ? "Healthy" : "Needs attention"}
                          </div>
                          {dbHealth?.integrity && !dbHealth.integrity.ok ? (
                            <div className="text-xs text-amber-400">Integrity issues detected</div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={fetchDbHealth}
                        disabled={isDbHealthLoading}
                        className="border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-neutral-400 disabled:opacity-50"
                      >
                        {isDbHealthLoading ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>

                    <div className="text-xs text-neutral-500">
                      {dbHealth?.databaseSize !== undefined
                        ? `Database size: ${Math.round(dbHealth.databaseSize / 1024)} KB`
                        : "Database size unavailable"}
                      {dbHealth?.walSize !== undefined ? ` · WAL: ${Math.round(dbHealth.walSize / 1024)} KB` : ""}
                      {dbHealth?.shmSize !== undefined ? ` · SHM: ${Math.round(dbHealth.shmSize / 1024)} KB` : ""}
                    </div>
                    {dbHealth?.backupInfo?.lastBackupAt ? (
                      <div className="text-xs text-neutral-500">
                        Last backup: {new Date(dbHealth.backupInfo.lastBackupAt).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-500">No backups recorded yet.</div>
                    )}

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <button
                        type="button"
                        onClick={handleBackup}
                        disabled={isBackupRunning}
                        className="border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-neutral-400 disabled:opacity-50"
                      >
                        {isBackupRunning ? "Backing up..." : "Create Backup"}
                      </button>
                      <button
                        type="button"
                        onClick={() => restoreInputRef.current?.click()}
                        disabled={isRestoreRunning}
                        className="border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-neutral-400 disabled:opacity-50"
                      >
                        {isRestoreRunning ? "Restoring..." : "Restore Backup"}
                      </button>
                      <button
                        type="button"
                        onClick={handleOptimize}
                        disabled={isOptimizeRunning}
                        className="border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-neutral-400 disabled:opacity-50"
                      >
                        {isOptimizeRunning ? "Optimizing..." : "Optimize"}
                      </button>
                    </div>
                    <input
                      ref={restoreInputRef}
                      type="file"
                      accept=".db,.sqlite,.sqlite3"
                      className="hidden"
                      onChange={(event) => handleRestore(event.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 mt-8 pt-6 border-t border-neutral-800 bg-neutral-950">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full bg-white text-black px-4 py-2 hover:bg-neutral-200 transition font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
        </ModalShell>
      )}

      {isManagingMessages && (
        <RealityChecksEditor
          alertTemplates={alertTemplates}
          onUpdateAlertTemplates={onUpdateAlertTemplates}
          onClose={() => setIsManagingMessages(false)}
        />
      )}

      {isManagingScreamMode && <ScreamModeEditor onClose={() => setIsManagingScreamMode(false)} />}
    </>
  )
}
