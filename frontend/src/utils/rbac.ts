import type { Role } from '@/types';

// Permission matrix
const permissions: Record<Role, string[]> = {
  'Admin': [
    'view:all',
    'edit:all',
    'delete:all',
    'approve:all',
    'audit:all',
    'manage:users',
    'manage:org',
    'rollback:versions',
  ],
  'Inspector': [
    'view:all',
    'audit:all',
    'view:instructions',
    'view:statistics',
    'view:finances',
  ],
  'Department Head': [
    'view:department',
    'edit:department',
    'approve:department',
    'view:instructions',
    'edit:instructions',
    'view:work-plans',
    'edit:work-plans',
    'view:finances',
    'approve:budget',
  ],
  'Section Head': [
    'view:section',
    'edit:section',
    'view:instructions',
    'view:work-plans',
    'edit:work-plans',
  ],
  'Employee': [
    'view:own',
    'edit:own',
    'view:instructions',
  ],
};

export function can(userRole: Role | null, permission: string): boolean {
  if (!userRole) return false;
  const userPermissions = permissions[userRole] || [];
  return userPermissions.includes(permission) || userPermissions.includes('view:all');
}

export function canEdit(userRole: Role | null, resource: string): boolean {
  if (!userRole) return false;
  // org = оргсхема (должности). Права наследуются от Post.role
  switch (userRole) {
    case 'Admin':
      return true;
    case 'Department Head':
      return resource === 'department' || resource === 'org' || resource === 'instructions' || resource === 'work-plans';
    case 'Section Head':
      return resource === 'section' || resource === 'org' || resource === 'work-plans';
    case 'Employee':
      return resource === 'own';
    default:
      return false;
  }
}

export function canDelete(userRole: Role | null): boolean {
  return userRole === 'Admin';
}

export function canApprove(userRole: Role | null, resource: string): boolean {
  if (!userRole) return false;
  
  switch (userRole) {
    case 'Admin':
      return true;
    case 'Department Head':
      return resource === 'department' || resource === 'budget';
    default:
      return false;
  }
}

export function canViewAuditLogs(userRole: Role | null): boolean {
  return userRole === 'Admin' || userRole === 'Inspector';
}

export function canRollbackVersions(userRole: Role | null): boolean {
  return userRole === 'Admin';
}
