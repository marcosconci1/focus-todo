import type { ScreamModeInsult } from "@/lib/alert-types"

const DEFAULT_CREATED_AT = "2024-01-01T00:00:00.000Z"

export const DEFAULT_SCREAM_MODE_INSULTS: ScreamModeInsult[] = [
  {
    id: "scream-insult-2",
    title: "It's Giving...Regression",
    message: "Remember when you had hobbies? Before your phone became a personality trait?",
    punchline: "Yeah me neither.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-3",
    title: "Frequent Flyer To Rock Bottom",
    message: "They're naming the terminal after you.",
    punchline: "Congrats, I guess?",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-4",
    title: "The Procrastination Olympics",
    message: "You'd medal in avoiding the obvious.",
    punchline: "Gold in 'later'.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-5",
    title: "Scroll of Shame",
    message: "You've scrolled {timeWasted} for... what exactly?",
    punchline: "Truly inspiring.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-7",
    title: "Time Traveler",
    message: "You vanished for {inactiveMinutes} minutes.",
    punchline: "Still no progress.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-8",
    title: "Achievement Unlocked",
    message: "Avoided the task again.",
    punchline: "Speedrun any percent.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-9",
    title: "Battery Low, Focus Lower",
    message: "Your willpower just hit 1%.",
    punchline: "Plug it in. Literally.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-10",
    title: "You vs. The Task",
    message: "Scoreboard says 0-1.",
    punchline: "Want a rematch?",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-11",
    title: "Certified Time Waster",
    message: "Your certificate prints in {timeWasted}.",
    punchline: "Frame it?",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-12",
    title: "Multitasking Mirage",
    message: "You are doing a lot. None of it matters.",
    punchline: "Pick one. Any one.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-13",
    title: "Autoplay Champion",
    message: "Another episode? Another excuse.",
    punchline: "Bold strategy.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-14",
    title: "Doomscroll Gold Medalist",
    message: "You can stop any time. You just won't.",
    punchline: "Prove me wrong.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-15",
    title: "Focus Who?",
    message: "Focus called. You sent it to voicemail.",
    punchline: "Again.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-16",
    title: "Productivity Ghost",
    message: "You've been invisible for {inactiveMinutes} minutes.",
    punchline: "Boo.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-18",
    title: "Future You Is Watching",
    message: "Future you sent this: Start now.",
    punchline: "They're tired.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-20",
    title: "Reality Called",
    message: "It says you're {distractionsToday} distractions deep.",
    punchline: "Call it back.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-21",
    title: "Break?",
    message: "This isn't a break. It's a detour.",
    punchline: "Get back on track.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-22",
    title: "Distracted and Thriving",
    message: "{distractionsToday} distractions today and counting.",
    punchline: "You're consistent at least.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-23",
    title: "Idle Hands",
    message: "You've been idle for {inactiveMinutes} minutes.",
    punchline: "The task is still there.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
  {
    id: "scream-insult-24",
    title: "Time Wasted",
    message: "You donated {timeWasted} to the void.",
    punchline: "No refunds.",
    enabled: true,
    createdAt: DEFAULT_CREATED_AT,
  },
]

export function getDefaultInsults(): ScreamModeInsult[] {
  return DEFAULT_SCREAM_MODE_INSULTS
}

export function replacePlaceholders(
  text: string,
  data: { inactiveMinutes?: number; distractionsToday?: number; timeWasted?: number },
): string {
  return text
    .replaceAll(
      "{inactiveMinutes}",
      data.inactiveMinutes !== undefined ? String(data.inactiveMinutes) : "?",
    )
    .replaceAll(
      "{distractionsToday}",
      data.distractionsToday !== undefined ? String(data.distractionsToday) : "?",
    )
    .replaceAll("{timeWasted}", data.timeWasted !== undefined ? formatTimeWasted(data.timeWasted) : "some time")
}

export function formatTimeWasted(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m"
  const totalMinutes = Math.round(minutes)
  const hours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60
  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}
