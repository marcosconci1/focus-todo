import crypto from "crypto"

const rawSecret = process.env.COOKIE_SECRET
if (process.env.NODE_ENV === "production" && !rawSecret) {
  throw new Error("COOKIE_SECRET must be set in production to encrypt Google tokens")
}

// In non-production, derive a per-process secret instead of shipping a reusable fallback.
const effectiveSecret = rawSecret ?? crypto.randomBytes(32).toString("hex")
const KEY = Buffer.from(crypto.hkdfSync("sha256", effectiveSecret, "", "google-token-encryption", 32))

/**
 * Encrypts Google OAuth tokens for database storage.
 * Used by the google-tokens repository before persisting credentials.
 */
export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Decrypts Google OAuth tokens retrieved from the database.
 * Used by the google-tokens repository when loading credentials.
 */
export function decryptToken(encryptedData: string): string | null {
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(":")
    if (!ivHex || !authTagHex || !encryptedHex) return null
    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")
    const encrypted = Buffer.from(encryptedHex, "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString("utf8")
  } catch (error) {
    console.error("Failed to decrypt Google token:", error)
    return null
  }
}
