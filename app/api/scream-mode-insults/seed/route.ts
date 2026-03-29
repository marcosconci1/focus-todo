import { NextResponse } from "next/server"
import { seedDefaultInsults } from "@/lib/db/repositories/scream-mode-insults"

export const runtime = "nodejs"

export async function POST(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  try {
    await seedDefaultInsults()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to seed scream mode insults:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
