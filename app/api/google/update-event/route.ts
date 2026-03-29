import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

const MAX_DURATION_MINUTES = 480

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

type GoogleErrorPayload = { errors?: Array<{ reason?: string; message?: string }>; message?: string }

const parseGoogleError = (error: unknown) => {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
  const status = response?.status
  const googleError = response?.data?.error as GoogleErrorPayload | undefined
  const errorReason = googleError?.errors?.[0]?.reason
  const errorMessage = googleError?.errors?.[0]?.message || googleError?.message
  return { status, errorReason, errorMessage }
}

const isRetryable = (status?: number, reason?: string) => {
  if (!status) return true
  if (status >= 500) return true
  if (status === 429) return true
  if (reason === "rateLimitExceeded" || reason === "quotaExceeded" || reason === "userRateLimitExceeded") return true
  return false
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      eventId?: string
      startTime?: string
      durationMinutes?: number
      description?: string
      timeZone?: string
    }

    const eventId = body.eventId?.trim()
    const startTime = body.startTime?.trim()
    const durationMinutesRaw = Number(body.durationMinutes)
    const description = typeof body.description === "string" ? body.description : ""

    if (!eventId || !startTime) {
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

    const startDate = new Date(startTime)
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid startTime" }, { status: 400 })
    }
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    const timeZone = body.timeZone?.trim() || "UTC"

    const patchEvent = async () =>
      calendar.events.patch({
        calendarId: "primary",
        eventId,
        requestBody: {
          description,
          start: {
            dateTime: startDate.toISOString(),
            timeZone,
          },
          end: {
            dateTime: endDate.toISOString(),
            timeZone,
          },
        },
      })

    const executePatch = async () => {
      try {
        return await patchEvent()
      } catch (error) {
        const { status, errorReason, errorMessage } = parseGoogleError(error)
        if (status === 401) {
          const refreshedAccessToken = await refreshAccessToken(refreshToken)
          if (!refreshedAccessToken) {
            throw { status: 401, errorReason, errorMessage }
          }
          try {
            await GoogleTokensRepo.refresh(refreshedAccessToken, Date.now() + 3600 * 1000)
          } catch (dbError) {
            console.error("Failed to persist refreshed Google access token (will be stale on next request):", dbError)
          }
          oauth2Client.setCredentials({ access_token: refreshedAccessToken, refresh_token: refreshToken })
          try {
            return await patchEvent()
          } catch (retryError) {
            const retryParsed = parseGoogleError(retryError)
            throw { status: retryParsed.status, errorReason: retryParsed.errorReason, errorMessage: retryParsed.errorMessage }
          }
        }
        throw { status, errorReason, errorMessage }
      }
    }

    let lastError: { status?: number; errorReason?: string; errorMessage?: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await executePatch()
        if (!response.data.id) {
          return NextResponse.json({ success: false, error: "Missing event details" }, { status: 500 })
        }
        return NextResponse.json({ success: true }, { status: 200 })
      } catch (error) {
        const parsed = error as { status?: number; errorReason?: string; errorMessage?: string }
        lastError = parsed
        if (isRetryable(parsed.status, parsed.errorReason) && attempt < 2) {
          const delayMs = 500 * 2 ** attempt
          await sleep(delayMs)
          continue
        }
        break
      }
    }

    if (lastError?.errorReason === "insufficientPermissions") {
      return NextResponse.json(
        { success: false, error: "Permission denied", details: lastError.errorReason ?? lastError.errorMessage },
        { status: 403 },
      )
    }
    if (lastError?.errorReason === "notFound" || lastError?.status === 404) {
      return NextResponse.json(
        { success: false, error: "Event not found", details: lastError.errorReason ?? lastError.errorMessage },
        { status: 404 },
      )
    }
    if (lastError?.status === 401) {
      return NextResponse.json(
        { success: false, error: "Session expired", details: lastError.errorReason ?? lastError.errorMessage },
        { status: 401 },
      )
    }
    if (lastError?.status === 429) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded", details: lastError.errorReason ?? lastError.errorMessage },
        { status: 429 },
      )
    }

    console.error("Failed to update Google Calendar event:", lastError)
    return NextResponse.json({ success: false, error: "Failed to update event" }, { status: 500 })
  } catch (error) {
    console.error("Failed to handle update-event request:", error)
    return NextResponse.json({ success: false, error: "Failed to update event" }, { status: 500 })
  }
}
