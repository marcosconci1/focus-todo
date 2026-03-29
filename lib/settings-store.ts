"use client"

import { useCallback } from "react"
import { DEFAULT_SETTINGS, type NudgeSettings } from "@/lib/settings-defaults"

export { DEFAULT_SETTINGS, type NudgeSettings }

export function useNudgeSettings(
  settings: NudgeSettings,
  onUpdate: (settings: NudgeSettings) => void,
): { settings: NudgeSettings; updateSettings: (partial: Partial<NudgeSettings>) => void } {
  const updateSettings = useCallback(
    (partial: Partial<NudgeSettings>) => {
      onUpdate({ ...settings, ...partial })
    },
    [settings, onUpdate],
  )

  return { settings, updateSettings }
}
