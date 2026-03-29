import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

export async function POST(request: NextRequest) {
  try {
    const tokens = await GoogleTokensRepo.get()
    if (!tokens.refreshToken) {
      return NextResponse.json({ error: "Missing refresh token" }, { status: 401 })
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    )
    oauth2Client.setCredentials({ refresh_token: tokens.refreshToken })
    const { credentials } = await oauth2Client.refreshAccessToken()

    if (!credentials.access_token) {
      throw new Error("Missing access token from refresh response")
    }

    const expiryDate = credentials.expiry_date ?? Date.now() + 3600 * 1000
    try {
      await GoogleTokensRepo.refresh(credentials.access_token, expiryDate)
    } catch (error) {
      console.error("Failed to persist refreshed Google access token:", error)
      return NextResponse.json({ error: "Failed to persist refreshed token" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const responseError = (error as { response?: { data?: { error?: unknown } } })?.response
      ?.data?.error
    const errorCode = typeof responseError === "string" ? responseError : undefined
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const status = (error as { response?: { status?: unknown } })?.response?.status
    const statusCode = typeof status === "number" ? status : undefined

    console.error("Failed to refresh Google access token:", {
      code: errorCode,
      status: statusCode,
      message: errorMessage,
    })

    const isInvalidGrant =
      errorCode === "invalid_grant" ||
      errorMessage.includes("invalid_grant") ||
      errorMessage.toLowerCase().includes("revoked")
    if (isInvalidGrant) {
      return NextResponse.json(
        { error: "Refresh token expired or revoked" },
        { status: 401 }
      )
    }

    return NextResponse.json({ error: "Failed to refresh token" }, { status: 500 })
  }
}
