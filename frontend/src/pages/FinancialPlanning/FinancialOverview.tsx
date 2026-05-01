import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { financesService, type Budget } from '@/services/financesService';
import { orgService } from '@/services/orgService';
import { Plus, Trash2, CheckCircle, Loader2, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRub(v: number) {
  return v.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Согласован</span>;
  if (status === 'rejected')
    return <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Отклонён</span>;
  return <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">На согласовании</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const PERIODS = [
  { value: '2026-Q1', label: '2026 — I кв.' },
  { value: '2026-Q2', label: '2026 — II кв.' },
  { value: '2026-Q3', label: '2026 — III кв.' },
  { value: '2026-Q4', label: '2026 — IV кв.' },
  { value: '2026', label: '2026 — Год' },
];

// ─── Main ───────────────────────────────────────────────────────────────────

export default function FinancialOverview() {
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === 'Admin';
  const canManage = isAdmin || user?.role === 'Department Head';

  const [period, setPeriod] = useState('2026-Q1');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Форма создания
  const [form, setForm] = useState({
    departmentId: '',
    category: '',
    planned: '',
    limits: '',
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    financesService.getBudgets(undefined, period)
      .then(setBudgets)
      .catch(() => setBudgets([]))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    orgService.getDepartments().then((list) => setDepartments(list as any)).catch(() => {});
  }, []);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const updated = await financesService.approve(id);
      setBudgets((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch {
      setError('Не удалось согласовать бюджет');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту запись бюджета?')) return;
    setDeletingId(id);
    try {
      await financesService.delete(id);
      setBudgets((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError('Не удалось удалить запись');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.departmentId || !form.category || !form.planned) {
      setError('Заполните все обязательные поля');
      return;
    }
    const planned = Number(form.planned);
    if (Number.isNaN(planned) || planned <= 0) {
      setError('Сумма плана должна быть положительным числом');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await financesService.create({
        departmentId: form.departmentId,
        category: form.category,
        period,
        planned,
        limits: form.limits ? Number(form.limits) : planned,
      });
      setBudgets((prev) => [...prev, created]);
      setForm({ departmentId: '', category: '', planned: '', limits: '' });
      setShowCreateForm(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ошибка при создании записи');
    } finally {
      setCreating(false);
    }
  };

  const totals = budgets.reduce(
    (acc, b) => ({
      planned: acc.planned + b.planned,
      approved: acc.approved + b.approved,
      spent: acc.spent + b.spent,
      remaining: acc.remaining + b.remaining,
      pending: acc.pending + (b.approvalStatus === 'pending' ? b.planned : 0),
    }),
    { planned: 0, approved: 0, spent: 0, remaining: 0, pending: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Финансовое планирование</h1>
          <p className="text-sm text-textSecondary mt-1">Управление бюджетами и согласования</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {canManage && (
            <Button onClick={() => setShowCreateForm((v) => !v)} size="sm">
              {showCreateForm ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {showCreateForm ? 'Свернуть' : 'Добавить бюджет'}
            </Button>
          )}
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {/* Форма создания */}
      {showCreateForm && canManage && (
        <Card>
          <CardHeader><CardTitle>Новая запись бюджета</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textSecondary">Отдел *</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Выберите отдел</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textSecondary">Категория *</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Напр.: Зарплаты"
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textSecondary">Сумма плана, ₽ *</label>
                <input
                  type="number"
                  min={1}
                  value={form.planned}
                  onChange={(e) => setForm((f) => ({ ...f, planned: e.target.value }))}
                  placeholder="0"
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textSecondary">Лимит, ₽</label>
                <input
                  type="number"
                  min={1}
                  value={form.limits}
                  onChange={(e) => setForm((f) => ({ ...f, limits: e.target.value }))}
                  placeholder="Равно плану"
                  className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} disabled={creating} size="sm">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Создать
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(false); setError(null); }}>
                Отмена
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI-итоги */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Плановый бюджет', value: formatRub(totals.planned), sub: 'Все статьи' },
          { label: 'Согласовано', value: formatRub(totals.approved), sub: 'Утверждённые бюджеты' },
          { label: 'Остаток', value: formatRub(totals.remaining), sub: 'Доступные средства' },
          { label: 'Ожидают согласования', value: formatRub(totals.pending), sub: `${budgets.filter(b => b.approvalStatus === 'pending').length} статей` },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5 pb-5">
              <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide">{item.label}</p>
              <p className="text-xl font-bold text-textPrimary mt-1 truncate">{item.value}</p>
              <p className="text-xs text-textSecondary mt-1">{item.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Таблица бюджетов */}
      <Card>
        <CardHeader><CardTitle>Бюджетные статьи — {PERIODS.find(p => p.value === period)?.label}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-textSecondary py-8 text-center">Нет бюджетных статей за выбранный период</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-3 font-medium text-textSecondary">Отдел</th>
                    <th className="text-left py-3 px-3 font-medium text-textSecondary">Категория</th>
                    <th className="text-right py-3 px-3 font-medium text-textSecondary">План</th>
                    <th className="text-right py-3 px-3 font-medium text-textSecondary">Согласовано</th>
                    <th className="text-right py-3 px-3 font-medium text-textSecondary">Израсходовано</th>
                    <th className="text-left py-3 px-3 font-medium text-textSecondary min-w-[120px]">Освоение</th>
                    <th className="text-center py-3 px-3 font-medium text-textSecondary">Статус</th>
                    <th className="text-center py-3 px-3 font-medium text-textSecondary">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {budgets.map((b) => (
                    <tr key={b.id} className="hover:bg-background/50 transition-colors">
                      <td className="py-3 px-3 font-medium text-textPrimary">{b.department ?? b.departmentId}</td>
                      <td className="py-3 px-3 text-textSecondary">{b.category}</td>
                      <td className="py-3 px-3 text-right text-textPrimary">{formatRub(b.planned)}</td>
                      <td className="py-3 px-3 text-right text-textPrimary">{formatRub(b.approved)}</td>
                      <td className="py-3 px-3 text-right text-textPrimary">{formatRub(b.spent)}</td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <ProgressBar value={b.spent} max={b.planned} />
                          <span className="text-xs text-textSecondary">
                            {b.planned > 0 ? Math.round((b.spent / b.planned) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <StatusBadge status={b.approvalStatus} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {canManage && b.approvalStatus === 'pending' && (
                            <button
                              onClick={() => handleApprove(b.id)}
                              disabled={approvingId === b.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 transition-colors disabled:opacity-50"
                              title="Согласовать"
                            >
                              {approvingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              Согласовать
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(b.id)}
                              disabled={deletingId === b.id}
                              className="p-1.5 rounded-md text-textSecondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Удалить"
                            >
                              {deletingId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
