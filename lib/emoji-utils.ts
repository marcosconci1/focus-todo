export const EMOJI_CATALOG = [
  { emoji: "📖", keywords: ["book", "read", "study", "notes"] },
  { emoji: "☕", keywords: ["coffee", "cafe", "break"] },
  { emoji: "⚡", keywords: ["energy", "spark", "fast", "power"] },
  { emoji: "💼", keywords: ["work", "office", "job", "briefcase"] },
  { emoji: "🧹", keywords: ["clean", "tidy", "chores", "sweep"] },
  { emoji: "🍳", keywords: ["cook", "breakfast", "meal", "food"] },
  { emoji: "📊", keywords: ["chart", "data", "stats", "analytics"] },
  { emoji: "🎧", keywords: ["music", "audio", "podcast", "listen"] },
  { emoji: "💬", keywords: ["chat", "talk", "message", "conversation"] },
  { emoji: "🌙", keywords: ["night", "sleep", "moon", "rest"] },
  { emoji: "🏃", keywords: ["run", "cardio", "exercise", "fitness"] },
  { emoji: "🎯", keywords: ["goal", "target", "focus", "aim"] },
  { emoji: "💪", keywords: ["strength", "workout", "gym", "lift"] },
  { emoji: "🎨", keywords: ["art", "design", "creative", "draw"] },
  { emoji: "🎵", keywords: ["music", "song", "melody", "play"] },
  { emoji: "📝", keywords: ["write", "notes", "journal", "plan"] },
  { emoji: "🔥", keywords: ["streak", "hot", "energy", "focus"] },
  { emoji: "✨", keywords: ["sparkle", "polish", "shine", "magic"] },
  { emoji: "🌟", keywords: ["star", "highlight", "best", "shine"] },
  { emoji: "🚀", keywords: ["launch", "ship", "fast", "growth"] },
  { emoji: "💡", keywords: ["idea", "lightbulb", "insight", "think"] },
  { emoji: "🎓", keywords: ["learn", "study", "graduate", "education"] },
  { emoji: "🏆", keywords: ["win", "award", "trophy", "achievement"] },
  { emoji: "🎮", keywords: ["game", "play", "fun", "console"] },
  { emoji: "📚", keywords: ["book", "read", "study", "library"] },
  { emoji: "🎬", keywords: ["movie", "film", "video", "watch"] },
  { emoji: "🌱", keywords: ["grow", "plant", "habit", "seed"] },
  { emoji: "🧘", keywords: ["meditate", "calm", "mindful", "breathe"] },
  { emoji: "🏋️", keywords: ["lift", "gym", "strength", "workout"] },
  { emoji: "🍎", keywords: ["health", "snack", "food", "fruit"] },
]

export const EMOJI_POOL = EMOJI_CATALOG.map((item) => item.emoji)

export function getRandomEmoji(): string {
  return EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]
}
