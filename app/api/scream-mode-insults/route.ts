import { NextResponse } from "next/server"
import type { ScreamModeInsult } from "@/lib/alert-types"
import * as screamModeInsultsRepo from "@/lib/db/repositories/scream-mode-insults"

export const runtime = "nodejs"

const isValidInsult = (value: unknown): value is ScreamModeInsult => {
  if (!value || typeof value !== "object") return false
  const insult = value as ScreamModeInsult
  return (
    typeof insult.id === "string" &&
    typeof insult.title === "string" &&
    typeof insult.message === "string" &&
    (insult.punchline === undefined || typeof insult.punchline === "string") &&
    typeof insult.enabled === "boolean" &&
    typeof insult.createdAt === "string"
  )
}

export async function GET(): Promise<Response> {
  try {
    const insults = await screamModeInsultsRepo.getAll()
    return NextResponse.json({ insults })
  } catch (error) {
    console.error("Failed to fetch scream mode insults:", error)
    return NextResponse.json({ insults: [] }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as { insults?: unknown }
    const insults = Array.isArray(payload.insults) ? payload.insults : null
    if (!insults || !insults.every((insult) => isValidInsult(insult))) {
      return NextResponse.json({ ok: false, error: "Invalid insult payload." }, { status: 400 })
    }

    const existing = await screamModeInsultsRepo.getAll()
    const newInsultIds = new Set((insults as ScreamModeInsult[]).map(i => i.id))
    
    // Create/update new insults first
    await Promise.all(
      (insults as ScreamModeInsult[]).map(insult => screamModeInsultsRepo.create(insult))
    )
    
    // Then delete insults that are no longer present
    const toDelete = existing.filter(e => !newInsultIds.has(e.id))
    await Promise.all(
      toDelete.map(insult => screamModeInsultsRepo.deleteInsult(insult.id))
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to update scream mode insults:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
