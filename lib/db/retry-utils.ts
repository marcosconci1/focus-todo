export function computeBackoffMs(baseMs: number, attempt: number, jitterMs: number): number {
  const backoff = baseMs * Math.pow(2, Math.max(0, attempt - 1))
  return backoff + Math.random() * jitterMs
}

export function shouldOpenCircuitBreaker(failureCount: number, threshold: number): boolean {
  return failureCount >= threshold
}

export function getCircuitBreakerUntil(nowMs: number, windowMs: number): number {
  return nowMs + windowMs
}
