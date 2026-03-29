import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

type DbContext = {
  operation?: string
}

const storage = new AsyncLocalStorage<DbContext>()

export function withDbContext<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ operation }, fn)
}

export function getDbContext(): DbContext {
  return storage.getStore() ?? {}
}
