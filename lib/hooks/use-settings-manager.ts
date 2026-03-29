"use client"

import { useState, useCallback, useRef } from "react"
import type { Database } from "@/lib/storage"
import type { Category } from "@/lib/types"
import { DEFAULT_SETTINGS, type NudgeSettings, useNudgeSettings } from "@/lib/settings-store"
import { normalizeUserSettings, clampSettingsUpdate } from "@/lib/validation/settings-validation"

interface UseSettingsManagerParams {
  buildDatabase: (categories: Category[]) => Database
  categoriesRef: React.RefObject<Category[]>
  dataLoadedRef: React.RefObject<boolean>
  saveData: (data: Database, options?: { onRollback?: (data: Database) => void }) => void
  applyDatabase: (data: Database) => void
}

function useSettingsManager({
  buildDatabase,
  categoriesRef,
  dataLoadedRef,
  saveData,
  applyDatabase,
}: UseSettingsManagerParams) {
  const [userSettings, setUserSettings] = useState<Database["userSettings"]>({})
  const [nudgeSettings, setNudgeSettings] = useState<NudgeSettings>(DEFAULT_SETTINGS)
  const userSettingsRef = useRef<Database["userSettings"]>({})

  const normalizeSettings = useCallback((raw: Database["userSettings"]): NudgeSettings => {
    return normalizeUserSettings(raw)
  }, [])

  const handleUpdateSettings = useCallback(
    (partial: Partial<NudgeSettings>) => {
      const prev = nudgeSettings
      const next = clampSettingsUpdate(partial, prev)
      const nextUserSettings = {
        ...userSettingsRef.current,
        ...next,
      }
      setNudgeSettings(next)
      setUserSettings(nextUserSettings)
      userSettingsRef.current = nextUserSettings

      if (!dataLoadedRef.current) {
        return
      }

      const currentCategories = categoriesRef.current
      const previousData = buildDatabase(currentCategories)
      const nextData: Database = {
        ...previousData,
        userSettings: { ...nextUserSettings },
      }
      saveData(nextData, { onRollback: () => applyDatabase(previousData) })
    },
    [nudgeSettings, buildDatabase, categoriesRef, dataLoadedRef, saveData, applyDatabase],
  )

  const { settings, updateSettings } = useNudgeSettings(nudgeSettings, handleUpdateSettings)

  const setUserSettingsWithRef = useCallback((value: Database["userSettings"]) => {
    userSettingsRef.current = value
    setUserSettings(value)
  }, [])

  return {
    userSettings,
    setUserSettings: setUserSettingsWithRef,
    nudgeSettings,
    setNudgeSettings,
    normalizeSettings,
    settings,
    updateSettings,
  }
}

export default useSettingsManager
