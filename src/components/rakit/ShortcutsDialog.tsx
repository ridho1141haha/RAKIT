'use client'

import { useRakit } from '@/components/rakit/store'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: 'Umum',
    items: [
      { keys: ['/'], label: 'Buka pencarian global' },
      { keys: ['⌘', 'K'], label: 'Buka command palette' },
      { keys: ['?'], label: 'Tampilkan pintasan ini' },
      { keys: ['Esc'], label: 'Tutup dialog terbuka' },
    ],
  },
  {
    title: 'Buat cepat',
    items: [
      { keys: ['C'], label: 'Tugas baru' },
      { keys: ['N'], label: 'Ide baru' },
    ],
  },
  {
    title: 'Navigasi (tekan G lalu tombol)',
    items: [
      { keys: ['G', 'D'], label: 'Buka Ikhtisar (dashboard)' },
      { keys: ['G', 'T'], label: 'Buka Tugas Saya' },
      { keys: ['G', 'I'], label: 'Buka Inbox Ide' },
      { keys: ['G', 'P'], label: 'Buka daftar Proyek' },
    ],
  },
]

export function ShortcutsDialog() {
  const overlay = useRakit((s) => s.overlay)
  const closeOverlay = useRakit((s) => s.closeOverlay)
  const open = overlay.kind === 'shortcuts'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeOverlay()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Pintasan Keyboard</DialogTitle>
          <DialogDescription>
            Pintasan tidak aktif saat kamu sedang mengetik di kolom teks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="kicker mb-2">{g.title}</p>
              <div className="space-y-1.5">
                {g.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="flex gap-1">
                      {item.keys.map((k) => (
                        <kbd key={k} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
