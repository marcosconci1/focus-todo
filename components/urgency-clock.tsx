"use client"

import { useState, useEffect } from "react"

export default function UrgencyClock() {
  const [elapsedHalfHours, setElapsedHalfHours] = useState(0)

  useEffect(() => {
    const updateHalfHours = () => {
      const now = new Date()
      const totalMinutes = now.getHours() * 60 + now.getMinutes()
      setElapsedHalfHours(Math.floor(totalMinutes / 30))
    }

    updateHalfHours()

    const interval = setInterval(updateHalfHours, 60000)

    return () => clearInterval(interval)
  }, [])

  const barLength = 48
  const filledLength = elapsedHalfHours
  const emptyLength = barLength - filledLength

  const filled = "█".repeat(filledLength)
  const empty = "░".repeat(emptyLength)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/10 backdrop-blur-sm">
      <div
        className="grid h-3 w-full overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${barLength}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: barLength }, (_, index) => (
          <div
            key={index}
            className={index < filledLength ? "bg-neutral-500/40" : "bg-neutral-500/10"}
          />
        ))}
      </div>
    </div>
  )
}
