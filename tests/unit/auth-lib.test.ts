/**
 * Unit tests for auth primitives (no server, no database).
 * Covers scrypt password hashing round-trips and the in-memory rate limiter.
 */
import { describe, it, expect } from 'bun:test'
import { hashPassword, verifyPassword, rateLimit } from '../../src/lib/auth'
import type { NextRequest } from 'next/server'

function fakeRequest(ip?: string): NextRequest {
  const headers = new Headers()
  if (ip) headers.set('x-forwarded-for', ip)
  return new Request('http://localhost/api/test', { headers }) as unknown as NextRequest
}

describe('password hashing (scrypt)', () => {
  it('hashes and verifies correctly', () => {
    const hash = hashPassword('kata-sandi-rahasia-123')
    expect(hash.startsWith('scrypt:')).toBe(true)
    expect(verifyPassword('kata-sandi-rahasia-123', hash)).toBe(true)
    expect(verifyPassword('kata-sandi-salah', hash)).toBe(false)
  })

  it('produces a unique salt per hash (no rainbow-table reuse)', () => {
    expect(hashPassword('sama')).not.toBe(hashPassword('sama'))
  })

  it('never throws on malformed stored hashes — returns false', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'plaintext')).toBe(false)
    expect(verifyPassword('x', 'md5:deadbeef')).toBe(false)
    expect(verifyPassword('x', 'scrypt:zz:not-hex')).toBe(false)
  })
})

describe('in-memory rate limiter', () => {
  it('allows requests under the limit, then throws 429 with retry hint', () => {
    const bucket = `unit-${Math.random()}`
    for (let i = 0; i < 3; i++) {
      expect(() => rateLimit(fakeRequest('10.0.0.1'), bucket, 3, 60_000)).not.toThrow()
    }
    expect(() => rateLimit(fakeRequest('10.0.0.1'), bucket, 3, 60_000)).toThrow(
      /Terlalu banyak percobaan/,
    )
  })

  it('tracks clients independently (per IP)', () => {
    const bucket = `unit-ip-${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(() => rateLimit(fakeRequest('10.0.1.1'), bucket, 5, 60_000)).not.toThrow()
    }
    expect(() => rateLimit(fakeRequest('10.0.1.1'), bucket, 5, 60_000)).toThrow()
    // a different IP is unaffected
    expect(() => rateLimit(fakeRequest('10.0.1.2'), bucket, 5, 60_000)).not.toThrow()
  })

  it('window expiry resets the counter', async () => {
    const bucket = `unit-window-${Math.random()}`
    for (let i = 0; i < 2; i++) rateLimit(fakeRequest('10.0.2.1'), bucket, 2, 30)
    expect(() => rateLimit(fakeRequest('10.0.2.1'), bucket, 2, 30)).toThrow()
    await new Promise((r) => setTimeout(r, 60))
    expect(() => rateLimit(fakeRequest('10.0.2.1'), bucket, 2, 30)).not.toThrow()
  })

  it('honours the explicit disable switch (tests / load balancers)', () => {
    process.env.RATE_LIMIT_DISABLED = '1'
    try {
      const bucket = `unit-off-${Math.random()}`
      for (let i = 0; i < 50; i++) {
        expect(() => rateLimit(fakeRequest('10.0.3.1'), bucket, 1, 60_000)).not.toThrow()
      }
    } finally {
      delete process.env.RATE_LIMIT_DISABLED
    }
  })
})
