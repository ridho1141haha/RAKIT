// ─── RAKIT domain constants (single source of truth) ─────────────────────────
// Enum-like string values mirror prisma/schema.prisma and are validated with zod.

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type IdeaStatus = 'ACTIVE' | 'ARCHIVED' | 'CONVERTED'

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']
export const ROLE_LEVEL: Record<Role, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 }

export const PROJECT_STATUSES: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']
export const TASK_STATUSES: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']
export const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
export const IDEA_STATUSES: IdeaStatus[] = ['ACTIVE', 'ARCHIVED', 'CONVERTED']

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: 'Perencanaan',
  ACTIVE: 'Aktif',
  ON_HOLD: 'Ditunda',
  COMPLETED: 'Selesai',
  ARCHIVED: 'Diarsipkan',
}

export const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  PLANNING: '#8A8578',
  ACTIVE: '#2F7D4F',
  ON_HOLD: '#B98A1F',
  COMPLETED: '#211D19',
  ARCHIVED: '#9A938A',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
  IN_PROGRESS: 'Dikerjakan',
  IN_REVIEW: 'Ditinjau',
  DONE: 'Selesai',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: '#9A938A',
  MEDIUM: '#8A6D2F',
  HIGH: '#B9541B',
  URGENT: '#D9481F',
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Pemilik',
  ADMIN: 'Admin',
  MEMBER: 'Anggota',
  VIEWER: 'Pengamat',
}

export const IDEA_CATEGORY_OPTIONS = [
  'Umum',
  'Produk',
  'Teknis',
  'Desain',
  'Marketing',
  'Operasional',
]

// Kanban columns move in this order; used for drag persistence
export const TASK_COLUMN_ORDER: TaskStatus[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']

export const ACTIVITY_TYPES = {
  PROJECT_CREATED: 'menambahkan proyek',
  PROJECT_UPDATED: 'memperbarui proyek',
  PROJECT_STATUS_CHANGED: 'mengubah status proyek',
  PROJECT_COMPLETED: 'menyelesaikan proyek',
  PROJECT_DELETED: 'menghapus proyek',
  TASK_CREATED: 'menambahkan tugas',
  TASK_UPDATED: 'memperbarui tugas',
  TASK_COMPLETED: 'menyelesaikan tugas',
  TASK_REOPENED: 'membuka kembali tugas',
  TASK_MOVED: 'memindahkan tugas',
  TASK_DELETED: 'menghapus tugas',
  TASK_ASSIGNED: 'menugaskan tugas',
  COMMENT_ADDED: 'berkomentar pada',
  CHECKLIST_UPDATED: 'memperbarui checklist pada',
  MILESTONE_CREATED: 'menambahkan milestone',
  MILESTONE_COMPLETED: 'menyelesaikan milestone',
  MILESTONE_DELETED: 'menghapus milestone',
  IDEA_CREATED: 'menangkap ide',
  IDEA_CONVERTED: 'mengubah ide menjadi proyek',
  IDEA_ARCHIVED: 'mengarsipkan ide',
  DOCUMENT_CREATED: 'menambahkan dokumen',
  DOCUMENT_UPDATED: 'memperbarui dokumen',
  DOCUMENT_DELETED: 'menghapus dokumen',
  MEMBER_JOINED: 'bergabung ke workspace',
  MEMBER_INVITED: 'mengundang',
  MEMBER_ROLE_CHANGED: 'mengubah peran',
  MEMBER_REMOVED: 'mengeluarkan anggota',
} as const

export type ActivityType = keyof typeof ACTIVITY_TYPES

export const AVATAR_COLORS = [
  '#D9481F', '#B9541B', '#8A6D2F', '#2F7D4F',
  '#3E6B7E', '#7A4A6B', '#5C5C4E', '#8A4A3B',
]
