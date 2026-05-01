import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { RootState } from '@/store/store';
import { orgService } from '@/services/orgService';
import { financesService, type Budget } from '@/services/financesService';
import { workPlansService, type WorkPlanItem } from '@/services/workPlansService';
import { auditService, type AuditLogEntry } from '@/services/auditService';
import {
  Users,
  FileCheck2,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  SendHorizontal,
  DollarSign,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

const WORKFLOW_LABELS: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'На согласовании',
  approved: 'Утверждён',
  rejected: 'Отклонён',
  revision_requested: 'На доработке',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  post: 'Должность',
  user: 'Пользователь',
  budget: 'Бюджет',
  department: 'Отдел',
  instruction: 'Инструкция',
  work_plan: 'Рабочий план',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Создан',
  updated: 'Обновлён',
  deleted: 'Удалён',
  assign: 'Назначен',
  vacate: 'Освобождён',
  approved: 'Согласован',
  rejected: 'Отклонён',
  submitted: 'Отправлен',
  make_admin: 'Назначен администратором',
  remove_admin: 'Снят с роли администратора',
  create: 'Создан',
  update: 'Обновлён',
  delete: 'Удалён',
};

function workflowBadge(status: string) {
  switch (status) {
    case 'approved':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />{WORKFLOW_LABELS[status]}</span>;
    case 'rejected':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />{WORKFLOW_LABELS[status]}</span>;
    case 'submitted':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full"><SendHorizontal className="w-3 h-3" />{WORKFLOW_LABELS[status]}</span>;
    case 'revision_requested':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><RotateCcw className="w-3 h-3" />{WORKFLOW_LABELS[status]}</span>;
    default:
      return <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{WORKFLOW_LABELS[status] ?? status}</span>;
  }
}

