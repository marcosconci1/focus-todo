import { NextResponse } from "next/server"
import { formatMetricsPrometheus, getMetricsSnapshot } from "@/lib/db/metrics"

export async function GET(request: Request) {
  const snapshot = getMetricsSnapshot()
  const url = new URL(request.url)
  const format = url.searchParams.get("format")
  if (format === "prometheus") {
    return new NextResponse(formatMetricsPrometheus(snapshot), {
      status: 200,
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    })
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(snapshot)
}
