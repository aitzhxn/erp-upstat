import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Calendar,
  MessageSquare,
  DollarSign,
  ShieldCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RootState } from '@/store/store';
import { communicationService } from '@/services/communicationService';
import { workPlansService } from '@/services/workPlansService';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard',          label: 'Дашборд',             icon: LayoutDashboard, path: '/dashboard' },
  { id: 'org-chart',          label: 'Орг. структура',      icon: Users,           path: '/org-chart' },
  { id: 'departments',        label: 'Отделы',              icon: Building2,       path: '/departments', adminOnly: true },
  { id: 'statistics',         label: 'Статистика',          icon: BarChart3,       path: '/statistics' },
  { id: 'instructions',       label: 'Инструкции',          icon: FileText,        path: '/instructions' },
  { id: 'work-plans',         label: 'Рабочие планы',       icon: Calendar,        path: '/work-plans' },
  { id: 'financial-planning', label: 'Финансы',             icon: DollarSign,      path: '/financial-planning' },
  { id: 'communication',      label: 'Коммуникация',        icon: MessageSquare,   path: '/communication' },
  { id: 'users',              label: 'Пользователи',        icon: ShieldCheck,     path: '/users', adminOnly: true },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [workPlanNotifCount, setWorkPlanNotifCount] = useState(0);
  const location = useLocation();
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === 'Admin';
  const visibleItems = menuItems.filter((item) => !item.adminOnly || isAdmin);

  const refreshUnread = () => {
    communicationService.getUnreadCount().then(setUnreadCount).catch(() => setUnreadCount(0));
  };

  const refreshWorkPlanNotifications = () => {
    workPlansService.getNotificationCount().then(setWorkPlanNotifCount).catch(() => setWorkPlanNotifCount(0));
  };

  useEffect(() => {
    refreshUnread();
    refreshWorkPlanNotifications();
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => {
      refreshUnread();
      refreshWorkPlanNotifications();
    };
    window.addEventListener('communication-unread-changed', handler);
    return () => window.removeEventListener('communication-unread-changed', handler);
  }, []);

  useEffect(() => {
    refreshWorkPlanNotifications();
    const interval = setInterval(refreshWorkPlanNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={cn(
        'flex flex-col transition-all duration-300 shrink-0',
        'bg-sidebar-bg border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Лого / Бренд */}
      <div
        className={cn(
          'flex items-center h-16 border-b border-sidebar-border px-4 shrink-0',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white tracking-wide">UpStat ERP</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md hover:bg-sidebar-hover transition-colors text-sidebar-text hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Навигация */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          const badgeCount =
            item.id === 'communication'
              ? unreadCount
              : item.id === 'work-plans'
                ? workPlanNotifCount
                : 0;

          return (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md transition-colors relative',
                collapsed ? 'px-0 justify-center py-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'bg-sidebar-active text-sidebar-textActive'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              )}
            >
              {/* Левая полоска для активного */}
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
              )}

              <span className="relative shrink-0">
                <Icon className="w-[18px] h-[18px]" />
                {badgeCount > 0 && (
                  <span
                    className={cn(
                      'absolute flex items-center justify-center bg-primary text-white font-bold rounded-full ring-2 ring-sidebar-bg',
                      collapsed
                        ? '-top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 text-[9px]'
                        : '-top-1 -right-1.5 min-w-[16px] h-[16px] text-[9px]'
                    )}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>

              {!collapsed && (
                <span className="text-[13px] font-medium leading-none">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Кнопка разворота (collapsed) */}
      {collapsed && (
        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-md hover:bg-sidebar-hover transition-colors text-sidebar-text hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Профиль пользователя внизу */}
      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-white">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-white truncate leading-tight">{user?.name}</p>
              <p className="text-[11px] text-sidebar-text truncate leading-tight mt-0.5">{user?.role}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
