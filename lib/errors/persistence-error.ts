export class PersistenceError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
    public readonly code?: string | null,
    public readonly retryable?: boolean | null,
    public readonly requestId?: string | null
  ) {
    super(message)
    Object.setPrototypeOf(this, PersistenceError.prototype)
    this.name = 'PersistenceError'
  }
}
