import { NextResponse } from "next/server"
import { google } from "googleapis"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

export async function POST() {
  try {
    const refreshToken = await GoogleTokensRepo.disconnect()

    if (refreshToken) {
      const clientId = process.env.GOOGLE_CLIENT_ID
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET
      const redirectUri = process.env.GOOGLE_REDIRECT_URI

      if (!clientId || !clientSecret || !redirectUri) {
        console.warn("Missing Google OAuth environment variables, skipping token revocation")
      } else {
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri,
        )
        try {
          await oauth2Client.revokeToken(refreshToken)
        } catch (error) {
          console.warn("Failed to revoke Google refresh token:", error)
        }
      }
    }

    const response = NextResponse.json({
      success: true,
      message: "Disconnected from Google Calendar",
    })

    return response
  } catch (error) {
    console.error("Failed to disconnect Google Calendar:", error)
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
