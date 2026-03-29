"use client"

import { useMemo, useState } from "react"
import { EMOJI_CATALOG } from "@/lib/emoji-utils"

interface EmojiPickerProps {
  value?: string
  onSelect: (emoji: string) => void
  onClose?: () => void
}

export default function EmojiPicker({ value, onSelect, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()

  const filteredEmojis = useMemo(() => {
    if (!normalizedQuery) return EMOJI_CATALOG
    return EMOJI_CATALOG.filter(
      (item) => item.keywords.some((keyword) => keyword.includes(normalizedQuery)),
    )
  }, [normalizedQuery])

  return (
    <div className="bg-neutral-900 border border-neutral-700 p-4 rounded">
      <input
        name="emoji-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search emojis"
        aria-label="Search emojis"
        className="w-full mb-3 bg-neutral-950 border border-neutral-700 px-3 py-2 text-neutral-300 focus:border-neutral-400 focus:outline-none text-sm"
      />
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-48 overflow-y-auto pr-1">
        {filteredEmojis.length === 0 ? (
          <div className="col-span-6 sm:col-span-8 text-center text-neutral-500 py-4">
            No emojis found
          </div>
        ) : (
          filteredEmojis.map((item) => (
            <button
              key={item.emoji}
              type="button"
              onClick={() => {
                onSelect(item.emoji)
                onClose?.()
              }}
              className={`text-2xl hover:bg-neutral-800 p-2 rounded transition ${
                value === item.emoji ? "bg-neutral-800" : ""
              }`}
              aria-label={`Select ${item.emoji}`}
            >
              {item.emoji}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
