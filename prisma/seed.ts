/**
 * RAKIT seed — realistic demo data (Indonesian).
 * Run: bun prisma/seed.ts
 * Demo login: demo@rakit.id / demo123
 *
 * SAFETY: this script DELETES every row in the database before reseeding.
 * It is meant for local development with demo data only. It refuses to run
 * when NODE_ENV=production unless SEED_DEMO=1 is set explicitly — production
 * databases must never be silently replaced with shared demo accounts.
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const now = Date.now()
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now - n * 24 * 60 * 60 * 1000)
  d.setHours(hour, 0, 0, 0)
  return d
}
const daysAhead = (n: number, hour = 17) => {
  const d = new Date(now + n * 24 * 60 * 60 * 1000)
  d.setHours(hour, 0, 0, 0)
  return d
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== '1') {
    console.error(
      '[seed] Refusing to run: NODE_ENV=production. The seed DELETES all data and\n' +
        'creates shared demo accounts (demo@rakit.id / demo123 — public credentials).\n' +
        'If you really intend to seed a production database, run with SEED_DEMO=1.',
    )
    process.exit(1)
  }

  // ── clean slate (FK-safe order) ──────────────────────────────────────────
  await db.notification.deleteMany()
  await db.activityEvent.deleteMany()
  await db.taskLabel.deleteMany()
  await db.checklistItem.deleteMany()
  await db.taskComment.deleteMany()
  await db.task.deleteMany()
  await db.milestone.deleteMany()
  await db.document.deleteMany()
  await db.projectMember.deleteMany()
  await db.project.deleteMany()
  await db.idea.deleteMany()
  await db.label.deleteMany()
  await db.invitation.deleteMany()
  await db.workspaceMember.deleteMany()
  await db.workspace.deleteMany()
  await db.session.deleteMany()
  await db.user.deleteMany()

  // ── users ────────────────────────────────────────────────────────────────
  const demo = await db.user.create({
    data: {
      email: 'demo@rakit.id',
      name: 'Demo Pratama',
      passwordHash: hashPassword('demo123'),
      avatarColor: '#D9481F',
      onboardedAt: daysAgo(40),
    },
  })
  const sari = await db.user.create({
    data: { email: 'sari@rakit.id', name: 'Sari Wulandari', passwordHash: hashPassword('demo123'), avatarColor: '#2F7D4F', onboardedAt: daysAgo(38) },
  })
  const budi = await db.user.create({
    data: { email: 'budi@rakit.id', name: 'Budi Santoso', passwordHash: hashPassword('demo123'), avatarColor: '#3E6B7E', onboardedAt: daysAgo(35) },
  })
  const rina = await db.user.create({
    data: { email: 'rina@rakit.id', name: 'Rina Kusuma', passwordHash: hashPassword('demo123'), avatarColor: '#7A4A6B', onboardedAt: daysAgo(30) },
  })

  // ── workspace: Studio Nusantara ──────────────────────────────────────────
  const studio = await db.workspace.create({
    data: {
      name: 'Studio Nusantara',
      description: 'Studio kecil untuk proyek digital klien dan produk mandiri.',
      ownerId: demo.id,
      members: {
        create: [
          { userId: demo.id, role: 'OWNER', createdAt: daysAgo(40) },
          { userId: sari.id, role: 'ADMIN', createdAt: daysAgo(38) },
          { userId: budi.id, role: 'MEMBER', createdAt: daysAgo(35) },
          { userId: rina.id, role: 'MEMBER', createdAt: daysAgo(30) },
        ],
      },
      labels: {
        create: [
          { name: 'Desain', color: '#B9541B' },
          { name: 'Frontend', color: '#3E6B7E' },
          { name: 'Backend', color: '#2F7D4F' },
          { name: 'Konten', color: '#8A6D2F' },
          { name: 'Riset', color: '#7A4A6B' },
        ],
      },
    },
  })
  const labelMap = Object.fromEntries(
    (await db.label.findMany({ where: { workspaceId: studio.id } })).map((l) => [l.name, l.id]),
  )

  // ── project 1: Kopi Sela (aktif) ─────────────────────────────────────────
  const kopi = await db.project.create({
    data: {
      workspaceId: studio.id,
      name: 'Peluncuran Website Kopi Sela',
      description:
        'Website profil dan pre-order untuk kedai kopi Sela Bandung. Target: online sebelum grand opening akhir bulan.',
      color: '#B9541B',
      status: 'ACTIVE',
      priority: 'HIGH',
      startDate: daysAgo(18),
      targetDate: daysAhead(9),
      ownerId: demo.id,
      members: {
        create: [
          { userId: demo.id, role: 'LEAD' },
          { userId: sari.id, role: 'MEMBER' },
          { userId: budi.id, role: 'MEMBER' },
        ],
      },
      createdAt: daysAgo(18),
    },
  })
  const kopiMs = await Promise.all([
    db.milestone.create({ data: { projectId: kopi.id, name: 'Desain disetujui klien', description: 'Seluruh halaman utama lolos review klien.', targetDate: daysAgo(8), completed: true, completedAt: daysAgo(7) } }),
    db.milestone.create({ data: { projectId: kopi.id, name: 'Sebelum beta internal', description: 'Semua halaman bisa diakses di staging.', targetDate: daysAhead(3) } }),
    db.milestone.create({ data: { projectId: kopi.id, name: 'Grand opening', description: 'Website live bersamaan dengan buka kedai.', targetDate: daysAhead(9) } }),
  ])

  const kopiTasks = [
    { title: 'Riset kompetitor kedai kopi lokal', status: 'DONE', priority: 'MEDIUM', assignee: rina.id, labels: ['Riset'], due: -12, done: -12, estimate: 4 },
    { title: ' Moodboard & arah visual brand', title_: 'Moodboard & arah visual brand', status: 'DONE', priority: 'HIGH', assignee: sari.id, labels: ['Desain'], due: -9, done: -8, estimate: 6 },
    { title: 'Desain halaman beranda (desktop + mobile)', status: 'DONE', priority: 'HIGH', assignee: sari.id, labels: ['Desain'], due: -5, done: -5, estimate: 8 },
    { title: 'Desain halaman menu & profil kedai', status: 'IN_REVIEW', priority: 'HIGH', assignee: sari.id, labels: ['Desain'], due: -1, estimate: 6 },
    { title: 'Setup Next.js + CMS untuk konten menu', status: 'IN_PROGRESS', priority: 'HIGH', assignee: budi.id, labels: ['Frontend', 'Backend'], due: 2, estimate: 10 },
    { title: 'Implementasi halaman beranda', status: 'IN_PROGRESS', priority: 'URGENT', assignee: budi.id, labels: ['Frontend'], due: 3, estimate: 12, milestone: 1 },
    { title: 'Foto produk menu 12 item unggulan', status: 'TODO', priority: 'MEDIUM', assignee: rina.id, labels: ['Konten'], due: 4, estimate: 5 },
    { title: 'Copywriting halaman "Cerita Sela"', status: 'TODO', priority: 'MEDIUM', assignee: demo.id, labels: ['Konten'], due: 5, estimate: 3 },
    { title: 'Integrasi form pre-order + notifikasi WhatsApp', status: 'TODO', priority: 'HIGH', assignee: budi.id, labels: ['Backend'], due: 6, estimate: 8, milestone: 1 },
    { title: 'SEO dasar: metadata, sitemap, og-image', status: 'BACKLOG', priority: 'MEDIUM', assignee: null, labels: ['Frontend'], due: 7, estimate: 4 },
    { title: 'Uji coba pemesanan end-to-end dengan pemilik kedai', status: 'BACKLOG', priority: 'HIGH', assignee: demo.id, labels: [], due: 8, estimate: 2, milestone: 2 },
  ] as const

  for (const [i, t] of kopiTasks.entries()) {
    const isDone = t.status === 'DONE'
    await db.task.create({
      data: {
        projectId: kopi.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assignee,
        createdById: demo.id,
        dueDate: daysAhead(t.due),
        startDate: daysAhead(t.due - 4),
        estimate: t.estimate,
        position: i,
        completedAt: isDone ? daysAgo(-t.done) : null,
        milestoneId: 'milestone' in t && t.milestone != null ? kopiMs[t.milestone].id : null,
        createdAt: daysAgo(17 - i),
        labels: {
          create: t.labels.map((name) => ({ labelId: labelMap[name] })),
        },
      },
    })
  }
  const kopiImpl = await db.task.findFirst({ where: { projectId: kopi.id, title: { contains: 'Implementasi halaman beranda' } } })
  await db.checklistItem.createMany({
    data: [
      { taskId: kopiImpl!.id, content: 'Hero + Foto suasana kedai', done: true, position: 0 },
      { taskId: kopiImpl!.id, content: 'Seksi menu unggulan (ambil dari CMS)', done: true, position: 1 },
      { taskId: kopiImpl!.id, content: 'CTA pre-order mengarah ke form', done: false, position: 2 },
      { taskId: kopiImpl!.id, content: 'Peta & jam operasional', done: false, position: 3 },
    ],
  })
  const kopiForm = await db.task.findFirst({ where: { projectId: kopi.id, title: { contains: 'Integrasi form pre-order' } } })
  await db.taskComment.createMany({
    data: [
      { taskId: kopiForm!.id, userId: budi.id, content: 'API WhatsApp gateway-nya pakai nomor bisnis klien ya, jangan nomor pribadi.', createdAt: daysAgo(2, 14) },
      { taskId: kopiForm!.id, userId: demo.id, content: 'Sudah saya konfirmasi. Nomor bisnis dikirim besok pagi.', createdAt: daysAgo(2, 16) },
    ],
  })

  // ── project 2: PasarKu (perencanaan) ─────────────────────────────────────
  const pasarku = await db.project.create({
    data: {
      workspaceId: studio.id,
      name: 'Aplikasi Kasir PasarKu',
      description:
        'Aplikasi kasir (POS) offline-first untuk pedagang pasar tradisional. Fase riset & prototipe.',
      color: '#2F7D4F',
      status: 'PLANNING',
      priority: 'MEDIUM',
      startDate: daysAgo(6),
      targetDate: daysAhead(45),
      ownerId: sari.id,
      members: {
        create: [
          { userId: sari.id, role: 'LEAD' },
          { userId: demo.id, role: 'MEMBER' },
          { userId: rina.id, role: 'MEMBER' },
        ],
      },
      createdAt: daysAgo(6),
    },
  })
  const pasarkuMs = await Promise.all([
    db.milestone.create({ data: { projectId: pasarku.id, name: 'Riset lapangan 10 pedagang', description: 'Wawancara singkat + observasi alur jual-beli.', targetDate: daysAhead(7) } }),
    db.milestone.create({ data: { projectId: pasarku.id, name: 'Prototipe bisa diuji', targetDate: daysAhead(24) } }),
  ])
  const pasarkuTasks = [
    { title: 'Wawancara 10 pedagang di Pasar Kosambi', status: 'IN_PROGRESS', priority: 'HIGH', assignee: rina.id, labels: ['Riset'], due: 5, estimate: 8 },
    { title: 'Petakan alur transaksi tunai vs QRIS', status: 'TODO', priority: 'HIGH', assignee: sari.id, labels: ['Riset'], due: 8, estimate: 5, milestone: 0 },
    { title: 'Sketsa alur kasir (low-fi)', status: 'TODO', priority: 'MEDIUM', assignee: sari.id, labels: ['Desain'], due: 12, estimate: 6 },
    { title: 'Kajian metode sinkronisasi offline-first', status: 'BACKLOG', priority: 'HIGH', assignee: budi.id, labels: ['Backend'], due: 15, estimate: 10 },
    { title: 'Kaji ulang biaya server & skema harga aplikasi', status: 'BACKLOG', priority: 'LOW', assignee: demo.id, labels: [], due: null, estimate: 3 },
  ] as const
  for (const [i, t] of pasarkuTasks.entries()) {
    await db.task.create({
      data: {
        projectId: pasarku.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assignee,
        createdById: sari.id,
        dueDate: t.due != null ? daysAhead(t.due) : null,
        estimate: t.estimate,
        position: i,
        milestoneId: 'milestone' in t && t.milestone != null ? pasarkuMs[t.milestone].id : null,
        createdAt: daysAgo(5 - Math.min(i, 4)),
        labels: { create: t.labels.map((name) => ({ labelId: labelMap[name] })) },
      },
    })
  }

  // ── project 3: Batik Laras (selesai) ─────────────────────────────────────
  const batik = await db.project.create({
    data: {
      workspaceId: studio.id,
      name: 'Identitas Visual Batik Laras',
      description: 'Rebranding lengkap UMKM batik tulis Laras: logo, palet, kemasan, dan katalog.',
      color: '#8A6D2F',
      status: 'COMPLETED',
      priority: 'MEDIUM',
      startDate: daysAgo(45),
      targetDate: daysAgo(12),
      completedAt: daysAgo(11),
      ownerId: sari.id,
      members: { create: [{ userId: sari.id, role: 'LEAD' }, { userId: rina.id, role: 'MEMBER' }] },
      createdAt: daysAgo(45),
    },
  })
  await db.milestone.create({
    data: { projectId: batik.id, name: 'Handover aset final', targetDate: daysAgo(12), completed: true, completedAt: daysAgo(11) },
  })
  const batikTasks = [
    { title: 'Eksplorasi logo (3 arah)', status: 'DONE', assignee: sari.id, labels: ['Desain'], due: -30, done: -29 },
    { title: 'Sistem warna & tipografi brand', status: 'DONE', assignee: sari.id, labels: ['Desain'], due: -24, done: -23 },
    { title: 'Desain kemasan 3 varian', status: 'DONE', assignee: rina.id, labels: ['Desain'], due: -18, done: -16 },
    { title: 'Katalog produk digital (PDF)', status: 'DONE', assignee: rina.id, labels: ['Konten'], due: -14, done: -13 },
    { title: 'Handover + pelatihan singkat pemilik', status: 'DONE', assignee: sari.id, labels: [], due: -12, done: -11 },
  ] as const
  for (const [i, t] of batikTasks.entries()) {
    await db.task.create({
      data: {
        projectId: batik.id,
        title: t.title,
        status: 'DONE',
        priority: 'MEDIUM',
        assigneeId: t.assignee,
        createdById: sari.id,
        dueDate: daysAhead(t.due),
        estimate: 5,
        position: i,
        completedAt: daysAgo(-t.done),
        createdAt: daysAgo(44 - i * 3),
        labels: { create: t.labels.map((name) => ({ labelId: labelMap[name] })) },
      },
    })
  }

  // ── project 4: Kelas Menulis (ditunda) ───────────────────────────────────
  const kelas = await db.project.create({
    data: {
      workspaceId: studio.id,
      name: 'Kelas Menulis Online Batch 3',
      description: 'Kelas online 4 sesi untuk penulis pemula. Ditunda sementara menunggu kuota peserta.',
      color: '#3E6B7E',
      status: 'ON_HOLD',
      priority: 'LOW',
      startDate: daysAgo(22),
      targetDate: daysAhead(30),
      ownerId: rina.id,
      members: { create: [{ userId: rina.id, role: 'LEAD' }, { userId: demo.id, role: 'MEMBER' }] },
      createdAt: daysAgo(22),
    },
  })
  const kelasTasks = [
    { title: 'Susun silabus 4 sesi', status: 'DONE', assignee: rina.id, labels: ['Konten'], due: -15, done: -14 },
    { title: 'Buat materi sesi 1: Menemukan ide', status: 'IN_PROGRESS', assignee: rina.id, labels: ['Konten'], due: 10, estimate: 4 },
    { title: 'Siapkan halaman pendaftaran', status: 'TODO', assignee: demo.id, labels: ['Frontend'], due: 12, estimate: 3 },
    { title: 'Dekorasi grup alumni & materi arsip', status: 'BACKLOG', assignee: null, labels: [], due: null, estimate: 2 },
  ] as const
  for (const [i, t] of kelasTasks.entries()) {
    await db.task.create({
      data: {
        projectId: kelas.id,
        title: t.title,
        status: t.status,
        priority: 'MEDIUM',
        assigneeId: t.assignee,
        createdById: rina.id,
        dueDate: t.due != null ? daysAhead(t.due) : null,
        estimate: 'estimate' in t ? t.estimate : null,
        position: i,
        completedAt: 'done' in t && t.done != null ? daysAgo(-t.done) : null,
        createdAt: daysAgo(21 - i * 2),
        labels: { create: t.labels.map((name) => ({ labelId: labelMap[name] })) },
      },
    })
  }

  // ── workspace 2: pribadi ─────────────────────────────────────────────────
  const pribadi = await db.workspace.create({
    data: {
      name: 'Kotak Pribadi',
      description: 'Catatan dan proyek personal.',
      ownerId: demo.id,
      members: { create: { userId: demo.id, role: 'OWNER' } },
    },
  })
  const renov = await db.project.create({
    data: {
      workspaceId: pribadi.id,
      name: 'Renovasi Ruang Kerja',
      description: 'Menata ulang sudut kerja di rumah: rak, meja, dan pencahayaan.',
      color: '#5C5C4E',
      status: 'ACTIVE',
      priority: 'LOW',
      startDate: daysAgo(10),
      targetDate: daysAhead(20),
      ownerId: demo.id,
      members: { create: { userId: demo.id, role: 'LEAD' } },
      createdAt: daysAgo(10),
    },
  })
  const renovTasks = [
    { title: 'Ukur ruang & buat denah kasar', status: 'DONE', due: -6, done: -5 },
    { title: 'Cari referensi rak minimalis', status: 'IN_PROGRESS', due: 3 },
    { title: 'Pesan lampu meja baru', status: 'TODO', due: 6 },
  ] as const
  for (const [i, t] of renovTasks.entries()) {
    await db.task.create({
      data: {
        projectId: renov.id,
        title: t.title,
        status: t.status,
        priority: 'LOW',
        assigneeId: demo.id,
        createdById: demo.id,
        dueDate: daysAhead(t.due),
        position: i,
        completedAt: 'done' in t && t.done != null ? daysAgo(-t.done) : null,
        createdAt: daysAgo(9 - i * 2),
      },
    })
  }

  // ── ideas ────────────────────────────────────────────────────────────────
  await db.idea.createMany({
    data: [
      { workspaceId: studio.id, title: 'Marketplace kerajinan daur ulang', description: 'Platform jual-beli kerajinan dari material daur ulang, kurasi per penjual. Mulai dari 20 penjual di Jabodetabek.', category: 'Produk', tags: '["marketplace","lingkungan"]', priority: 'HIGH', createdById: rina.id, createdAt: daysAgo(4) },
      { workspaceId: studio.id, title: 'Bot Telegram pengingat tagihan langganan', description: 'Bot sederhana yang mengingatkan tanggal tagihan Netflix/Spotify/cs. Bisa jadi lead magnet.', category: 'Teknis', tags: '["bot","ide-cepat"]', priority: 'LOW', createdById: budi.id, createdAt: daysAgo(6) },
      { workspaceId: studio.id, title: 'Paket rebranding UMKM fixed-price', description: 'Produk jasa baku: logo + palet + template sosmed, 2 minggu, harga tetap. Cocok untuk Batik Laras model.', category: 'Operasional', tags: '["jasa","umkm"]', priority: 'URGENT', createdById: sari.id, createdAt: daysAgo(3) },
      { workspaceId: studio.id, title: 'Newsletter mingguan "Cerita Klien"', description: 'Belajar membangun audiens dengan menulis proses pengerjaan proyek klien (dengan izin).', category: 'Marketing', tags: '["konten"]', priority: 'MEDIUM', createdById: demo.id, createdAt: daysAgo(9) },
      { workspaceId: studio.id, title: 'Template invoice untuk proyek kecil', description: 'Template Figma + PDF siap pakai agar penagihan lebih cepat dan rapi.', category: 'Umum', tags: '["admin"]', priority: 'LOW', createdById: demo.id, createdAt: daysAgo(12) },
      { workspaceId: pribadi.id, title: 'Blog resep masakan emak', description: 'Digitalisasi resep tulisan tangan ibu, satu resep per minggu.', category: 'Umum', tags: '["keluarga"]', priority: 'MEDIUM', createdById: demo.id, createdAt: daysAgo(8) },
    ],
  })

  // ── documents ────────────────────────────────────────────────────────────
  await db.document.createMany({
    data: [
      {
        workspaceId: studio.id,
        projectId: kopi.id,
        title: 'Brief Proyek — Kopi Sela',
        createdById: demo.id,
        createdAt: daysAgo(17),
        updatedAt: daysAgo(5),
        content: `# Brief — Peluncuran Website Kopi Sela

## Latar belakang
Kopi Sela membuka kedai fisik di Dago, Bandung, akhir bulan ini. Mereka butuh
website profil + pre-order sederhana sebelum grand opening.

## Sasaran
1. Calon pelanggan bisa melihat menu dan harga terbaru.
2. Pre-order minuman besar (1L) bisa dilakukan H-1.
3. Cerita kedai tampil menarik untuk media sosial.

## Ruang lingkup
- Beranda, Menu, Cerita, Kontak
- Form pre-order → notifikasi WhatsApp
- CMS ringan untuk menu (dikelola pemilik)

## Di luar ruang lingkup
- Pembayaran online (fase 2)
- Aplikasi mobile

## Catatan teknis
- Hosting: VPS yang sudah ada
- Domain: kopisela.id (sudah dibeli klien)
`,
      },
      {
        workspaceId: studio.id,
        projectId: kopi.id,
        title: 'Panduan Gaya Visual',
        createdById: sari.id,
        createdAt: daysAgo(14),
        updatedAt: daysAgo(7),
        content: `# Panduan Gaya — Kopi Sela

## Warna
- Krem gading \`#F3EDE2\` — latar utama
- Coklat sangrai \`#4A2E1D\` — teks & aksen
- Hijau daun \`#5C6B4C\` — sekunder

## Tipografi
- Judul: serif hangat (Fraunces)
- Body: sans bersih (Space Grotesk)
- Gunakan nomor menu dalam tabel mono

## Foto
- Cahaya pagi natural, hindari flash
- Selalu ada elemen tangan/keramik lokal
`,
      },
      {
        workspaceId: studio.id,
        projectId: pasarku.id,
        title: 'Catatan Riset PasarKu',
        createdById: rina.id,
        createdAt: daysAgo(4),
        updatedAt: daysAgo(1),
        content: `# Catatan Riset — PasarKu

## Temuan awal (6 dari 10 pedagang)
- 5 dari 6 mencatat penjualan di buku tulis, tutup buku tiap malam.
- Semua pakai QRIS statis dari bank, tapi tidak ada rekap otomatis.
- Keluhan utama: **uang kembalian pecahan** dan **ingat utang pelanggan**.

## Peluang
- Mode "tutup buku" harian satu tombol.
- Catatan utang pelanggan sederhana.
- Harus tetap jalan tanpa internet.

## Pertanyaan terbuka
1. Berapa harga wajar per bulan?
2. Siapa yang memasarkan: pemilik pasar atau koperasi?
`,
      },
      {
        workspaceId: studio.id,
        title: 'Cara Kerja Studio',
        createdById: demo.id,
        createdAt: daysAgo(35),
        updatedAt: daysAgo(20),
        content: `# Cara Kerja Studio Nusantara

## Ritme mingguan
- **Senin** — rencana mingguan (30 menit)
- **Rabu** — review desain bersama
- **Jumat** — demo & tutup minggu

## Definisi selesai
Sebuah tugas dianggap selesai kalau:
1. Sudah direview minimal satu orang.
2. Sudah dites di kondisi nyata (bukan hanya localhost).
3. Tidak ada catatan terbuka di task terkait.

## Komunikasi
Keputusan penting dicatat di dokumen proyek, bukan hanya di chat.
`,
      },
    ],
  })

  // ── activity (backfill yang masuk akal) ──────────────────────────────────
  const acts: NonNullable<Parameters<typeof db.activityEvent.createMany>[0]>['data'] = [
    { workspaceId: studio.id, projectId: kopi.id, userId: demo.id, type: 'PROJECT_CREATED', entityType: 'project', entityId: kopi.id, entityTitle: kopi.name, createdAt: daysAgo(18) },
    { workspaceId: studio.id, projectId: kopi.id, userId: sari.id, type: 'MILESTONE_COMPLETED', entityType: 'milestone', entityId: kopiMs[0].id, entityTitle: 'Desain disetujui klien', createdAt: daysAgo(7) },
    { workspaceId: studio.id, projectId: kopi.id, userId: budi.id, type: 'COMMENT_ADDED', entityType: 'task', entityId: kopiForm!.id, entityTitle: kopiForm!.title, createdAt: daysAgo(2, 14) },
    { workspaceId: studio.id, projectId: kopi.id, userId: demo.id, type: 'COMMENT_ADDED', entityType: 'task', entityId: kopiForm!.id, entityTitle: kopiForm!.title, createdAt: daysAgo(2, 16) },
    { workspaceId: studio.id, projectId: batik.id, userId: sari.id, type: 'PROJECT_COMPLETED', entityType: 'project', entityId: batik.id, entityTitle: batik.name, createdAt: daysAgo(11) },
    { workspaceId: studio.id, projectId: pasarku.id, userId: sari.id, type: 'PROJECT_CREATED', entityType: 'project', entityId: pasarku.id, entityTitle: pasarku.name, createdAt: daysAgo(6) },
    { workspaceId: studio.id, projectId: pasarku.id, userId: rina.id, type: 'TASK_UPDATED', entityType: 'task', entityId: null, entityTitle: 'Wawancara 10 pedagang di Pasar Kosambi', metadata: JSON.stringify({ detail: 'status → Dikerjakan' }), createdAt: daysAgo(1, 9) },
    { workspaceId: studio.id, projectId: kelas.id, userId: rina.id, type: 'PROJECT_UPDATED', entityType: 'project', entityId: kelas.id, entityTitle: kelas.name, metadata: JSON.stringify({ detail: 'status → Ditunda' }), createdAt: daysAgo(3) },
    { workspaceId: studio.id, userId: sari.id, type: 'IDEA_CREATED', entityType: 'idea', entityId: null, entityTitle: 'Paket rebranding UMKM fixed-price', createdAt: daysAgo(3, 11) },
    { workspaceId: studio.id, projectId: kopi.id, userId: demo.id, type: 'DOCUMENT_UPDATED', entityType: 'document', entityId: null, entityTitle: 'Brief Proyek — Kopi Sela', createdAt: daysAgo(5) },
    { workspaceId: studio.id, projectId: kopi.id, userId: budi.id, type: 'TASK_MOVED', entityType: 'task', entityId: null, entityTitle: 'Implementasi halaman beranda', metadata: JSON.stringify({ detail: 'To Do → Dikerjakan' }), createdAt: daysAgo(1, 13) },
    { workspaceId: studio.id, projectId: kopi.id, userId: sari.id, type: 'TASK_COMPLETED', entityType: 'task', entityId: null, entityTitle: 'Desain halaman menu & profil kedai', createdAt: daysAgo(1, 15) },
  ]
  await db.activityEvent.createMany({ data: acts })

  // ── notifications untuk demo ─────────────────────────────────────────────
  await db.notification.createMany({
    data: [
      { userId: demo.id, type: 'COMMENT_ADDED', title: 'Budi Santoso berkomentar', body: '“API WhatsApp gateway-nya pakai nomor bisnis klien ya…”', link: `project:${kopi.id}`, dedupeKey: null, read: false, createdAt: daysAgo(2, 14) },
      { userId: demo.id, type: 'TASK_ASSIGNED', title: 'Tugas baru untukmu', body: 'Copywriting halaman “Cerita Sela” — tenggat 5 hari.', link: `project:${kopi.id}`, dedupeKey: null, read: false, createdAt: daysAgo(3) },
      { userId: demo.id, type: 'MILESTONE_COMPLETED', title: 'Milestone selesai', body: 'Sari menyelesaikan “Desain disetujui klien”.', link: `project:${kopi.id}`, dedupeKey: null, read: true, createdAt: daysAgo(7) },
      { userId: demo.id, type: 'IDEA_CREATED', title: 'Ide baru dari Rina', body: 'Marketplace kerajinan daur ulang — prioritas Tinggi.', link: `inbox`, dedupeKey: null, read: true, createdAt: daysAgo(4) },
    ],
  })

  console.log('✓ Seed selesai.')
  console.log('  Login demo → email: demo@rakit.id  password: demo123')
  console.log(`  Workspace: ${studio.name} (${await db.workspaceMember.count()}) · proyek: ${await db.project.count()} · tugas: ${await db.task.count()}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
