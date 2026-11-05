import { db } from '@/lib/db'

type ActivityInput = {
  workspaceId: string
  projectId?: string | null
  userId: string
  type: string
  entityType: string
  entityId?: string | null
  entityTitle?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Record one activity event. Accepts a Prisma transaction client so mutations
 * + their activity entry stay atomic.
 */
export async function logActivity(
  client: Pick<typeof db, 'activityEvent'>,
  input: ActivityInput,
): Promise<void> {
  await client.activityEvent.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      userId: input.userId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityTitle: input.entityTitle ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

type NotifyInput = {
  userIds: string[]
  type: string
  title: string
  body?: string
  link?: string
  /** Provide to guarantee at most one notification per user per event. */
  dedupeKey?: string
}

/**
 * Create notifications for a set of users. Deduplicates via the
 * @@unique([userId, dedupeKey]) constraint — duplicates are silently skipped
 * so the same event never notifies twice.
 */
export async function notify(client: typeof db, input: NotifyInput): Promise<void> {
  const unique = [...new Set(input.userIds)].filter(Boolean)
  if (unique.length === 0) return
  for (const userId of unique) {
    try {
      await client.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link,
          dedupeKey: input.dedupeKey ?? null,
        },
      })
    } catch (err) {
      // P2002 → already notified for this dedupeKey; ignore.
      if ((err as { code?: string }).code !== 'P2002') throw err
    }
  }
}
