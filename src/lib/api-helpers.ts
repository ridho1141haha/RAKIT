import { NextRequest, NextResponse } from 'next/server'
import { ZodError, ZodType } from 'zod'

/** Typed API error thrown by handlers; converted to a consistent JSON response. */
export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details)
export const unauthorized = (msg = 'Kamu harus masuk terlebih dahulu.') => new ApiError(401, msg)
export const forbidden = (msg = 'Kamu tidak punya izin untuk aksi ini.') => new ApiError(403, msg)
export const notFound = (msg = 'Data tidak ditemukan.') => new ApiError(404, msg)
export const conflict = (msg: string) => new ApiError(409, msg)

/**
 * Wraps a route handler with consistent error normalization.
 * Usage: export const GET = route(async (req, ctx) => { ... })
 */
export function route<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx) => Promise<NextResponse | Response>,
) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, details: err.details ?? undefined },
          { status: err.status },
        )
      }
      if (err instanceof ZodError) {
        const first = err.issues[0]
        return NextResponse.json(
          {
            error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Input tidak valid.',
            details: err.issues,
          },
          { status: 422 },
        )
      }
      // Unique constraint etc.
      const code = (err as { code?: string }).code
      if (code === 'P2002') {
        return NextResponse.json({ error: 'Data sudah ada (duplikat).' }, { status: 409 })
      }
      if (code === 'P2025') {
        return NextResponse.json({ error: 'Data tidak ditemukan.' }, { status: 404 })
      }
      console.error('[api:unhandled]', err)
      return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 })
    }
  }
}

/** Parse + validate a JSON body against a zod schema. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Body harus berupa JSON yang valid.')
  }
  return schema.parse(raw)
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}
