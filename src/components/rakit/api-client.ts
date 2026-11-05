'use client'

/** Tiny typed fetch wrapper for the RAKIT API. Throws ApiClientError on !ok. */

export class ApiClientError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: 'no-store',
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body
  }
  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ?? `Permintaan gagal (${res.status}).`
    throw new ApiClientError(res.status, message, (data as { details?: unknown })?.details)
  }
  return data as T
}

export const apiGet = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal })
export const apiPost = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })
export const apiPatch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body })
export const apiDelete = <T,>(path: string) => api<T>(path, { method: 'DELETE' })
