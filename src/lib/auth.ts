import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, unauthorized } from '@/lib/api-helpers'

const SESSION_COOKIE = 'rakit_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days
const SCRYPT_KEYLEN = 64

// ─── Passwords (scrypt — no native deps) ─────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(':')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, SCRYPT_KEYLEN)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
  }
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

export type SessionUser = {
  id: string
  email: string
  name: string
  avatarColor: string
  onboardedAt: Date | null
}

/** Returns the signed-in user or null (never throws). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    avatarColor: session.user.avatarColor,
    onboardedAt: session.user.onboardedAt,
  }
}

/** Returns the signed-in user or throws 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw unauthorized()
  return user
}

// ─── Rate limiting (in-memory, per IP + bucket) ──────────────────────────────

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function rateLimit(
  req: NextRequest,
  bucket: string,
  limit = 10,
  windowMs = 60_000,
): void {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  entry.count += 1
  if (entry.count > limit) {
    const retry = Math.ceil((entry.resetAt - now) / 1000)
    throw new ApiError(429, `Terlalu banyak percobaan. Coba lagi dalam ${retry} detik.`)
  }
}
