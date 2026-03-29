import crypto from "crypto"
import fs from "fs"
import path from "path"
import type { NextApiRequest, NextApiResponse } from "next"

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add authentication check
  const apiKey = req.headers['x-api-key']
  const expectedKey = process.env.API_KEY
  if (
    !apiKey ||
    !expectedKey ||
    typeof apiKey !== "string" ||
    apiKey.length !== expectedKey.length ||
    !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))
  ) {
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    const content = req.body
    if (typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "Invalid content: expected non-empty string" })
      return
    }
    const filePath = path.join(process.cwd(), "public", "reality-checks.txt")
    fs.writeFileSync(filePath, content.trim(), "utf-8")
    res.status(200).json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save reality checks"
    res.status(500).json({ error: message })
  }
}
