// ─── RAKIT shared types (mirror API responses) ───────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type IdeaStatus = 'ACTIVE' | 'ARCHIVED' | 'CONVERTED'

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarColor: string
  onboardedAt: string | null
}

export interface UserInfo {
  id: string
  name: string
  email: string
  avatarColor: string
}

export interface WorkspaceSummary {
  id: string
  name: string
  description: string | null
  role: Role
  ownerId: string
  activeProjects: number
}

export interface WorkspaceDetail {
  id: string
  name: string
  description: string | null
  ownerId: string
  createdAt: string
  members: WorkspaceMemberInfo[]
  invitations: InvitationInfo[]
  counts: { projects: number; ideas: number; documents: number }
}

export interface WorkspaceMemberInfo {
  id: string
  role: Role
  joinedAt: string
  user: UserInfo
}

export interface InvitationInfo {
  id: string
  email: string
  role: Role
  status: string
  invitedBy: string
  createdAt: string
}

export interface IncomingInvitation {
  id: string
  email: string
  role: Role
  workspace: { id: string; name: string; description: string | null }
  invitedBy: { name: string }
  createdAt: string
}

export interface LabelInfo {
  id: string
  name: string
  color: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string | null
  color: string
  status: ProjectStatus
  priority: Priority
  startDate: string | null
  targetDate: string | null
  completedAt: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
  owner?: UserInfo
  members?: ProjectMemberInfo[]
  _count?: { tasks: number; milestones: number; documents: number; members: number }
  /** derived by API on list endpoints */
  taskStats?: { total: number; done: number }
}

export interface ProjectMemberInfo {
  id: string
  role: string
  user: UserInfo
}

export interface Task {
  id: string
  projectId: string
  milestoneId: string | null
  assigneeId: string | null
  createdById: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  startDate: string | null
  dueDate: string | null
  estimate: number | null
  position: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignee?: UserInfo | null
  creator?: UserInfo
  labels?: LabelInfo[]
  checklist?: ChecklistItem[]
  _count?: { comments: number; checklist: number; checklistDone: number }
}

export interface ChecklistItem {
  id: string
  taskId: string
  content: string
  done: boolean
  position: number
}

export interface TaskComment {
  id: string
  taskId: string
  content: string
  createdAt: string
  user: UserInfo
}

export interface Milestone {
  id: string
  projectId: string
  name: string
  description: string | null
  targetDate: string | null
  completed: boolean
  completedAt: string | null
  createdAt: string
  taskStats?: { total: number; done: number }
}

export interface Idea {
  id: string
  workspaceId: string
  title: string
  description: string | null
  category: string
  tags: string[]
  priority: Priority
  status: IdeaStatus
  convertedProjectId: string | null
  createdById: string
  creator?: UserInfo
  createdAt: string
  updatedAt: string
}

export interface DocumentInfo {
  id: string
  workspaceId: string
  projectId: string | null
  title: string
  content: string
  createdById: string
  creator?: UserInfo
  createdAt: string
  updatedAt: string
}

export interface ActivityItem {
  id: string
  workspaceId: string
  projectId: string | null
  userId: string
  type: string
  entityType: string
  entityId: string | null
  entityTitle: string | null
  metadata: string | null
  createdAt: string
  user: UserInfo
  project?: { id: string; name: string } | null
}

export interface NotificationItem {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  link: string | null
  dedupeKey: string | null
  read: boolean
  createdAt: string
}

export interface DashboardData {
  stats: {
    activeProjects: number
    planningProjects: number
    myOpenTasks: number
    overdueTasks: number
    doneThisWeek: number
    unreadNotifications: number
  }
  activeProjects: Array<
    Project & { taskStats: { total: number; done: number }; nextMilestone: { id: string; name: string; targetDate: string | null } | null }
  >
  recentlyUpdated: Array<Pick<Project, 'id' | 'name' | 'status' | 'color' | 'updatedAt'> & { taskStats: { total: number; done: number } }>
  upcomingDeadlines: Array<{
    id: string
    title: string
    dueDate: string
    priority: Priority
    status: TaskStatus
    projectId: string
    projectName: string
    projectColor: string
    assignee: UserInfo | null
  }>
  myTasks: Array<{
    id: string
    title: string
    status: TaskStatus
    priority: Priority
    dueDate: string | null
    projectId: string
    projectName: string
    projectColor: string
  }>
  weeklyDone: Array<{ date: string; label: string; count: number }>
  upcomingMilestones: Array<{
    id: string
    name: string
    targetDate: string | null
    completed: boolean
    projectId: string
    projectName: string
    overdue: boolean
  }>
  recentActivity: ActivityItem[]
}

export interface SearchResult {
  projects: Array<{ id: string; name: string; status: ProjectStatus; color: string; workspaceId: string }>
  tasks: Array<{ id: string; title: string; status: TaskStatus; projectId: string; projectName: string }>
  ideas: Array<{ id: string; title: string; status: IdeaStatus; workspaceId: string }>
  documents: Array<{ id: string; title: string; workspaceId: string; projectId: string | null }>
  milestones: Array<{ id: string; name: string; projectId: string; projectName: string; completed: boolean }>
}
