import "server-only"

import type { ScreamModeInsult } from "@/lib/alert-types"
import * as screamModeInsultsRepo from "@/lib/db/repositories/scream-mode-insults"
import { getDefaultInsults } from "@/lib/scream-mode-insults-data"

export async function loadScreamModeInsults(): Promise<ScreamModeInsult[]> {
  try {
    const enabled = await screamModeInsultsRepo.getEnabled()
    if (enabled.length > 0) return enabled

    await screamModeInsultsRepo.seedDefaultInsults()
    const seeded = await screamModeInsultsRepo.getEnabled()

    return seeded.length > 0 ? seeded : getDefaultInsults()
  } catch (error) {
    console.error("Failed to load scream mode insults:", error)
    return getDefaultInsults()
  }
}

export async function getRandomScreamModeInsult(
  insults?: ScreamModeInsult[],
): Promise<ScreamModeInsult> {
  const pool = insults && insults.length > 0 ? insults : await loadScreamModeInsults()
  const fallback = pool.length > 0 ? pool : getDefaultInsults()
  return fallback[Math.floor(Math.random() * fallback.length)] ?? getDefaultInsults()[0]
}
