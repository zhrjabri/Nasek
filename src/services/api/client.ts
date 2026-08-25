/**
 * Mock transport layer.
 *
 * Every data call in the app goes through `request()`, which adds realistic
 * latency and can be told to fail. That keeps the loading and error states in
 * the UI honest — they are exercised on every page load, not just written and
 * forgotten. Replacing this file with `fetch` calls to a real API is the only
 * change the rest of the app needs.
 */

export interface RequestOptions {
  /** Override the simulated round-trip time. */
  latencyMs?: number
  /** Force a failure — used by the "try again" demo in the error state. */
  fail?: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Between 180 ms and 520 ms — fast enough to feel local, slow enough to see. */
function defaultLatency() {
  return 180 + Math.random() * 340
}

export async function request<T>(produce: () => T, options: RequestOptions = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, options.latencyMs ?? defaultLatency()))
  if (options.fail) throw new ApiError('Simulated network failure', 503)
  return produce()
}

/** Storage helpers used by the client-side persistence layer. */
export const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  write(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota or private mode — the prototype degrades to in-memory state.
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}
