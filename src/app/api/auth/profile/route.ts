import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, route } from '@/lib/api-helpers'
import { hashPassword, requireUser, verifyPassword, invalidateOtherSessions } from '@/lib/auth'
import { AVATAR_COLORS } from '@/lib/constants'

const schema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(60).optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Warna tidak valid.').optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter.').max(72).optional(),
})

export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser()
  const body = await parseBody(req, schema)

  const data: { name?: string; avatarColor?: string; passwordHash?: string } = {}
  if (body.name !== undefined) data.name = body.name
  if (body.avatarColor !== undefined) {
    if (!AVATAR_COLORS.includes(body.avatarColor) && !/^#[0-9A-Fa-f]{6}$/.test(body.avatarColor)) {
      throw new ApiError(400, 'Warna avatar tidak didukung.')
    }
    data.avatarColor = body.avatarColor
  }
  if (body.newPassword) {
    if (!body.currentPassword) throw new ApiError(400, 'Masukkan kata sandi saat ini.')
    const full = await db.user.findUnique({ where: { id: user.id } })
    if (!full || !verifyPassword(body.currentPassword, full.passwordHash)) {
      throw new ApiError(400, 'Kata sandi saat ini salah.')
    }
    data.passwordHash = hashPassword(body.newPassword)
  }

  const updated = await db.user.update({ where: { id: user.id }, data })

  // Password change → other devices' sessions are invalidated (the current
  // device stays signed in). Session tokens are hashed at rest, so revocation
  // is the only reliable lever.
  let revokedSessions: number | undefined
  if (data.passwordHash) {
    revokedSessions = await invalidateOtherSessions(user.id)
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarColor: updated.avatarColor,
      onboardedAt: updated.onboardedAt,
    },
    ...(revokedSessions !== undefined ? { revokedSessions } : {}),
  })
})
