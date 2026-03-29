import crypto from "crypto"
import { NextResponse } from "next/server"
import { google } from "googleapis"

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing required Google OAuth environment variables")
      return NextResponse.json(
        { error: "OAuth configuration missing" },
        { status: 500 }
      )
    }

    const state = crypto.randomBytes(32).toString("hex")

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    )
    const scopes = [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ]
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
      include_granted_scopes: true,
      state,
    })
    const response = NextResponse.redirect(authUrl)
    response.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    })
    return response
  } catch (error) {
    console.error("Failed to start Google OAuth:", error)
    return NextResponse.json({ error: "Failed to start Google OAuth" }, { status: 500 })
  }
}
