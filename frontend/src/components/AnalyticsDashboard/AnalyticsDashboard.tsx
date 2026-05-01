import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { statisticsService } from '@/services/statisticsService';
import { orgService } from '@/services/orgService';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  BarChart2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AnalyticsChart } from './AnalyticsChart';
import type { AnalyticsDataPoint } from './types';
import { cn } from '@/lib/utils';

type PeriodType = 'week' | 'month' | 'quarter' | 'year';

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

function getInitialPeriod(pt: PeriodType): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (pt === 'week') return getWeekStart(d);
  if (pt === 'month') return `${y}-${m}`;
  if (pt === 'quarter') return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return String(y);
}

function getPrevPeriod(pt: PeriodType, period: string): string {
  if (pt === 'week') {
    const d = new Date(period + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return getWeekStart(d);
  }
  if (pt === 'month') {
    const [y, mo] = period.split('-').map(Number);
    const d = new Date(y, mo - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (pt === 'quarter') {
    const [y, q] = [parseInt(period.slice(0, 4), 10), parseInt(period.slice(6), 10)];
    return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
  }
  return String(parseInt(period, 10) - 1);
}

function getNextPeriod(pt: PeriodType, period: string): string {
  if (pt === 'week') {
    const d = new Date(period + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return getWeekStart(d);
  }
  if (pt === 'month') {
    const [y, mo] = period.split('-').map(Number);
    const d = new Date(y, mo, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (pt === 'quarter') {
    const [y, q] = [parseInt(period.slice(0, 4), 10), parseInt(period.slice(6), 10)];
    return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  }
  return String(parseInt(period, 10) + 1);
}

function formatPeriodLabel(pt: PeriodType, period: string): string {
  if (pt === 'week') {
    const d = new Date(period + 'T12:00:00');
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${period} — ${end.toISOString().slice(0, 10)}`;
  }
  if (pt === 'month') {
    const [y, m] = period.split('-');
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }
  if (pt === 'quarter') return period;
  return period;
}

function formatVal(v: number, unit?: string) {
  const s = Number.isInteger(v)
    ? v.toLocaleString('ru-RU')
    : v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unit ? `${s} ${unit}` : s;
}

function filterRows(rows: any[], code: string) {
  return code ? rows.filter((r) => r.metricCode === code) : rows;
}

function getLineColor(idx: number): string {
  const colors = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
  return colors[idx % colors.length];
}

/** Кольцо прогресса SVG */
function ProgressRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  const color = pct >= 100 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

/** Горизонтальный прогресс-бар */
function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  const color = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={cn('w-full h-1.5 bg-slate-200 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

/** Бейдж выполнения плана */
function PctBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 100
      ? 'bg-green-100 text-green-700'
      : pct >= 60
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', cls)}>
      {pct}%
    </span>
  );
}

const PERIOD_TABS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'year', label: 'Год' },
];

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function AnalyticsDashboard() {
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [metrics, setMetrics] = useState<Array<{ code: string; name: string; unit: string }>>([]);

  const [departmentId, setDepartmentId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [metricCode, setMetricCode] = useState('');

  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [period, setPeriod] = useState(() => getInitialPeriod('week'));

  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  const [loading, setLoading] = useState(false);
  const [gridData, setGridData] = useState<any>(null);

  useEffect(() => {
    setPeriod(getInitialPeriod(periodType));
  }, [periodType]);

  useEffect(() => {
    orgService.getDepartments().then((l) => setDepartments(l as any)).catch(() => {});
    orgService.getUsers().then((l) => setUsers(l as any)).catch(() => {});
    statisticsService.getMetricDefinitions().then(setMetrics).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    statisticsService
      .getGrid({
        periodType,
        period,
        weekStart: periodType === 'week' ? period : undefined,
        departmentId: departmentId || undefined,
        responsibleUserId: responsibleId || undefined,
        myData: false,
      })
      .then(setGridData)
      .catch(() => setGridData(null))
      .finally(() => setLoading(false));
  }, [departmentId, responsibleId, periodType, period]);

  const allRows: any[] = gridData?.rows ?? [];
  const dates: string[] = gridData?.dates ?? [];
  const filteredRows = filterRows(allRows, metricCode);

  const totalFact = filteredRows.reduce((s: number, r: any) => s + r.weekTotal, 0);
  const totalPlan = filteredRows.reduce((s: number, r: any) => s + (r.plan > 0 ? r.plan : 0), 0);
  const planPct = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : null;
  const rowsWithPlan = filteredRows.filter((r: any) => r.plan > 0);
  const bestRow: any | null = rowsWithPlan.reduce(
    (best: any, r: any) => {
      const pct = r.plan > 0 ? (r.weekTotal / r.plan) * 100 : 0;
      return pct > (best ? (best.weekTotal / best.plan) * 100 : -1) ? r : best;
    },
    null
  );

  // Данные для линейного графика (много метрик)
  const dynamicsData = (() => {
    if (!dates.length || !filteredRows.length) return [];
    if (periodType === 'week') {
      return dates.map((date: string, i: number) => {
        const pt: any = { date: `${DAY_LABELS[i]} ${date.slice(8)}` };
        filteredRows.forEach((row: any) => {
          pt[row.metricCode] = row.days[date] ?? 0;
        });
        return pt;
      });
    }
    if (periodType === 'month') {
      return dates.map((date: string) => {
        const pt: any = { date: date.slice(8) };
        filteredRows.forEach((row: any) => {
          pt[row.metricCode] = row.days[date] ?? 0;
        });
        return pt;
      });
    }
    if (periodType === 'quarter') {
      const weeks: { label: string; dates: string[] }[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const chunk = dates.slice(i, i + 7);
        if (chunk.length) weeks.push({ label: `Нед.${weeks.length + 1}`, dates: chunk });
      }
      return weeks.map((w) => {
        const pt: any = { date: w.label };
        filteredRows.forEach((row: any) => {
          pt[row.metricCode] = w.dates.reduce((s: number, d: string) => s + (row.days[d] ?? 0), 0);
        });
        return pt;
      });
    }
    // year
    const byMonth: Record<string, string[]> = {};
    dates.forEach((d: string) => {
      const key = d.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(d);
    });
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return Object.entries(byMonth).map(([ym, ds]) => {
      const [, mo] = ym.split('-');
      const pt: any = { date: months[parseInt(mo, 10) - 1] };
      filteredRows.forEach((row: any) => {
        pt[row.metricCode] = ds.reduce((s: number, d: string) => s + (row.days[d] ?? 0), 0);
      });
      return pt;
    });
  })();

  // Данные для AnalyticsChart (одна метрика)
  const singleMetricData: AnalyticsDataPoint[] = (() => {
    if (filteredRows.length !== 1 || periodType !== 'week') return [];
    const row = filteredRows[0];
    const dailyGoal = row.dailyTarget ?? (row.plan > 0 ? row.plan / 7 : 0);
    return dates.map((date: string) => ({
      date,
      value: row.days[date] ?? 0,
      goal: dailyGoal,
    }));
  })();

  // Данные для бар-чарта (план vs факт по метрикам)
  const barData = filteredRows.map((row: any) => ({
    name: row.metricName.length > 18 ? row.metricName.slice(0, 16) + '…' : row.metricName,
    fullName: `${row.metricName} (${row.postTitle})`,
    unit: row.unit,
    fact: row.weekTotal,
    plan: row.plan > 0 ? row.plan : null,
  }));

  const hasData = filteredRows.length > 0;

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            {/* Тип периода */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-textSecondary">Период</span>
              <div className="flex rounded-lg border border-border p-0.5 bg-surface gap-0.5">
                {PERIOD_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setPeriodType(t.key)}
                    className={cn(
                      'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                      periodType === t.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-textSecondary hover:text-textPrimary hover:bg-background'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Навигация по периоду */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-textSecondary opacity-0">nav</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-9 w-8 p-0" onClick={() => setPeriod(getPrevPeriod(periodType, period))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-textPrimary min-w-[176px] text-center">
                  {formatPeriodLabel(periodType, period)}
                </span>
                <Button variant="outline" size="sm" className="h-9 w-8 p-0" onClick={() => setPeriod(getNextPeriod(periodType, period))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-textSecondary">Отдел</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
              >
                <option value="">Все отделы</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-textSecondary">Сотрудник</label>
              <select
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[160px]"
              >
                <option value="">Все</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-textSecondary">Метрика</label>
              <select
                value={metricCode}
                onChange={(e) => setMetricCode(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[160px]"
              >
                <option value="">Все метрики</option>
                {metrics.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="py-14">
            <p className="text-sm text-textSecondary text-center">
              Нет данных для отображения. Попробуйте изменить фильтры или период.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI-карточки */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Показателей в выборке */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">Показателей</p>
                    <p className="text-3xl font-bold text-textPrimary mt-1">{filteredRows.length}</p>
                    <p className="text-xs text-textSecondary mt-1">
                      {metricCode ? metrics.find((m) => m.code === metricCode)?.name : 'Все метрики'}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BarChart2 className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Выполнение плана */}
            {planPct !== null ? (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">Выполнение плана</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-3xl font-bold text-textPrimary">{planPct}%</p>
                        {planPct >= 100 ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <ProgressBar pct={planPct} className="mt-2" />
                      <p className="text-xs text-textSecondary mt-1.5">
                        {formatVal(totalFact)} / {formatVal(totalPlan)}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0">
                      <ProgressRing pct={planPct} size={56} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">Итого факт</p>
                      <p className="text-3xl font-bold text-textPrimary mt-1">{formatVal(totalFact)}</p>
                      <p className="text-xs text-textSecondary mt-1">За выбранный период</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-emerald-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Лидер / количество сотрудников */}
            {bestRow ? (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">Лучший показатель</p>
                      <p className="text-base font-bold text-textPrimary mt-1 truncate">{bestRow.metricName}</p>
                      <p className="text-xs text-textSecondary truncate">{bestRow.postTitle}</p>
                      <p className="text-xs font-medium text-green-600 mt-1">
                        {Math.round((bestRow.weekTotal / bestRow.plan) * 100)}% выполнения
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-textSecondary uppercase tracking-wide">Сотрудников</p>
                      <p className="text-3xl font-bold text-textPrimary mt-1">
                        {new Set(filteredRows.map((r: any) => r.responsibleUserId).filter(Boolean)).size || '—'}
                      </p>
                      <p className="text-xs text-textSecondary mt-1">С назначенными метриками</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-violet-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Карточки метрик с прогресс-барами */}
          <div>
            <h3 className="text-sm font-semibold text-textSecondary uppercase tracking-wide mb-3">
              Показатели за период
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRows.map((row: any) => {
                const pct = row.plan > 0 ? Math.round((row.weekTotal / row.plan) * 100) : null;
                return (
                  <Card
                    key={`${row.postId}-${row.metricCode}`}
                    className={cn(
                      'border-l-4 transition-shadow hover:shadow-md',
                      pct === null
                        ? 'border-l-slate-300'
                        : pct >= 100
                          ? 'border-l-green-500'
                          : pct >= 60
                            ? 'border-l-amber-500'
                            : 'border-l-red-500'
                    )}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-textPrimary text-sm leading-tight truncate">
                            {row.metricName}
                          </p>
                          <p className="text-xs text-textSecondary truncate mt-0.5">{row.postTitle}</p>
                        </div>
                        {pct !== null && <PctBadge pct={pct} />}
                      </div>

                      {/* Факт / план */}
                      <div className="flex items-end justify-between mb-1.5">
                        <span className="text-2xl font-bold text-textPrimary">
                          {formatVal(row.weekTotal, row.unit)}
                        </span>
                        {row.plan > 0 && (
                          <span className="text-xs text-textSecondary">
                            из {formatVal(row.plan, row.unit)}
                          </span>
                        )}
                      </div>

                      {pct !== null && <ProgressBar pct={pct} className="mb-2" />}

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          {row.responsibleUserAvatar ? (
                            <img src={row.responsibleUserAvatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                              {(row.responsibleUserName ?? '?')[0]}
                            </div>
                          )}
                          <span className="text-xs text-textSecondary truncate max-w-[120px]">
                            {row.responsibleUserName ?? 'Не назначен'}
                          </span>
                        </div>
                        <span className="text-xs text-textSecondary truncate max-w-[100px]">
                          {row.departmentName}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Одна метрика за неделю → AnalyticsChart с тогглом area/bar */}
          {singleMetricData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle>
                    Динамика: {filteredRows[0]?.metricName}
                  </CardTitle>
                  <div className="flex rounded-lg border border-border p-0.5 bg-surface gap-0.5">
                    {(['area', 'bar'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setChartType(t)}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-medium transition-colors',
                          chartType === t
                            ? 'bg-primary text-primary-foreground'
                            : 'text-textSecondary hover:text-textPrimary hover:bg-background'
                        )}
                      >
                        {t === 'area' ? 'Площадь' : 'Столбцы'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AnalyticsChart data={singleMetricData} chartType={chartType} />
              </CardContent>
            </Card>
          )}

          {/* Динамика по нескольким метрикам */}
          {filteredRows.length > 1 && dynamicsData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Динамика по дням
                  {periodType === 'month' && ' месяца'}
                  {periodType === 'quarter' && ' (по неделям)'}
                  {periodType === 'year' && ' (по месяцам)'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280} debounce={1}>
                  <LineChart data={dynamicsData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number | undefined, _name: string | undefined, props: any) => [
                        formatVal(value ?? 0),
                        props?.dataKey ?? '',
                      ]}
                    />
                    <Legend
                      formatter={(value) => {
                        const row = filteredRows.find((r: any) => r.metricCode === value);
                        return row ? row.metricName : value;
                      }}
                    />
                    {filteredRows.map((row: any, idx: number) => (
                      <Line
                        key={`${row.postId}-${row.metricCode}`}
                        type="monotone"
                        dataKey={row.metricCode}
                        name={row.metricCode}
                        stroke={getLineColor(idx)}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Бар-чарт: факт vs план */}
          {barData.length > 0 && barData.some((r: any) => r.plan !== null) && (
            <Card>
              <CardHeader>
                <CardTitle>Факт vs план за период</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280} debounce={1}>
                  <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={72}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number | undefined, name: string | undefined, props: any) => [
                        `${formatVal(value ?? 0, props?.payload?.unit)}`,
                        name === 'fact' ? 'Факт' : 'План',
                      ]}
                      labelFormatter={(label, payload) => (payload as any)?.[0]?.payload?.fullName ?? label}
                    />
                    <Legend
                      formatter={(value) => (value === 'fact' ? 'Факт' : 'План')}
                      verticalAlign="top"
                      height={28}
                    />
                    <Bar dataKey="plan" name="plan" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="fact" name="fact" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
