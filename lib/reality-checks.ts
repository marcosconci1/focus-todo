import type { AlertTemplate } from "@/lib/alert-types"

export async function loadRealityCheckMessages(): Promise<string[]> {
  try {
    const response = await fetch("/reality-checks.txt")
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    }
    const text = await response.text()

    const messages = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.startsWith("\""))
      .map((line) => {
        const match = line.match(/^"(.*?)",?$/)?.[1] ?? null
        return match ? match.replace(/\\"/g, '"') : null
      })
      .filter((line): line is string => Boolean(line))

    return messages
  } catch (error) {
    console.error("Failed to load reality checks:", error)
    return getDefaultMessages()
  }
}

export async function saveRealityCheckMessages(messages: string[]): Promise<void> {
  const content = messages.map((message) => `"${message.replace(/"/g, '\\"')}",`).join("\n")

  try {
    const response = await fetch("/api/reality-checks/save", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: content,
    })
    if (!response.ok) {
      throw new Error(`Failed to save: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.error("Failed to save reality checks:", error)
    throw error
  }
}

export function getRandomRealityCheck(messages: string[]): string {
  const safeMessages = messages.length > 0 ? messages : getDefaultMessages()
  return safeMessages[Math.floor(Math.random() * safeMessages.length)]
}

export function generateRealityCheckTemplates(
  messages: string[],
  overrides: AlertTemplate[] = [],
): AlertTemplate[] {
  const safeMessages = messages.length > 0 ? messages : getDefaultMessages()
  const overrideMap = new Map(
    overrides.filter((template) => template.type === "REALITY_CHECKS").map((template) => [template.id, template]),
  )
  return safeMessages.map((message, index) => {
    const id = `alert-reality-${index + 1}`
    const override = overrideMap.get(id)
    return {
      id,
      type: "REALITY_CHECKS",
      title: "@Adrian",
      authorId: override?.authorId ?? "author-adrian",
      message,
      tone: "BITTERSWEET",
      enabled: override?.enabled ?? true,
    }
  })
}

function getDefaultMessages(): string[] {
  return [
    "Are you working on what truly matters right now?",
    "Is this task aligned with your goals for today?",
    "Take a breath. What's really important?",
    "Remember why you started this.",
    "You're doing great. Stay focused on your priorities.",
  ]
}
