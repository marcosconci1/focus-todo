import fs from "fs"
import path from "path"
import { execFile, spawn } from "child_process"
import { promisify } from "util"
import { getDatabase, closeDatabase } from "@/lib/db/connection"
import { logDbError } from "@/lib/db/errors"

type BackupOptions = {
  backupPath?: string
  reason?: string
}

let lastBackupAt: string | null = null
let lastBackupPath: string | null = null
const execFileAsync = promisify(execFile)

const resolveDbPath = () => {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.HOME) {
      throw new Error("HOME environment variable is not set")
    }
    return path.join(process.env.HOME ?? "", ".focus-todo", "focus-todo.db")
  }
  return path.join(process.cwd(), "public", "data", "focus-todo.db")
}

export function getLastBackupInfo(): { lastBackupAt: string | null; lastBackupPath: string | null } {
  return { lastBackupAt, lastBackupPath }
}

export async function checkDatabaseIntegrity(): Promise<{ isValid: boolean; errors: string[] }> {
  const db = await getDatabase()
  const results = (await db.all("PRAGMA integrity_check(10)")) as Array<{ integrity_check: string }>
  const errors = results.map((row) => row.integrity_check).filter((value) => value !== "ok")
  return { isValid: errors.length === 0, errors }
}

export async function createBackup(options: BackupOptions = {}): Promise<{ path: string; createdAt: string }> {
  const db = await getDatabase()
  const dbPath = resolveDbPath()
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = options.backupPath ?? `${dbPath}.backup-${timestamp}.db`
  try {
    await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
    const escaped = backupPath.replace(/'/g, "''")
    await db.exec(`VACUUM INTO '${escaped}'`)
    lastBackupAt = new Date().toISOString()
    lastBackupPath = backupPath
    return { path: backupPath, createdAt: lastBackupAt }
  } catch (error) {
    logDbError("createBackup", error, { backupPath, reason: options.reason })
    throw error
  }
}

export async function restoreFromBackup(backupPath: string): Promise<void> {
  const dbPath = resolveDbPath()
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }
  const backupStat = await fs.promises.stat(backupPath)
  if (!backupStat.isFile()) {
    throw new Error(`Backup path is not a file: ${backupPath}`)
  }
  const header = await readFileHeader(backupPath, 16)
  if (!header || !header.equals(Buffer.from("SQLite format 3\0"))) {
    throw new Error("Backup file does not look like a valid SQLite database")
  }
  await closeDatabase()
  await fs.promises.copyFile(backupPath, dbPath)
}

export async function repairDatabase(): Promise<boolean> {
  try {
    const integrity = await checkDatabaseIntegrity()
    if (integrity.isValid) {
      return true
    }
    const dbPath = resolveDbPath()
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const recoveredPath = `${dbPath}.recovered-${timestamp}.db`
    try {
      await closeDatabase()
      const { stdout } = await execFileAsync("sqlite3", [dbPath, ".recover"])
      await importSql(recoveredPath, stdout)
      await fs.promises.copyFile(recoveredPath, dbPath)
      await fs.promises.unlink(recoveredPath).catch(() => {})
    } catch (recoverError) {
      logDbError("repairDatabase.recover", recoverError, { dbPath })
      await optimizeDatabase()
    }
    const recheck = await checkDatabaseIntegrity()
    return recheck.isValid
  } catch (error) {
    logDbError("repairDatabase", error)
    return false
  }
}

export async function optimizeDatabase(): Promise<void> {
  const db = await getDatabase()
  await db.exec("VACUUM")
  await db.exec("ANALYZE")
}

export async function autoBackupIfNeeded(
  operation: "schema" | "large-delete",
  affectedRows?: number,
  threshold = 1000
): Promise<void> {
  try {
    if (operation === "schema") {
      await createBackup({ reason: "schema-change" })
      return
    }
    if (operation === "large-delete" && affectedRows !== undefined && affectedRows >= threshold) {
      await createBackup({ reason: "large-delete" })
    }
  } catch (error) {
    logDbError("autoBackupIfNeeded", error, { operation })
  }
}

async function readFileHeader(filePath: string, length: number): Promise<Buffer | null> {
  const fileHandle = await fs.promises.open(filePath, "r").catch(() => null)
  if (!fileHandle) {
    return null
  }
  try {
    const buffer = Buffer.alloc(length)
    await fileHandle.read(buffer, 0, length, 0)
    return buffer
  } finally {
    await fileHandle.close().catch(() => {})
  }
}

function importSql(dbPath: string, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [dbPath], { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr || `sqlite3 exited with code ${code}`))
    })
    child.stdin.write(sql)
    child.stdin.end()
  })
}
