import { NextResponse } from "next/server"
import { getDbLogger } from "@/lib/db/logger"

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const logs = getDbLogger().getEntries()
  return NextResponse.json({ logs })
}
