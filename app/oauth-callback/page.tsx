"use client"

import { useEffect, useMemo } from "react"

type CallbackResult =
  | { type: "google_oauth_result"; success: true }
  | { type: "google_oauth_result"; success: false; error: string }

export default function OAuthCallbackPage() {
  const { status, errorMessage, connected, error } = useMemo(() => {
    if (typeof window === "undefined") {
      return { status: "processing" as const, errorMessage: "", connected: false, error: null }
    }
    const params = new URLSearchParams(window.location.search)
    const c = params.get("google_connected") === "true"
    const e = params.get("google_error")
    if (c) return { status: "success" as const, errorMessage: "", connected: c, error: e }
    if (e) return { status: "error" as const, errorMessage: e, connected: c, error: e }
    return { status: "error" as const, errorMessage: "No response received from Google.", connected: c, error: e }
  }, [])

  useEffect(() => {
    let message: CallbackResult
    if (connected) {
      message = { type: "google_oauth_result", success: true }
    } else {
      message = { type: "google_oauth_result", success: false, error: error ?? "unknown" }
    }

    if (window.opener) {
      window.opener.postMessage(message, window.location.origin)
      setTimeout(() => window.close(), 1000)
    } else {
      window.location.href = `/?${connected ? "google_connected=true" : `google_error=${error ?? "unknown"}`}`
    }
  }, [connected, error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-3 p-8">
        {status === "processing" && (
          <p className="text-muted-foreground">Connecting to Google Calendar...</p>
        )}
        {status === "success" && (
          <p>Connected! This window will close automatically.</p>
        )}
        {status === "error" && (
          <>
            <p className="text-destructive">Connection failed: {errorMessage}</p>
            <p className="text-sm text-muted-foreground">This window will close automatically.</p>
          </>
        )}
      </div>
    </div>
  )
}
