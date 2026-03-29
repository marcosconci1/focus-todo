export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m"

  const totalSeconds = Math.max(0, Math.floor(seconds))
  if (totalSeconds < 60) return "0m"

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) {
    return `${hours}h`
  }
  return `${hours}h ${minutes}m`
}

/**
 * Progressive overtime alert colors that escalate as overtime increases.
 */
export const getOvertimeColors = (
  overtimeSeconds: number,
): { text: string; border: string; bg: string } => {
  if (overtimeSeconds < 300) {
    return {
      text: "#facc15",
      border: "rgba(250, 204, 21, 0.5)",
      bg: "rgba(234, 179, 8, 0.3)",
    }
  }
  if (overtimeSeconds < 600) {
    return {
      text: "#fb923c",
      border: "rgba(251, 146, 60, 0.5)",
      bg: "rgba(249, 115, 22, 0.3)",
    }
  }
  if (overtimeSeconds < 900) {
    return {
      text: "#f97316",
      border: "rgba(249, 115, 22, 0.5)",
      bg: "rgba(234, 88, 12, 0.4)",
    }
  }
  return {
    text: "#ef4444",
    border: "rgba(239, 68, 68, 0.6)",
    bg: "rgba(220, 38, 38, 0.5)",
  }
}
