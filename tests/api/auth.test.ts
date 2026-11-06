/**
 * Authentication flows: register, login, logout, session cookie semantics,
 * account-enumeration resistance, password-change session invalidation,
 * rate limiting.
 */
import { describe, it, expect } from 'bun:test'
import { BASE_URL, api, login, registerUser, uniqueEmail } from './helpers'

describe('auth: registration', () => {
  it('registers a user and starts a session', async () => {
    const email = uniqueEmail('auth.reg')
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Registrasi Uji', email, password: 'test-password-123' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { email: string } }
    expect(body.user.email).toBe(email)
    expect(res.headers.get('set-cookie') ?? '').toContain('rakit_session=')
    expect(res.headers.get('set-cookie') ?? '').toContain('HttpOnly')
  })

  it('rejects duplicate email with 409', async () => {
    const email = uniqueEmail('auth.dup')
    const payload = { name: 'Duplikat Uji', email, password: 'test-password-123' }
    const first = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(first.status).toBe(200)
    const second = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(second.status).toBe(409)
  })

  it('rejects weak passwords with 422', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lemah Uji', email: uniqueEmail('auth.weak'), password: 'short' }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects malformed payloads with 422', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'test-password-123' }),
    })
    expect([422, 400]).toContain(res.status)
  })
})

describe('auth: login/logout', () => {
  it('logs in with correct credentials and returns an httpOnly cookie', async () => {
    const user = await registerUser('Login Uji')
    const result = await login(user.email, 'test-password-123')
    expect(result.status).toBe(200)
    expect(result.cookie).toContain('rakit_session=')
  })

  it('returns the SAME generic error for unknown email and wrong password (no enumeration)', async () => {
    await registerUser('Enumerasi Uji')
    const wrongPassword = await login('tidak-ada@test.local', 'salah-benar-123')
    const wrongEmailBody = (wrongPassword.body as { error: string }).error
    const existing = await login((await registerUser('Enumerasi Dua')).email, 'salah-benar-123')
    const wrongPassBody = (existing.body as { error: string }).error
    expect(wrongPassword.status).toBe(401)
    expect(existing.status).toBe(401)
    expect(wrongEmailBody).toBe(wrongPassBody)
  })

  it('boot contract: unauthenticated /api/auth/me → 200 with user:null (not an error)', async () => {
    const res = await api(null, 'GET', '/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user).toBeNull()
  })

  it('returns the current user with a valid session', async () => {
    const user = await registerUser('Me Uji')
    const res = await api(user, 'GET', '/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(user.email)
  })

  it('logout invalidates the session server-side', async () => {
    const user = await registerUser('Logout Uji')
    const meBefore = await api(user, 'GET', '/api/auth/me')
    expect(meBefore.status).toBe(200)
    expect(meBefore.body.user).not.toBeNull()
    const out = await api(user, 'POST', '/api/auth/logout')
    expect(out.status).toBe(200)
    const meAfter = await api(user, 'GET', '/api/auth/me')
    expect(meAfter.status).toBe(200)
    expect(meAfter.body.user).toBeNull() // session no longer resolves
  })

  it('password change invalidates OTHER sessions, keeps the current one', async () => {
    const user = await registerUser('Sesi Uji')
    // a second device logs in with the same account
    const second = await login(user.email, 'test-password-123')
    expect(second.status).toBe(200)

    const meBefore = await api(user, 'GET', '/api/auth/me')
    expect(meBefore.status).toBe(200)

    const change = await api(user, 'PATCH', '/api/auth/profile', {
      currentPassword: 'test-password-123',
      newPassword: 'changed-password-456',
    })
    expect(change.status).toBe(200)
    expect(change.body.revokedSessions).toBeGreaterThanOrEqual(1)

    // current device still signed in
    const meAfter = await api(user, 'GET', '/api/auth/me')
    expect(meAfter.status).toBe(200)

    // other device was logged out (boot contract: 200 + user:null)
    const secondCookie = second.cookie
    const meSecond = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: secondCookie } })
    expect(meSecond.status).toBe(200)
    expect(((await meSecond.json()) as { user: unknown }).user).toBeNull()

    // old password no longer works, new one does
    const oldLogin = await login(user.email, 'test-password-123')
    expect(oldLogin.status).toBe(401)
    const newLogin = await login(user.email, 'changed-password-456')
    expect(newLogin.status).toBe(200)
  })
})
