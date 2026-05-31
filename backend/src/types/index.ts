/**
 * Post-centric model: Post is the key entity.
 * User "occupies" a Post (optional postId). RBAC is inherited from Post.role.
 */

export type Role = 'Admin' | 'Inspector' | 'Department Head' | 'Section Head' | 'Employee';

/** Post (должность) — ключевая сущность. Иерархия через parentPostId. */
export interface Post {
  id: string;
  title: string;
  description?: string;
  parentPostId: string | null;
  departmentId: string;
  role: Role; // RBAC: права наследуются от должности
  level: number;
  orderIndex?: number;
  code?: string;
  cardColor?: string;  // optional: default, blue, green, amber, violet
  cardNotes?: string;  // optional text on org chart card
  createdBy?: string;  // user ID who created the post
}

/** Кто занимает пост (для ответа API). Если null — вакансия. */
export interface PostHolder {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

/** Пост с информацией о занятости (для дерева оргсхемы). */
export interface PostWithHolder extends Post {
  currentHolder: PostHolder | null; // null = вакансия
}

/** User: id, name, email, avatarUrl. Занимает один Post (postId). Роль для RBAC — из Post.role. */
export interface User {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  avatarUrl?: string;
  password?: string;
  postId: string | null; // занимаемая должность; null = не назначен
}

/** При логине возвращаем user + effectiveRole из post. */
export interface AuthUser extends User {
  role: Role; // computed from Post.role when postId is set
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  managerPostId: string | null;
  organizationId: string;
}

/** Instruction привязана к Post (postId, ownerPostId). */
export interface Instruction {
  id: string;
  title: string;
  postId: string;
  status: 'draft' | 'active' | 'archived';
  updatedAt: string;
  ownerPostId: string;
  version: number;
}

/** Statistics привязана к Post. */
export interface PostStatistics {
  id: string;
  postId: string;
  period: string;
  metricCode: string;
  value: number;
}

/** FinancialPlan/Budget: ответственный пост (responsiblePostId). */
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

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  timestamp: string;
  changes?: Record<string, any>;
}
