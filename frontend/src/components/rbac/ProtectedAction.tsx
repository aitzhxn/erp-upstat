import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import type { Role } from '@/types';
import { can, canEdit, canDelete, canApprove } from '@/utils/rbac';

interface ProtectedActionProps {
  children: ReactNode;
  permission?: string;
  action?: 'edit' | 'delete' | 'approve';
  resource?: string;
  fallback?: ReactNode;
  disabled?: boolean;
  disabledTooltip?: string;
}

export default function ProtectedAction({
  children,
  permission,
  action,
  resource,
  fallback = null,
  disabled = false,
  disabledTooltip,
}: ProtectedActionProps) {
  const userRole = useSelector((state: RootState) => state.auth.user?.role) as Role | null;

  let hasPermission = false;

  if (permission) {
    hasPermission = can(userRole, permission);
  } else if (action && resource) {
    switch (action) {
      case 'edit':
        hasPermission = canEdit(userRole, resource);
        break;
      case 'delete':
        hasPermission = canDelete(userRole);
        break;
      case 'approve':
        hasPermission = canApprove(userRole, resource);
        break;
    }
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  if (disabled) {
    return (
      <div className="relative group">
        {children}
        {disabledTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-textPrimary text-surface text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            {disabledTooltip}
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
