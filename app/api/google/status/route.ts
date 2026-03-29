import { NextResponse } from "next/server"
import * as GoogleTokensRepo from "@/lib/db/repositories/google-tokens"

export async function GET() {
  try {
    const tokens = await GoogleTokensRepo.get()
    
    if (!tokens) {
      return NextResponse.json({
        connected: false,
        userEmail: null,
        expiryDate: null,
        needsRefresh: false,
      })
    }
    
    const expiryDate = tokens.expiryDate ?? null
    const needsRefresh = expiryDate ? expiryDate < Date.now() + 5 * 60 * 1000 : false

    return NextResponse.json({
      connected: tokens.refreshToken !== null,
      userEmail: tokens.userEmail || null,
      expiryDate,
      needsRefresh,
    })
  } catch (error) {
    console.error("Failed to fetch Google token status:", error)
    return NextResponse.json({ error: "Failed to fetch token status" }, { status: 500 })
  }
}
