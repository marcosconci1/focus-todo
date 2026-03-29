import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import type { GoogleCalendarEventFormat } from "@/lib/types"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

const MAX_DURATION_MINUTES = 480

const expandHex = (hex: string) =>
  hex
    .split("")
    .map((ch) => ch + ch)
    .join("")

const hexToGoogleColorId = (hex?: string): string => {
  if (!hex) return "11"
  const trimmed = hex.trim().toLowerCase()
  if (!trimmed) return "11"
  const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
  const expanded = normalized.length === 3 ? expandHex(normalized) : normalized
  if (!/^[0-9a-f]{6}$/.test(expanded)) return "11"

  const hexMap: Array<{ colors: string[]; colorId: string }> = [
    { colors: ["ff6b6b", "e74c3c", "ff0000"], colorId: "11" },
    { colors: ["ff9f43", "e67e22"], colorId: "6" },
    { colors: ["feca57", "f1c40f"], colorId: "5" },
    { colors: ["27ae60", "1dd1a1"], colorId: "10" },
    { colors: ["0abde3", "3498db"], colorId: "9" },
    { colors: ["9b59b6", "8e44ad"], colorId: "3" },
    { colors: ["ffffff", "f5f5f5"], colorId: "8" },
  ]

  const match = hexMap.find((entry) => entry.colors.includes(expanded))
  return match ? match.colorId : "11"
}

const formatEventTitle = (
  taskName: string,
  projectName: string,
  emoji: string,
  eventFormat?: GoogleCalendarEventFormat,
): string => {
  switch (eventFormat) {
    case "task":
      return taskName
    case "project-task":
      return `${projectName} - ${taskName}`
    case "emoji-task-project":
      return `${emoji} ${taskName} - ${projectName}`.trim()
    case "emoji":
    case "":
    default:
      return `${emoji} ${taskName}`.trim()
  }
}

const refreshAccessToken = async (refreshToken: string): Promise<string | null> => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await oauth2Client.refreshAccessToken()
    return credentials.access_token ?? null
  } catch (error) {
    console.error("Failed to refresh Google access token:", error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      taskName?: string
      projectName?: string
      emoji?: string
      colorId?: string
      startTime?: string
      durationMinutes?: number
      eventFormat?: GoogleCalendarEventFormat
      timeZone?: string
    }

    const taskName = body.taskName?.trim()
    const projectName = body.projectName?.trim()
    const startTime = body.startTime?.trim()
    const durationMinutesRaw = Number(body.durationMinutes)

    if (!taskName || !projectName || !startTime) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    if (!Number.isFinite(durationMinutesRaw) || !Number.isInteger(durationMinutesRaw)) {
      return NextResponse.json({ success: false, error: "Invalid duration" }, { status: 400 })
    }

    const durationMinutes = durationMinutesRaw
    if (durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) {
      return NextResponse.json({ success: false, error: "Invalid duration" }, { status: 400 })
    }

    const tokens = await GoogleTokensRepo.get()
    if (!tokens.accessToken || !tokens.refreshToken) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 })
    }

    const accessToken = tokens.accessToken
    const refreshToken = tokens.refreshToken
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    )
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

    const calendar = google.calendar({ version: "v3", auth: oauth2Client })

    const emoji = body.emoji?.trim() || ""
    const summary = formatEventTitle(taskName, projectName, emoji, body.eventFormat)
    const colorId =
      body.colorId && /^(1|2|3|4|5|6|7|8|9|10|11)$/.test(body.colorId)
        ? body.colorId
        : hexToGoogleColorId(body.colorId)
    const startDate = new Date(startTime)
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid startTime" }, { status: 400 })
    }
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    const timeZone = body.timeZone?.trim() || "UTC"

    const event = {
      summary,
      description: `Project: ${projectName}\nCreated by Focus Todo App`,
      colorId,
      start: {
        dateTime: startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
    }

    const insertEvent = async () => calendar.events.insert({ calendarId: "primary", requestBody: event })

    try {
      const response = await insertEvent()
      if (!response.data.id || !response.data.htmlLink) {
        return NextResponse.json({ success: false, error: "Missing event details" }, { status: 500 })
      }
      return NextResponse.json(
        {
          success: true,
          eventId: response.data.id,
          eventLink: response.data.htmlLink,
        },
        { status: 200 },
      )
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
      const status = response?.status
      const googleError = response?.data?.error as
        | { errors?: Array<{ reason?: string; message?: string }>; message?: string }
        | undefined
      const errorReason = googleError?.errors?.[0]?.reason
      const errorMessage = googleError?.errors?.[0]?.message || googleError?.message

      if (errorReason === "invalid_grant" || errorReason === "invalid_credentials") {
        return NextResponse.json(
          { success: false, error: "Session expired", details: errorReason ?? errorMessage },
          { status: 401 },
        )
      }
      if (
        errorReason === "rateLimitExceeded" ||
        errorReason === "quotaExceeded" ||
        errorReason === "userRateLimitExceeded"
      ) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded", details: errorReason ?? errorMessage },
          { status: 429 },
        )
      }
      if (errorReason === "invalidDateTime" || errorReason === "invalidTimeZone") {
        return NextResponse.json(
          { success: false, error: "Invalid date/time", details: errorReason ?? errorMessage },
          { status: 400 },
        )
      }
      if (errorReason === "insufficientPermissions") {
        return NextResponse.json(
          { success: false, error: "Permission denied", details: errorReason ?? errorMessage },
          { status: 403 },
        )
      }

      if (status === 401) {
        const refreshedAccessToken = await refreshAccessToken(refreshToken)
        if (!refreshedAccessToken) {
          return NextResponse.json(
            { success: false, error: "Session expired", details: errorMessage },
            { status: 401 },
          )
        }

        try {
          await GoogleTokensRepo.refresh(refreshedAccessToken, Date.now() + 3600 * 1000)
        } catch (dbError) {
          console.error("Failed to persist refreshed Google access token (will be stale on next request):", dbError)
        }

        oauth2Client.setCredentials({ access_token: refreshedAccessToken, refresh_token: refreshToken })
        try {
          const retryResponse = await insertEvent()
          if (!retryResponse.data.id || !retryResponse.data.htmlLink) {
            return NextResponse.json({ success: false, error: "Missing event details" }, { status: 500 })
          }
          return NextResponse.json(
            {
              success: true,
              eventId: retryResponse.data.id,
              eventLink: retryResponse.data.htmlLink,
            },
            { status: 200 },
          )
        } catch (retryError) {
          console.error("Failed to create event after token refresh:", retryError)
          return NextResponse.json(
            { success: false, error: "Session expired" },
            { status: 401 },
          )
        }
      }

      if (status === 403) {
        return NextResponse.json(
          { success: false, error: "Permission denied", details: errorMessage },
          { status: 403 },
        )
      }
      if (status === 404) {
        return NextResponse.json(
          { success: false, error: "Calendar not found", details: errorMessage },
          { status: 404 },
        )
      }

      console.error("Failed to create Google Calendar event:", error, response?.data)
      return NextResponse.json({ success: false, error: "Failed to create event" }, { status: 500 })
    }
  } catch (error) {
    console.error("Failed to handle create-event request:", error)
    return NextResponse.json({ success: false, error: "Failed to create event" }, { status: 500 })
  }
}
