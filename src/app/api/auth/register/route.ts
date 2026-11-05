import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { createSession, hashPassword, rateLimit } from '@/lib/auth'
import { AVATAR_COLORS } from '@/lib/constants'

const schema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60),
  email: z.string().trim().toLowerCase().email('Format email tidak valid.'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(72),
})

export const POST = route(async (req: NextRequest) => {
  rateLimit(req, 'register', 8, 60_000)
  const body = await parseBody(req, schema)

  const existing = await db.user.findUnique({ where: { email: body.email } })
  if (existing) throw new ApiError(409, 'Email ini sudah terdaftar. Silakan masuk.')

  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash: hashPassword(body.password),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    },
  })

  await createSession(user.id)
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, avatarColor: user.avatarColor, onboardedAt: null },
  })
})