function formatRub(v: number) {
  return v.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  return `${d} д. назад`;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KPIBlock({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-textSecondary uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-textPrimary mt-1">{value}</p>
            {sub && <p className="text-xs text-textSecondary mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const user = useSelector((state: RootState) => state.auth.user);
  const [users, setUsers] = useState<{ postId?: string | null }[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [workPlans, setWorkPlans] = useState<WorkPlanItem[]>([]);
  const [pendingForMe, setPendingForMe] = useState<WorkPlanItem[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [usersRes, budgetsRes, workPlansRes, pendingRes, auditRes] = await Promise.all([
          orgService.getUsers(),
          financesService.getBudgets(),
          workPlansService.getList(),
          workPlansService.getList({ forMyApproval: true }),
          auditService.getRecent(15),
        ]);
        setUsers(Array.isArray(usersRes) ? usersRes : []);
        setBudgets(Array.isArray(budgetsRes) ? budgetsRes : []);
        setWorkPlans(Array.isArray(workPlansRes) ? workPlansRes : []);
        setPendingForMe(Array.isArray(pendingRes) ? pendingRes : []);
        setRecentAudit(Array.isArray(auditRes) ? auditRes : []);
      } catch {
        // silently ignore — UI shows empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const employeeCount = users.filter((u) => u.postId != null).length;
  const vacantCount = users.filter((u) => u.postId == null).length;
  const pendingBudgets = budgets.filter((b) => b.approvalStatus === 'pending');
  const submittedPlans = workPlans.filter((wp) => wp.workflowStatus === 'submitted');
  const myPlans = workPlans.filter((wp) => !user?.postId || wp.postId === user.postId).slice(0, 6);
  const totalBudgetPlanned = budgets.reduce((s, b) => s + b.planned, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Дашборд</h1>
          <p className="text-sm text-textSecondary mt-1">Загрузка данных...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-5 pb-5 h-24 animate-pulse bg-slate-100 rounded-xl">{null}</CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Дашборд</h1>
        <p className="text-sm text-textSecondary mt-1">
          Добро пожаловать, <span className="font-medium text-textPrimary">{user?.name}</span>
        </p>
      </div>

      {/* KPI-карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPIBlock
          label="Сотрудников"
          value={employeeCount}
          sub={vacantCount > 0 ? `${vacantCount} вакантных должностей` : 'Все должности заняты'}
          icon={Users}
          accent="bg-blue-100 text-blue-600"
        />
        <KPIBlock
          label="На согласовании"
          value={pendingForMe.length + pendingBudgets.length}
          sub={`${pendingForMe.length} планов · ${pendingBudgets.length} бюджетов`}
          icon={AlertTriangle}
          accent={pendingForMe.length + pendingBudgets.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}
        />
        <KPIBlock
          label="Рабочих планов"
          value={workPlans.length}
          sub={`${submittedPlans.length} ожидают утверждения`}
          icon={FileCheck2}
          accent="bg-indigo-100 text-indigo-600"
        />
        <KPIBlock
          label="Бюджет (план)"
          value={formatRub(totalBudgetPlanned)}
          sub={`${budgets.length} статей · ${pendingBudgets.length} pending`}
          icon={DollarSign}
          accent="bg-emerald-100 text-emerald-600"
        />
      </div>

      {/* Алерты */}
      {(pendingForMe.length > 0 || pendingBudgets.length > 0) && (
        <div className="flex flex-col gap-2">
          {pendingForMe.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-800">
                <span className="font-semibold">{pendingForMe.length}</span> рабочих планов ожидают вашего согласования
              </span>
              <Link to="/work-plans" className="ml-auto flex items-center gap-1 text-amber-700 font-medium hover:underline whitespace-nowrap">
                Перейти <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
          {pendingBudgets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
              <DollarSign className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-blue-800">
                <span className="font-semibold">{pendingBudgets.length}</span> бюджетов ожидают согласования
              </span>
              <Link to="/financial-planning" className="ml-auto flex items-center gap-1 text-blue-700 font-medium hover:underline whitespace-nowrap">
                Перейти <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Основные блоки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Мои рабочие планы */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Мои рабочие планы</CardTitle>
              <Link to="/work-plans" className="text-xs text-primary hover:underline flex items-center gap-1">
                Все планы <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {myPlans.length === 0 ? (
              <p className="text-sm text-textSecondary py-6 text-center">Нет рабочих планов</p>
            ) : (
              <div className="divide-y divide-border">
                {myPlans.map((wp) => (
                  <div key={wp.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate">{wp.title}</p>
                      {wp.dueDate && (
                        <p className="text-xs text-textSecondary flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(wp.dueDate).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </div>
                    {workflowBadge(wp.workflowStatus)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* На согласовании у меня */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Ожидают моего решения</CardTitle>
              <Link to="/work-plans" className="text-xs text-primary hover:underline flex items-center gap-1">
                Все <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {pendingForMe.length === 0 && pendingBudgets.length === 0 ? (
              <p className="text-sm text-textSecondary py-6 text-center">Нет ожидающих согласования</p>
            ) : (
              <div className="divide-y divide-border">
                {pendingForMe.slice(0, 4).map((wp) => (
                  <div key={wp.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate">{wp.title}</p>
                      <p className="text-xs text-textSecondary mt-0.5">Рабочий план</p>
                    </div>
                    {workflowBadge(wp.workflowStatus)}
                  </div>
                ))}
                {pendingBudgets.slice(0, 3).map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-textPrimary truncate">{b.category}</p>
                      <p className="text-xs text-textSecondary mt-0.5">Бюджет · {b.department ?? b.departmentId}</p>
                    </div>
                    <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {formatRub(b.planned)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Журнал действий */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Журнал действий</CardTitle>
            <span className="text-xs text-textSecondary">Последние {recentAudit.length} событий</span>
          </div>
        </CardHeader>
        <CardContent>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-textSecondary py-6 text-center">Нет записей</p>
          ) : (
            <div className="divide-y divide-border">
              {recentAudit.map((log) => (
                <div key={log.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-textPrimary">
                      <span className="font-medium">{log.userName ?? 'Система'}</span>
                      {' · '}
                      <span className="text-textSecondary">
                        {ACTION_LABELS[log.action] ?? log.action}
                        {' — '}
                        {ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs text-textSecondary whitespace-nowrap shrink-0">
                    {timeAgo(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
