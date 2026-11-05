'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PROJECT_STATUS_COLOR,
  PROJECT_STATUS_LABEL,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
  TASK_STATUS_LABEL,
} from '@/lib/constants'
import { dueLabel, hexWithAlpha, initials } from '@/components/rakit/format'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

// ─── Typography ──────────────────────────────────────────────────────────────

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('kicker', className)}>{children}</div>
}

/** Editorial page header: kicker → serif title → description → actions. */
export function Masthead({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="rule-strong pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {kicker ? <Kicker className="mb-2">{kicker}</Kicker> : null}
            <h1 className="truncate text-2xl font-semibold leading-tight sm:text-[28px]">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}

export function SectionHeading({
  children,
  aside,
  className,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <Kicker>{children}</Kicker>
      {aside ? <div className="text-xs text-muted-foreground">{aside}</div> : null}
    </div>
  )
}

// ─── Avatars ─────────────────────────────────────────────────────────────────

export function UserAvatar({
  user,
  size = 28,
  className,
  title,
}: {
  user: { name: string; avatarColor: string } | null | undefined
  size?: number
  className?: string
  title?: string
}) {
  if (!user) {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground', className)}
        style={{ width: size, height: size }}
        aria-label="Belum ditugaskan"
      >
        <span style={{ fontSize: Math.round(size * 0.34) }}>?</span>
      </span>
    )
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none', className)}
      style={{ width: size, height: size, backgroundColor: user.avatarColor, fontSize: Math.round(size * 0.36) }}
      title={title ?? user.name}
      aria-label={user.name}
    >
      {initials(user.name)}
    </span>
  )
}

export function AvatarStack({
  users,
  size = 24,
  max = 4,
}: {
  users: Array<{ name: string; avatarColor: string }>
  size?: number
  max?: number
}) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u, i) => (
        <UserAvatar key={i} user={u} size={size} className="ring-2 ring-background" />
      ))}
      {rest > 0 ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

// ─── Badges & marks ──────────────────────────────────────────────────────────

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const color = PROJECT_STATUS_COLOR[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}
      style={{ backgroundColor: hexWithAlpha(color, 0.13), color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {PROJECT_STATUS_LABEL[status]}
    </span>
  )
}

const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  BACKLOG: '#9A938A',
  TODO: '#8A6D2F',
  IN_PROGRESS: '#D9481F',
  IN_REVIEW: '#3E6B7E',
  DONE: '#2F7D4F',
}

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const color = TASK_STATUS_DOT[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {TASK_STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityMark({ priority, className }: { priority: Priority; className?: string }) {
  const color = PRIORITY_COLOR[priority]
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide', className)}
      style={{ color }}
      title={`Prioritas ${PRIORITY_LABEL[priority].toLowerCase()}`}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function DueText({ date, className }: { date: string | null | undefined; className?: string }) {
  const info = dueLabel(date)
  if (!info) return <span className={cn('font-mono text-[11px] text-muted-foreground/60', className)}>—</span>
  return (
    <span
      className={cn(
        'font-mono text-[11px]',
        info.overdue ? 'font-semibold text-brand' : info.soon ? 'text-warning' : 'text-muted-foreground',
        className,
      )}
    >
      {info.text}
    </span>
  )
}

export function LabelChip({ label, onClick }: { label: { name: string; color: string }; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex max-w-32 items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
      style={{ backgroundColor: hexWithAlpha(label.color, 0.13), color: label.color }}
    >
      {label.name}
    </button>
  )
}

/** Thin editorial progress: charcoal track, vermilion fill. */
export function ProgressBar({ value, className, height = 3 }: { value: number; className?: string; height?: number }) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-foreground/10', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-brand transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// ─── Empty / loading states ──────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  compact,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center',
        compact ? 'px-6 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-muted-foreground/60">{icon}</div> : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function SkeletonText({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('h-3 animate-pulse rounded bg-muted-foreground/15', className)} style={style} />
}

export function ViewSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat">
      <div className="space-y-2">
        <SkeletonText className="h-2.5 w-24" />
        <SkeletonText className="h-7 w-72" />
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <SkeletonText className="h-4" style={{ width: `${35 + ((i * 13) % 40)}%` } as React.CSSProperties} />
            <SkeletonText className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Hapus',
  pending,
  onConfirm,
  requireText,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  pending?: boolean
  onConfirm: () => void
  /** e.g. type the workspace name to confirm destructive top-level actions */
  requireText?: string
}) {
  const [typed, setTyped] = React.useState('')
  React.useEffect(() => {
    if (!open) setTyped('')
  }, [open])
  const blocked = requireText != null && typed !== requireText

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {requireText ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Ketik <span className="font-mono font-semibold text-foreground">{requireText}</span> untuk mengonfirmasi.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder={requireText}
            />
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending || blocked}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
