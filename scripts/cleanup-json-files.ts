import fs from "fs"
import os from "os"
import path from "path"

type ScanResult = {
  path: string
  reason: string
}

const COLOR = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
}

const colorize = (text: string, color: keyof typeof COLOR) => `${COLOR[color]}${text}${COLOR.reset}`

const isForce = process.argv.includes("--force")

const projectRoot = process.cwd()
const devDataDir = path.join(projectRoot, "public", "data")
const prodDataDir = path.join(os.homedir(), ".my-todo-app", "data")

const ignoredFiles = new Set(["package.json", "tsconfig.json", "components.json", "manifest.json"])

const patterns = {
  userJson: /^user-.*\.json$/i,
  settingsJson: /^settings\.json$/i,
  migratedJson: /\.json\.migrated$/i,
  legacyBackup: /^(user-.*\.json|settings\.json)\.bak$/i,
}

const scanDirectory = (dir: string, label: string): ScanResult[] => {
  if (!fs.existsSync(dir)) {
    console.warn(colorize(`[warn] ${label} directory not found: ${dir}`, "yellow"))
    return []
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    console.error(colorize(`[error] Failed to read ${label} directory: ${dir}`, "red"))
    return []
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !ignoredFiles.has(name))
    .filter(
      (name) =>
        patterns.userJson.test(name) ||
        patterns.settingsJson.test(name) ||
        patterns.migratedJson.test(name) ||
        patterns.legacyBackup.test(name),
    )
    .map((name) => ({
      path: path.join(dir, name),
      reason: `${label} match`,
    }))
}

const scanRootFiles = (): ScanResult[] => {
  const candidates = ["data.json", "settings.json"]
  return candidates
    .filter((name) => !ignoredFiles.has(name))
    .map((name) => ({
      path: path.join(projectRoot, name),
      reason: "root match",
    }))
    .filter((entry) => fs.existsSync(entry.path))
}

const candidates = [
  ...scanDirectory(devDataDir, "development"),
  ...scanDirectory(prodDataDir, "production"),
  ...scanRootFiles(),
]

if (candidates.length === 0) {
  console.log(colorize("[info] No legacy JSON files found.", "blue"))
  process.exit(0)
}

console.log(colorize(`[info] ${isForce ? "Deleting" : "Found"} ${candidates.length} legacy JSON file(s).`, "blue"))

let deleted = 0
let errors = 0

candidates.forEach((entry) => {
  if (!isForce) {
    console.log(colorize(`[dry-run] ${entry.path} (${entry.reason})`, "yellow"))
    return
  }

  try {
    fs.unlinkSync(entry.path)
    deleted += 1
    console.log(colorize(`[deleted] ${entry.path}`, "green"))
  } catch (error) {
    errors += 1
    console.error(colorize(`[error] Failed to delete ${entry.path}`, "red"))
  }
})

const summary = [
  `found=${candidates.length}`,
  `deleted=${deleted}`,
  `errors=${errors}`,
  `mode=${isForce ? "force" : "dry-run"}`,
]
console.log(colorize(`[summary] ${summary.join(" ")}`, errors > 0 ? "red" : "blue"))
