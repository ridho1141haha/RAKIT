'use client'

/**
 * TimelineView — read-only gantt-ish visualization. Day width 36px; window padded
 * ±3 days and clamped to ≥14 days. Milestone diamonds on top, task bars colored by
 * priority, dashed vermilion "today" marker. Rows open the task-edit overlay.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { Milestone, Task } from '@/components/rakit/types'
import { PRIORITY_COLOR } from '@/lib/constants'
import { hexWithAlpha } from '@/components/rakit/format'
import { EmptyState, Kicker, UserAvatar } from '@/components/rakit/ui-primitives'
import { CalendarDays } from 'lucide-react'
import { DAY, DAY_WIDTH, startOfMs } from './shared'

interface TimelineLayout {
  min: number
  days: number
  months: Array<{ label: string; start: number; span: number }>
}

function computeTimeline(tasks: Task[], milestones: Milestone[]): TimelineLayout {
  const today = startOfMs(new Date())
  let min = today
  let max = today
  const touch = (v?: string | null) => {
    if (!v) return
    const t = startOfMs(v)
    if (t < min) min = t
    if (t > max) max = t
  }
  for (const t of tasks) {
    const start = t.startDate ?? t.createdAt
    touch(start)
    touch(t.dueDate ?? new Date(startOfMs(start) + 2 * DAY).toISOString())
  }
  for (const m of milestones) touch(m.targetDate)
  min -= 3 * DAY
  max += 3 * DAY
  if (max - min < 13 * DAY) max = min + 13 * DAY // at least a 14-day span
  const days = Math.round((max - min) / DAY) + 1

  const months: TimelineLayout['months'] = []
  for (let i = 0; i < days; i++) {
    const label = new Date(min + i * DAY).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    const last = months[months.length - 1]
    if (last && last.label === label) last.span++
    else months.push({ label, start: i, span: 1 })
  }
  return { min, days, months }
}

export function TimelineView({
  tasks,
  milestones,
  onOpenTask,
}: {
  tasks: Task[]
  milestones: Milestone[]
  onOpenTask: (taskId: string) => void
}) {
  const layout = React.useMemo(() => computeTimeline(tasks, milestones), [tasks, milestones])
  const { min, days, months } = layout
  const trackW = days * DAY_WIDTH

  const todayIdx = React.useMemo(() => {
    const idx = Math.round((startOfMs(new Date()) - min) / DAY)
    return idx >= 0 && idx < days ? idx : null
  }, [min, days])

  const dayList = React.useMemo(
    () => Array.from({ length: days }, (_, i) => new Date(min + i * DAY)),
    [min, days],
  )

  const msRows = React.useMemo(
    () =>
      milestones
        .filter((m) => m.targetDate)
        .sort((a, b) => startOfMs(a.targetDate ?? '') - startOfMs(b.targetDate ?? '')),
    [milestones],
  )

  const taskRows = React.useMemo(
    () =>
      [...tasks].sort(
        (a, b) => startOfMs(a.startDate ?? a.createdAt) - startOfMs(b.startDate ?? b.createdAt),
      ),
    [tasks],
  )

  const todayX = todayIdx != null ? todayIdx * DAY_WIDTH + DAY_WIDTH / 2 : null

  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-background">
      <div className="min-w-max">
        {/* sticky header: month labels + day ticks */}
        <div className="sticky top-0 z-20 bg-background">
          <div className="flex">
            <div className="hidden w-56 shrink-0 md:block" />
            <div className="relative h-7 border-b border-border" style={{ width: trackW }}>
              {months.map((m) => (
                <div
                  key={`${m.label}-${m.start}`}
                  className="absolute top-0 flex h-full items-center truncate border-l border-border pl-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                  style={{ left: m.start * DAY_WIDTH, width: m.span * DAY_WIDTH }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex border-b border-border">
            <div className="hidden w-56 shrink-0 md:block" />
            <div className="flex" style={{ width: trackW }}>
              {dayList.map((d, i) => {
                const weekend = d.getDay() === 0 || d.getDay() === 6
                const isToday = i === todayIdx
                return (
                  <div
                    key={i}
                    className={cn(
                      'h-7 shrink-0 border-l pt-1 text-center font-mono text-[9px]',
                      i > 0 && d.getDate() === 1 ? 'border-border' : 'border-transparent',
                      weekend && 'bg-foreground/[0.04]',
                      isToday ? 'font-semibold text-brand' : 'text-muted-foreground',
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    {d.getDate()}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* rows */}
        <div className="relative">
          {/* weekend background (desktop only — gutter is hidden below md) */}
          <div className="pointer-events-none absolute inset-y-0 left-56 hidden md:flex" aria-hidden>
            {dayList.map((d, i) => (
              <div
                key={i}
                className={cn('h-full shrink-0', d.getDay() === 0 || d.getDay() === 6 ? 'bg-foreground/[0.03]' : '')}
                style={{ width: DAY_WIDTH }}
              />
            ))}
          </div>
          {/* today marker: vertical dashed vermilion line + label */}
          {todayX != null ? (
            <>
              <div
                className="absolute inset-y-0 z-10 border-l border-dashed border-brand/70 md:hidden"
                style={{ left: todayX }}
                aria-hidden
              />
              <div
                className="absolute inset-y-0 z-10 hidden border-l border-dashed border-brand/70 md:block"
                style={{ left: `calc(14rem + ${todayX}px)` }}
                aria-hidden
              />
              <span
                className="absolute top-0.5 z-10 -translate-x-1/2 bg-background px-1 font-mono text-[9px] font-semibold tracking-wider text-brand md:hidden"
                style={{ left: todayX }}
              >
                HARI INI
              </span>
              <span
                className="absolute top-0.5 z-10 hidden -translate-x-1/2 bg-background px-1 font-mono text-[9px] font-semibold tracking-wider text-brand md:block"
                style={{ left: `calc(14rem + ${todayX}px)` }}
              >
                HARI INI
              </span>
            </>
          ) : null}

          {/* milestone section */}
          {msRows.length > 0 ? (
            <>
              <div className="border-b border-border bg-muted/40 px-3 py-1">
                <Kicker>Milestone</Kicker>
              </div>
              {msRows.map((m) => {
                const idx = Math.max(
                  0,
                  Math.min(days - 1, Math.floor((startOfMs(m.targetDate ?? '') - min) / DAY)),
                )
                return (
                  <div key={m.id} className="flex border-b border-border/70">
                    <div className="hidden w-56 shrink-0 items-center gap-2 py-2 pr-3 md:flex">
                      <span
                        className={cn('size-2.5 shrink-0 rotate-45', m.completed ? 'bg-success' : 'bg-brand')}
                        aria-hidden
                      />
                      <span
                        className={cn('truncate text-xs font-medium', m.completed && 'text-muted-foreground line-through')}
                      >
                        {m.name}
                      </span>
                    </div>
                    <div className="relative h-9" style={{ width: trackW }}>
                      <div
                        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5"
                        style={{ left: idx * DAY_WIDTH + 4 }}
                      >
                        <span
                          className={cn('size-2.5 shrink-0 rotate-45', m.completed ? 'bg-success' : 'bg-brand')}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            'truncate text-[11px] font-medium md:hidden',
                            m.completed && 'text-muted-foreground line-through',
                          )}
                        >
                          {m.name}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="border-b border-border bg-muted/40 px-3 py-1">
                <Kicker>Tugas</Kicker>
              </div>
            </>
          ) : null}

          {tasks.length === 0 && msRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                icon={<CalendarDays className="size-6" />}
                title="Belum ada jadwal"
                description="Tambahkan tanggal mulai atau tenggat pada tugas untuk memetakan timeline."
              />
            </div>
          ) : null}

          {taskRows.map((task) => {
            const start = startOfMs(task.startDate ?? task.createdAt)
            const end = task.dueDate ? startOfMs(task.dueDate) : start + 2 * DAY
            const startIdx = Math.max(0, Math.min(days - 1, Math.floor((start - min) / DAY)))
            const endIdx = Math.max(startIdx, Math.min(days - 1, Math.floor((end - min) / DAY)))
            const left = startIdx * DAY_WIDTH + 2
            const width = Math.max(DAY_WIDTH, (endIdx - startIdx + 1) * DAY_WIDTH - 4)
            const done = task.status === 'DONE'
            const overdue = !done && task.dueDate != null && startOfMs(task.dueDate) < startOfMs(new Date())
            const color = PRIORITY_COLOR[task.priority]
            const open = () => onOpenTask(task.id)
            return (
              <div key={task.id} className="group flex border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  onClick={open}
                  className="hidden w-56 shrink-0 items-center gap-2 py-1.5 pr-3 text-left md:flex"
                >
                  <UserAvatar user={task.assignee} size={18} />
                  <span className="truncate text-xs text-foreground/90 group-hover:text-foreground">
                    {task.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={open}
                  className="relative h-9 shrink-0 text-left"
                  style={{ width: trackW }}
                  aria-label={`Buka tugas ${task.title}`}
                >
                  <span
                    className={cn(
                      'absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-md text-[11px]',
                      done && 'bg-foreground/10',
                    )}
                    style={
                      done
                        ? undefined
                        : {
                            left,
                            width,
                            backgroundColor: hexWithAlpha(color, 0.16),
                            border: overdue ? '1px solid var(--brand)' : '1px solid transparent',
                            borderLeft: `3px solid ${color}`,
                          }
                    }
                  >
                    <span className={cn('truncate px-1.5 leading-5', done && 'text-muted-foreground line-through')}>
                      {task.title}
                    </span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
