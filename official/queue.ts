export const DEFAULT_FLUSH_INTERVAL_MS = 3000

export type QueueItem = {
  url: string
  batchKey?: string
  data: unknown
}

export type BatchedRequest = {
  url: string
  batchKey?: string
  data: unknown[]
}

export function clampFlushInterval(value: unknown): number {
  const fallback = DEFAULT_FLUSH_INTERVAL_MS
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  if (value > 5000) {
    return 5000
  }
  if (value < 250) {
    return 250
  }
  return value
}

export function formatQueue(items: QueueItem[]): Record<string, BatchedRequest> {
  const requests: Record<string, BatchedRequest> = {}
  for (const req of items) {
    const key = req.batchKey || req.url
    if (requests[key] === undefined) {
      requests[key] = { url: req.url, batchKey: req.batchKey, data: [] }
    }
    requests[key].data.push(req.data)
  }
  return requests
}

export function applyOffsets(
  data: Array<Record<string, unknown>>,
  now: number,
): Array<Record<string, unknown>> {
  return data.map((item) => {
    const next = { ...item }
    if (typeof next.timestamp === 'number') {
      next.offset = Math.abs((next.timestamp as number) - now)
      delete next.timestamp
    }
    return next
  })
}

export function sortUnloadRequests<T extends { url: string }>(requests: T[]): T[] {
  return [
    ...requests.filter((request) => request.url.indexOf('/e') === 0),
    ...requests.filter((request) => request.url.indexOf('/e') !== 0),
  ]
}
