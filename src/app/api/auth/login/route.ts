import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { createSession, rateLimit, verifyPassword } from '@/lib/auth'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Format email tidak valid.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
})

export const POST = route(async (req: NextRequest) => {
  rateLimit(req, 'login', 10, 60_000)
  const body = await parseBody(req, schema)

  const user = await db.user.findUnique({ where: { email: body.email } })
  // Same error for unknown email / wrong password — no account enumeration.
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw new ApiError(401, 'Email atau kata sandi salah.')
  }

  await createSession(user.id)
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarColor: user.avatarColor,
      onboardedAt: user.onboardedAt,
    },
  })
})
