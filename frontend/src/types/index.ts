/**
 * Post-centric model: Post (должность) is the key entity.
 * User occupies a Post (postId). RBAC is inherited from Post.role.
 */

// RBAC Roles (inherited from Post when user occupies a post)
export type Role = 'Admin' | 'Inspector' | 'Department Head' | 'Section Head' | 'Employee';

// User: id, name, email, avatarUrl. Occupies one Post (postId). Role comes from Post.role.
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  postId: string | null; // занимаемая должность; null = не назначен
  avatarUrl?: string;
  /** When current user is Admin: date they were assigned to admin post (for seniority). */
  adminAssignedAt?: string;
  isVerified?: boolean;
}

// Department
export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  managerPostId: string | null;
  budget?: number;
}

/** Post (должность) — ключевая сущность. Иерархия через parentPostId. */
export interface Post {
  id: string;
  title: string;
  description?: string;
  parentPostId: string | null;
  departmentId: string;
  role: Role;
  level: number;
  orderIndex?: number;
  code?: string;
  /** Optional card color key: default, blue, green, amber, violet */
  cardColor?: string;
  /** Optional text shown on org chart card */
  cardNotes?: string;
}

/** Кто занимает пост (с бэкенда). null = вакансия. */
export interface PostHolder {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

/** Пост с информацией о занятости для дерева оргсхемы. */
export interface PostWithHolder extends Post {
  currentHolder: PostHolder | null; // null = вакансия
}

// Legacy alias (Position = Post)
export type Position = Post;

export interface PositionAssignment {
  id: string;
  postId: string;
  employeeId: string;
  startedAt: string;
  endedAt: string | null;
  isCurrent: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  hireDate?: string;
  status: 'active' | 'inactive';
  postId?: string | null;
}

// Instruction — привязка к Post (postId, ownerPostId)
export interface Instruction {
  id: string;
  title: string;
  postId: string;
  status: 'draft' | 'active' | 'archived';
  updatedAt: string;
  ownerPostId: string;
  version: number;
  steps: InstructionStep[];
}

export interface InstructionStep {
  id: string;
  title: string;
  text: string;
  link?: string;
  responsiblePostId?: string;
  deadline?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
}

export interface WorkPlan {
  id: string;
  title: string;
  postId: string;
  status: 'on-track' | 'at-risk' | 'overdue';
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  text: string;
  link?: string;
}

export interface Budget {
  id: string;
  departmentId: string;
  responsiblePostId?: string;
  category: string;
  period: string;
  planned: number;
  approved: number;
  spent: number;
  remaining: number;
  limits: number;
  approvalStatus: 'pending' | 'approved' | 'rejected';
}

export interface PositionStatistics {
  id: string;
  postId: string;
  period: string;
  metricCode: string;
  value: number;
}

export interface Mailbox {
  id: string;
  postId: string;
  externalId?: string;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  userName: string;
  timestamp: string;
  changes?: Record<string, any>;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}
