import { NextResponse } from "next/server"
import { getDatabase } from "@/lib/db/connection"

type CategoryDiagnosticRow = {
  id: string
  name: string
  color: string
  project_type: string | null
  daily_goal_hours: number | null
  sort_order: number | null
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const token = process.env.DB_HEALTH_TOKEN
    if (!token) {
      return NextResponse.json({ error: "Diagnostics not available" }, { status: 403 })
    }
    const headerToken =
      request.headers.get("x-db-health-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (headerToken !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const db = await getDatabase()
    const categories = (await db.all(
      "SELECT id, name, color, project_type, daily_goal_hours, sort_order FROM categories ORDER BY sort_order ASC",
    )) as CategoryDiagnosticRow[]
    return NextResponse.json({
      count: categories.length,
      categories,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      {
        error: "Failed to fetch diagnostic categories.",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
