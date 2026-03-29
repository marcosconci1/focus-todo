import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error")
  if (error) {
    return NextResponse.redirect(new URL("/oauth-callback?google_error=access_denied", request.url))
  }

  const code = request.nextUrl.searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(new URL("/oauth-callback?google_error=no_code", request.url))
  }

  const state = request.nextUrl.searchParams.get("state")
  const storedState = request.cookies.get("google_oauth_state")?.value
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/oauth-callback?google_error=invalid_state", request.url))
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing required Google OAuth environment variables")
      return NextResponse.redirect(new URL("/oauth-callback?google_error=oauth_config_missing", request.url))
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    )
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token) {
      throw new Error("Missing access token from Google")
    }

    const refreshToken = tokens.refresh_token
    if (!refreshToken) {
      console.error("No refresh token received from Google. User may need to revoke access and re-authorize.")
      return NextResponse.redirect(new URL("/oauth-callback?google_error=no_refresh_token", request.url))
    }

    const grantedScopes = tokens.scope ?? ""
    if (!grantedScopes.includes("calendar.events")) {
      console.error("Google OAuth missing calendar.events scope. Granted:", grantedScopes)
      return NextResponse.redirect(new URL("/oauth-callback?google_error=missing_calendar_scope", request.url))
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: refreshToken,
    })
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()
    const userEmail = userInfo.data.email
    if (!userEmail) {
      console.warn("Google userinfo missing email", {
        userId: userInfo.data.id ?? "unknown",
        verifiedEmail: userInfo.data.verified_email ?? "unknown",
      })
      return NextResponse.redirect(new URL("/oauth-callback?google_error=missing_email", request.url))
    }

    const expiryDate = tokens.expiry_date ?? Date.now() + 3600 * 1000
    try {
      await GoogleTokensRepo.save({
        accessToken: tokens.access_token,
        refreshToken,
        expiryDate,
        scope: tokens.scope || "https://www.googleapis.com/auth/calendar.events",
        userEmail,
      })
    } catch (error) {
      console.error("Failed to save Google tokens:", error)
      return NextResponse.redirect(new URL("/oauth-callback?google_error=token_save_failed", request.url))
    }

    const stateCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
    }
    const response = NextResponse.redirect(new URL("/oauth-callback?google_connected=true", request.url))

    response.cookies.set("google_oauth_state", "", {
      ...stateCookieOptions,
      maxAge: 0,
    })

    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const responseData = (error as { response?: { data?: { error?: string; error_description?: string } } })
      ?.response?.data
    const oauthError = responseData?.error ?? ""
    const oauthDesc = responseData?.error_description ?? ""

    console.error("Failed to complete Google OAuth:", {
      message: errorMessage,
      oauthError,
      oauthDesc,
    })

    let errorCode = "token_exchange_failed"
    if (oauthError === "redirect_uri_mismatch" || errorMessage.includes("redirect_uri_mismatch")) {
      errorCode = "redirect_uri_mismatch"
    } else if (oauthError === "invalid_client" || errorMessage.includes("invalid_client")) {
      errorCode = "invalid_client"
    } else if (oauthError === "invalid_grant" || errorMessage.includes("invalid_grant")) {
      errorCode = "invalid_grant"
    }

    return NextResponse.redirect(new URL(`/oauth-callback?google_error=${errorCode}`, request.url))
  }
}
