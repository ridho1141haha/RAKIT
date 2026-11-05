'use client'

// ─── SettingsView: profile, password, appearance, locale, current workspace ──

import * as React from 'react'
import { useRakit, useMyRole } from '@/components/rakit/store'
import { apiPatch, ApiClientError } from '@/components/rakit/api-client'
import { Masthead, SectionHeading, UserAvatar } from '@/components/rakit/ui-primitives'
import { ROLE_LABEL } from '@/lib/constants'
import { AVATAR_COLORS } from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Monitor, Moon, Sun } from 'lucide-react'

export function SettingsView() {
  const me = useRakit((s) => s.user)
  const refreshMe = useRakit((s) => s.refreshMe)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const workspace = useRakit((s) => s.currentWorkspace())
  const myRole = useMyRole()
  const { theme, setTheme } = useTheme()

  // ── profil ──
  const [name, setName] = React.useState(me?.name ?? '')
  const [avatarColor, setAvatarColor] = React.useState(me?.avatarColor ?? AVATAR_COLORS[0])
  const [savingProfile, setSavingProfile] = React.useState(false)

  // ── kata sandi ──
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [passwordError, setPasswordError] = React.useState<string | null>(null)
  const [savingPassword, setSavingPassword] = React.useState(false)

  const profileDirty = name.trim() !== (me?.name ?? '') || avatarColor !== me?.avatarColor

  async function saveProfile() {
    if (!me) return
    setSavingProfile(true)
    try {
      await apiPatch('/api/auth/profile', { name: name.trim(), avatarColor })
      toast({ title: 'Profil diperbarui', description: 'Nama dan warna avatar Anda sudah disimpan.' })
      await refreshMe()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan profil',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword() {
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak sama.')
      return
    }
    setSavingPassword(true)
    try {
      await apiPatch('/api/auth/profile', { currentPassword, newPassword })
      toast({ title: 'Kata sandi diperbarui', description: 'Gunakan kata sandi baru pada login berikutnya.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (e) {
      setPasswordError(e instanceof ApiClientError ? e.message : 'Gagal memperbarui kata sandi.')
    } finally {
      setSavingPassword(false)
    }
  }

  const themeOptions = [
    { value: 'light', label: 'Terang', icon: Sun },
    { value: 'dark', label: 'Gelap', icon: Moon },
    { value: 'system', label: 'Sistem', icon: Monitor },
  ] as const

  return (
    <div>
      <Masthead
        kicker="Pribadi"
        title="Pengaturan"
        description="Preferensi akun, tampilan, dan workspace yang sedang aktif."
      />

      <div className="max-w-2xl">
        {/* ── PROFIL ── */}
        <section className="pb-8">
          <SectionHeading>PROFIL</SectionHeading>
          <div className="flex items-center gap-4">
            <UserAvatar user={{ name: name.trim() || me?.name || '?', avatarColor }} size={64} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="set-name">Nama</Label>
                <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Anda" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-email">Email</Label>
                <Input id="set-email" value={me?.email ?? ''} disabled readOnly className="font-mono text-xs" />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>Warna avatar</Label>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Warna avatar">
              {AVATAR_COLORS.map((c) => {
                const selected = c === avatarColor
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Warna ${c}`}
                    onClick={() => setAvatarColor(c)}
                    className={`size-7 rounded-full transition-shadow ${selected ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:ring-2 hover:ring-border hover:ring-offset-2 hover:ring-offset-background'}`}
                    style={{ backgroundColor: c }}
                  />
                )
              })}
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={() => void saveProfile()} disabled={savingProfile || !profileDirty || name.trim().length < 2}>
              {savingProfile ? <Loader2 className="size-4 animate-spin" /> : null}
              Simpan Profil
            </Button>
          </div>
        </section>

        {/* ── KATA SANDI ── */}
        <section className="border-t border-border py-8">
          <SectionHeading>KATA SANDI</SectionHeading>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-pass-current">Kata sandi saat ini</Label>
              <Input
                id="set-pass-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="set-pass-new">Kata sandi baru</Label>
                <Input
                  id="set-pass-new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-pass-confirm">Ulangi kata sandi baru</Label>
                <Input
                  id="set-pass-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            {passwordError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{passwordError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Minimal 8 karakter. Gunakan kombinasi yang mudah Anda ingat.</p>
            )}
            <Button
              variant="outline"
              onClick={() => void savePassword()}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? <Loader2 className="size-4 animate-spin" /> : null}
              Ubah Kata Sandi
            </Button>
          </div>
        </section>

        {/* ── TAMPILAN ── */}
        <section className="border-t border-border py-8">
          <SectionHeading>TAMPILAN</SectionHeading>
          <div className="flex items-center border-b border-border" role="radiogroup" aria-label="Tema tampilan">
            {themeOptions.map((t) => {
              const Icon = t.icon
              const active = (theme ?? 'system') === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-active={active}
                  className="tab-ed inline-flex items-center gap-1.5"
                  onClick={() => setTheme(t.value)}
                >
                  <Icon className="size-3.5" aria-hidden /> {t.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Mode Sistem mengikuti preferensi perangkat Anda.</p>
        </section>

        {/* ── BAHASA & WAKTU ── */}
        <section className="border-t border-border py-8">
          <SectionHeading>BAHASA & WAKTU</SectionHeading>
          <div className="divide-y divide-border rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm">Bahasa</span>
              <span className="font-mono text-xs text-muted-foreground">Indonesia (id-ID)</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm">Zona waktu</span>
              <span className="font-mono text-xs text-muted-foreground">Asia/Jakarta (WIB)</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Dukungan i18n direncanakan untuk rilis berikutnya.</p>
        </section>

        {/* ── WORKSPACE SAAT INI ── */}
        <section className="border-t border-border py-8">
          <SectionHeading>WORKSPACE SAAT INI</SectionHeading>
          <div className="rounded-lg border border-border p-4">
            <p className="font-display text-lg font-semibold">{workspace?.name ?? '—'}</p>
            {workspace?.description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{workspace.description}</p>
            ) : null}
            <p className="kicker mt-2 text-[10px]">
              Peran Anda: {myRole ? (ROLE_LABEL[myRole] ?? myRole) : '—'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate({ name: 'members' })}>
                Kelola anggota
              </Button>
              <Button variant="outline" size="sm" onClick={() => openOverlay({ kind: 'workspace-create' })}>
                Ganti workspace
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
