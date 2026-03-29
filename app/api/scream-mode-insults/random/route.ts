import { NextResponse } from "next/server"
import { getRandomScreamModeInsult } from "@/lib/scream-mode-insults"

export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  try {
    const insult = await getRandomScreamModeInsult()
    return NextResponse.json({ insult })
  } catch (error) {
    console.error("Failed to fetch scream mode insult:", error)
    return NextResponse.json({ insult: null }, { status: 500 })
  }
}
