import { NextResponse } from "next/server"
import { initializeDb } from "@/lib/storage"
import { get as getMetadata } from "@/lib/db/repositories/metadata"

const formatLabel = (value?: string): string => {
  if (!value) return "sqlite"
  return `sqlite-${value.replace(/[^0-9]/g, "")}`
}

export async function GET() {
  try {
    await initializeDb()
    const metadata = await getMetadata()
    const label = formatLabel(metadata.createdAt)
    return NextResponse.json([label])
  } catch (error) {
    console.error("Failed to list data entries:", error)
    return NextResponse.json({ error: "Failed to list data entries" }, { status: 500 })
  }
}
