import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import test, { afterEach } from "node:test"
import { GET as getHealthRoute } from "../app/api/db/health/route"
import { closeDatabase, resetDatabase } from "../lib/db/connection"
import { get as getMetadata, updateMetadata } from "../lib/db/repositories/metadata"
import { createBackup, restoreFromBackup } from "../lib/db/recovery"

afterEach(async () => {
  await closeDatabase()
  delete process.env.DB_HEALTH_TOKEN
  process.env.NODE_ENV = "test"
})

test("restoreFromBackup accepts a valid backup outside the database directory", async () => {
  await resetDatabase()

  const originalMetadata = await getMetadata()
  const backupPath = path.join(os.tmpdir(), `focus-todo-restore-test-${Date.now()}.db`)

  try {
    await createBackup({ backupPath, reason: "test" })
    await updateMetadata({
      lastResetDate: "2099-12-31",
      version: "9.9.9",
      createdAt: originalMetadata.createdAt,
    })

    await restoreFromBackup(backupPath)

    const restoredMetadata = await getMetadata()
    assert.equal(restoredMetadata.version, originalMetadata.version)
    assert.equal(restoredMetadata.lastResetDate, originalMetadata.lastResetDate ?? null)
  } finally {
    await fs.promises.unlink(backupPath).catch(() => {})
  }
})

test("db health route requires auth in production", async () => {
  await resetDatabase()
  process.env.NODE_ENV = "production"
  process.env.DB_HEALTH_TOKEN = "secret-token"

  const unauthorizedResponse = await getHealthRoute(new Request("http://localhost/api/db/health"))
  assert.equal(unauthorizedResponse.status, 401)

  const authorizedResponse = await getHealthRoute(
    new Request("http://localhost/api/db/health", {
      headers: {
        "x-db-health-token": "secret-token",
      },
    }),
  )

  assert.equal(authorizedResponse.status, 200)
})
