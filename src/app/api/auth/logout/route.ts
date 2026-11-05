import { NextResponse } from 'next/server'
import { route } from '@/lib/api-helpers'
import { destroySession } from '@/lib/auth'

export const POST = route(async () => {
  await destroySession()
  return NextResponse.json({ ok: true })
})
