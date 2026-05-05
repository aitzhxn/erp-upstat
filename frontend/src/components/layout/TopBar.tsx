import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, LogOut, Settings } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '@/store/store';
import { logout } from '@/store/slices/authSlice';
import { clearAuth } from '@/services/authService';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  Admin: 'Администратор',
  Inspector: 'Инспектор',
  'Department Head': 'Рук. отдела',
  'Section Head': 'Рук. секции',
  Employee: 'Сотрудник',
};

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-primary text-white',
  Inspector: 'bg-primarySoft text-primary border border-primarySoftBorder',
  'Department Head': 'bg-primary/15 text-primary border border-primary/20',
  'Section Head': 'bg-primarySoft text-primary border border-primarySoftBorder',
  Employee: 'bg-background text-textSecondary border border-border',
};

export default function TopBar() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [showProfile, setShowProfile] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const user = useSelector((state: RootState) => state.auth.user);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;
    navigate(`/instructions?search=${encodeURIComponent(q)}`);
  };

  const handleLogout = () => {
    dispatch(logout());
    clearAuth();
    setShowProfile(false);
    navigate('/login', { replace: true });
  };

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? 'Сотрудник';
  const roleColor = ROLE_COLORS[user?.role ?? ''] ?? ROLE_COLORS.Employee;

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-5 shrink-0">
      {/* Поиск */}
      <form className="flex-1 max-w-xs" onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textSecondary pointer-events-none" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Поиск по инструкциям..."
            className="input-std h-9 pl-9 pr-3 py-0"
          />
        </div>
      </form>

      {/* Правая часть */}
      <div className="flex items-center gap-2">
        {/* Колокольчик */}
        <button className="relative p-2 rounded-md hover:bg-background transition-colors text-textSecondary hover:text-textPrimary">
          <Bell className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} />
        </button>

        {/* Разделитель */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* Профиль */}
        <div className="relative">
          <button
            onClick={() => setShowProfile((v) => !v)}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1.5 rounded-md hover:bg-background transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-white">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-medium text-textPrimary leading-tight">{user?.name ?? 'Пользователь'}</p>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm', roleColor)}>
                {roleLabel}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-textSecondary" />
          </button>

          {showProfile && (
            <>
              {/* Overlay */}
              <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
              <div className="absolute right-0 mt-1.5 w-52 bg-surface border border-border rounded-lg shadow-lg z-50 py-1.5 overflow-hidden">
                {/* Шапка */}
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[13px] font-semibold text-textPrimary">{user?.name}</p>
                  <p className="text-[11px] text-textSecondary mt-0.5">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-textPrimary hover:bg-background transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-textSecondary" />
                    Настройки профиля
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-textSecondary hover:bg-primarySoft hover:text-primary transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Выйти
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
