declare module "sqlite-async" {
  import type { EventEmitter } from "events"

  interface RunResult {
    lastID: number
    changes: number
  }

  class Statement {
    bind(...params: unknown[]): Promise<Statement>
    reset(): Promise<Statement>
    finalize(): Promise<void>
    run(...params: unknown[]): Promise<RunResult>
    get(...params: unknown[]): Promise<unknown>
    all(...params: unknown[]): Promise<unknown[]>
  }

  class Database extends EventEmitter {
    static open(filename: string): Promise<Database>
    close(): Promise<void>
    run(sql: string, ...params: unknown[]): Promise<RunResult>
    get(sql: string, ...params: unknown[]): Promise<unknown>
    all(sql: string, ...params: unknown[]): Promise<unknown[]>
    exec(sql: string): Promise<void>
    transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  export { Database, Statement, RunResult }
}
