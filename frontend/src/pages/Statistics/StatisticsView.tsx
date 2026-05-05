import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  statisticsService,
  METRIC_DEFINITIONS_FALLBACK,
  type MetricDefinition,
} from '@/services/statisticsService';
import CreateMetricDialog from './CreateMetricDialog';
import { orgService } from '@/services/orgService';
import type { PostWithHolder } from '@/types';
import type { RootState } from '@/store/store';
import { Plus, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import DeleteMetricDialog from './DeleteMetricDialog';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';

/** Returns Monday of the week (local time) as YYYY-MM-DD. Sunday = last day of week. */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Go back to Monday
  d.setDate(d.getDate() + diff);
  return formatDateLocal(d);
}

/** Format date as YYYY-MM-DD in local time (no UTC shift). */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type GridRow = {
  postId: string;
  postTitle: string;
  metricCode: string;
  metricName: string;
  unit: string;
  dailyTarget: number | null;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  responsibleUserAvatar: string | null;
  departmentId: string;
  departmentName: string;
  days: Record<string, number>;
  weekTotal: number;
  plan: number;
};

export default function StatisticsView() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [gridData, setGridData] = useState<{
    weekStart: string;
    dates: string[];
    rows: GridRow[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [metricDefinitions, setMetricDefinitions] = useState<MetricDefinition[]>([]);
  const [posts, setPosts] = useState<PostWithHolder[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; avatarUrl?: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('');
  const [myDataOnly, setMyDataOnly] = useState(true);

  const [addRowMode, setAddRowMode] = useState(false);
  const [addMetricCode, setAddMetricCode] = useState('');
  const [addResponsibleId, setAddResponsibleId] = useState('');
  const [addDailyTarget, setAddDailyTarget] = useState('');
  const [addPostId, setAddPostId] = useState('');

  const [createMetricOpen, setCreateMetricOpen] = useState(false);
  const [deleteMetricOpen, setDeleteMetricOpen] = useState(false);
  const [deletingRowKey, setDeletingRowKey] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'visualizations' | 'data-entry'>('visualizations');
  const [toastError, setToastError] = useState<string | null>(null);
  /** Текущая редактируемая ячейка: при вводе показываем это значение, после успешного сохранения сбрасываем */
  const [editingCell, setEditingCell] = useState<{ key: string; value: number } | null>(null);
  const gridInputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const showError = useCallback((message: string) => {
    setToastError(message);
    setTimeout(() => setToastError(null), 5000);
  }, []);
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === 'Admin';
  const canViewAnalytics = user?.role === 'Admin' || user?.role === 'Department Head' || user?.role === 'Section Head';

  const metricsList = metricDefinitions.length > 0 ? metricDefinitions : METRIC_DEFINITIONS_FALLBACK;

  const fetchGrid = useCallback((cacheBust = false) => {
    if (!user?.id) return Promise.resolve();
    setLoading(true);
    return statisticsService
      .getGrid({
        weekStart,
        departmentId: departmentFilter || undefined,
        responsibleUserId: responsibleFilter || undefined,
        myData: myDataOnly,
        _cacheBust: cacheBust,
      })
      .then(setGridData)
      .catch((err) => {
        console.error('Statistics: getGrid failed', err?.response?.data?.details ?? err.message);
        setGridData(null);
      })
      .finally(() => setLoading(false));
  }, [user?.id, weekStart, departmentFilter, responsibleFilter, myDataOnly]);

  useEffect(() => {
    fetchGrid();
  }, [fetchGrid]);

  useEffect(() => {
    statisticsService.getMetricDefinitions().then(setMetricDefinitions).catch(() => setMetricDefinitions([]));
  }, []);


  useEffect(() => {
    orgService.getPosts().then(setPosts).catch(() => setPosts([]));
  }, []);

  useEffect(() => {
    orgService.getUsers().then((list) => setUsers(list as any)).catch(() => setUsers([]));
  }, []);

  const refreshMetrics = useCallback(() => {
    statisticsService.getMetricDefinitions().then(setMetricDefinitions).catch(() => setMetricDefinitions([]));
  }, []);

  useEffect(() => {
    orgService.getDepartments().then((list) => setDepartments(list as any)).catch(() => setDepartments([]));
  }, []);

  const handleCellBlur = useCallback(
    async (row: GridRow, date: string, value: number, onSuccess?: () => void) => {
      const key = `${row.postId}-${row.metricCode}-${date}`;
      setSavingCell(key);
      try {
        await statisticsService.saveDailyEntry({
          postId: row.postId,
          metricCode: row.metricCode,
          date,
          value,
        });
        // Оптимистичное обновление: сразу показываем новое значение (не вызываем fetchGrid — он перезаписывал ответом с 0)
        setGridData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: prev.rows.map((r) =>
              r.postId === row.postId && r.metricCode === row.metricCode
                ? { ...r, days: { ...r.days, [date]: value }, weekTotal: Object.values({ ...r.days, [date]: value }).reduce((s, v) => s + v, 0) }
                : r
            ),
          };
        });
        onSuccess?.();
      } catch (err: unknown) {
        const res = (err as { response?: { status?: number; data?: { error?: string; details?: string } } })?.response;
        const msg =
          res?.status === 403
            ? 'Нет прав на редактирование. Войдите как администратор или назначьте себя ответственным по метрике.'
            : res?.data?.error || res?.data?.details || (err as Error)?.message || 'Не удалось сохранить значение';
        console.error('Statistics: saveDailyEntry failed', err);
        showError(msg);
      } finally {
        setSavingCell(null);
      }
    },
    [fetchGrid, showError]
  );

  const handleAddAssignment = async () => {
    if (!addPostId || !addMetricCode) return;
    try {
      const weeklyGoalRaw = addDailyTarget === '' ? null : Number(addDailyTarget);
      const weeklyGoal = weeklyGoalRaw != null && !Number.isNaN(weeklyGoalRaw) ? weeklyGoalRaw : null;
      const dailyTargetNum = weeklyGoal != null && weeklyGoal > 0 ? weeklyGoal / 7 : null;
      await statisticsService.setMetricToPost({
        postId: addPostId,
        metricCode: addMetricCode,
        responsibleUserId: addResponsibleId || null,
        dailyTarget: dailyTargetNum,
      });
      setAddRowMode(false);
      setAddMetricCode('');
      setAddResponsibleId('');
      setAddDailyTarget('');
      setAddPostId('');
      fetchGrid();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: string } } })?.response?.data;
      const msg = data?.error || data?.details || (err as Error)?.message || 'Не удалось добавить назначение';
      console.error('Statistics: setMetricToPost failed', err);
      showError(msg);
    }
  };

  const formatValue = (value: number, unit: string) => {
    const formatted = Number.isInteger(value)
      ? value.toLocaleString('ru-RU')
      : value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return unit ? `${formatted} ${unit}` : String(formatted);
  };

  const rows = gridData?.rows ?? [];
  const dates = gridData?.dates ?? [];
  const colsCount = 7;

  const canEdit = (row: GridRow) => {
    if (isAdmin) return true;
    if (user?.role === 'Department Head' || user?.role === 'Section Head') return true;
    return row.responsibleUserId === user?.id || posts.some((p) => p.id === row.postId && p.currentHolder?.userId === user?.id);
  };

  const canAddAssignment = isAdmin || user?.role === 'Department Head';

  const canDeleteRow = (_row: GridRow) => isAdmin || user?.role === 'Department Head';

  const handleDeleteRow = useCallback(
    async (row: GridRow) => {
      const key = `${row.postId}-${row.metricCode}`;
      setDeletingRowKey(key);
      try {
        await statisticsService.deleteMetricToPost(row.postId, row.metricCode);
        fetchGrid();
      } catch (err) {
        console.error('Delete metric assignment failed', err);
        showError((err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || 'Не удалось удалить назначение');
      } finally {
        setDeletingRowKey(null);
      }
    },
    [fetchGrid, showError]
  );

  return (
    <div className="space-y-6">
      {toastError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primarySoft px-4 py-3 text-sm text-primary"
        >
          <span>{toastError}</span>
          <button
            type="button"
            onClick={() => setToastError(null)}
            className="shrink-0 rounded p-1 hover:bg-primary/10"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Статистика</h1>
        <p className="text-sm text-textSecondary mt-1">
          Единая матрица показателей: ввод данных, анализ и тренды
        </p>
      </div>

      {canViewAnalytics && (
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('visualizations')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'visualizations'
                ? 'bg-primary text-primaryForeground'
                : 'text-textSecondary hover:text-textPrimary hover:bg-background'
            }`}
          >
            Визуализация
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data-entry')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'data-entry'
                ? 'bg-primary text-primaryForeground'
                : 'text-textSecondary hover:text-textPrimary hover:bg-background'
            }`}
          >
            Ввод данных
          </button>
        </div>
      )}

      {canViewAnalytics && activeTab === 'visualizations' && (
        <>
          <AnalyticsDashboard />
        </>
      )}

      {(!canViewAnalytics || activeTab === 'data-entry') && (
        <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Фильтры</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-textSecondary whitespace-nowrap">Отдел</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="select-std min-w-[140px] w-auto h-9 py-0"
                >
                  <option value="">Все</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-textSecondary whitespace-nowrap">Ответственный</label>
                <select
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                  className="select-std min-w-[160px] w-auto h-9 py-0"
                >
                  <option value="">Все</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-textSecondary">Неделя</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      const d = new Date(weekStart + 'T12:00:00');
                      d.setDate(d.getDate() - 7);
                      setWeekStart(formatDateLocal(d));
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium text-textPrimary min-w-[120px] text-center">
                    {weekStart} — {dates[6] ?? ''}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      const d = new Date(weekStart + 'T12:00:00');
                      d.setDate(d.getDate() + 7);
                      setWeekStart(formatDateLocal(d));
                    }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {isAdmin && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={myDataOnly}
                    onChange={(e) => setMyDataOnly(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-textPrimary">Мои показатели</span>
                </label>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Матрица показателей</CardTitle>
          <p className="text-sm text-textSecondary mt-1">
            Учёт по дням: вводите фактические значения в ячейки (клик по ячейке → ввод числа). Сохранение при выходе из ячейки. Стрелки, Tab, Shift+Tab для навигации.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !rows.length && !addRowMode && !canAddAssignment ? (
            <p className="text-sm text-textSecondary py-8 rounded-lg bg-surface/50 border border-border px-4">
              Нет метрик. Обратитесь к администратору для добавления назначений.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface border-b border-border">
                    <th className="text-left p-2 sticky left-0 bg-surface border-r border-border z-20 min-w-[160px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Метрика
                    </th>
                    <th className="text-left p-2 sticky left-[160px] bg-surface border-r border-border z-20 min-w-[60px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Ед.
                    </th>
                    <th className="text-left p-2 sticky left-[220px] bg-surface border-r border-border z-20 min-w-[140px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Ответственный
                    </th>
                    <th className="text-left p-2 sticky left-[360px] bg-surface border-r border-border z-20 min-w-[90px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Цель/неделю
                    </th>
                    {dates.map((date, i) => (
                      <th key={date} className="text-center p-2 border-r border-border min-w-[72px] bg-surface">
                        {DAY_LABELS[i]} {date.slice(8)}
                      </th>
                    ))}
                    <th className="text-center p-2 border-r border-border min-w-[80px] bg-surface font-medium">
                      Итого
                    </th>
                    {(isAdmin || user?.role === 'Department Head') && (
                      <th className="text-center p-2 min-w-[56px] bg-surface" title="Удалить назначение метрики">
                        Действия
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => {
                    if (!gridInputRefs.current[rIdx]) gridInputRefs.current[rIdx] = [];
                    const weeklyGoal = row.plan > 0 ? row.plan : (row.dailyTarget != null ? row.dailyTarget * 7 : 0);
                    const editable = canEdit(row);

                    return (
                      <tr
                        key={`${row.postId}-${row.metricCode}-${rIdx}`}
                        className="border-b border-border hover:bg-surface/50"
                      >
                        <td className="p-2 sticky left-0 bg-inherit border-r border-border z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                          <div className="font-medium text-textPrimary">{row.metricName}</div>
                          <div className="text-xs text-textSecondary mt-0.5">{row.postTitle}</div>
                        </td>
                        <td className="p-2 sticky left-[160px] bg-inherit border-r border-border z-10 text-textSecondary">
                          {row.unit}
                        </td>
                        <td className="p-2 sticky left-[220px] bg-inherit border-r border-border z-10">
                          <div className="flex items-center gap-2">
                            {row.responsibleUserAvatar ? (
                              <img
                                src={row.responsibleUserAvatar}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                                {(row.responsibleUserName ?? '?')[0]}
                              </div>
                            )}
                            <span className="text-textPrimary truncate max-w-[100px]">
                              {row.responsibleUserName ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="p-2 sticky left-[360px] bg-inherit border-r border-border z-10 text-textPrimary">
                          {weeklyGoal > 0 ? formatValue(weeklyGoal, row.unit) : '—'}
                        </td>
                        {dates.map((date, dIdx) => {
                          const val = row.days[date] ?? 0;
                          const cellBg =
                            weeklyGoal <= 0
                              ? 'bg-transparent'
                              : row.weekTotal < weeklyGoal
                                ? 'bg-primary/5 text-primary border border-primary/15'
                                : 'bg-primarySoft text-primary border border-primary/20';

                          const cellKey = `${row.postId}-${row.metricCode}-${date}`;
                          const isSaving = savingCell === cellKey;

                          return (
                            <td
                              key={date}
                              className={`border-r border-border ${cellBg} ${editable ? 'cursor-text min-h-[2.5rem] p-0' : 'p-0'}`}
                              title={`${row.metricName} · ${date}: ${val} ${row.unit}${weeklyGoal > 0 ? ` (цель на неделю ${formatValue(weeklyGoal, row.unit)})` : ''} · ${editable ? 'кликните и введите значение' : 'только просмотр'}`}
                              data-metric={row.metricCode}
                              data-date={date}
                              data-value={val}
                              data-editable={editable ? 'true' : 'false'}
                              onClick={editable ? () => gridInputRefs.current[rIdx]?.[dIdx]?.focus() : undefined}
                            >
                              {editable ? (
                                <div className="relative p-0 min-h-[2.5rem] flex items-center justify-center">
                                  <input
                                    ref={(el) => {
                                      gridInputRefs.current[rIdx][dIdx] = el;
                                    }}
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={editingCell?.key === cellKey ? editingCell.value : val}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={() => setEditingCell((prev) => (prev?.key === cellKey ? prev : { key: cellKey, value: val }))}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const v = raw === '' ? 0 : Number(raw);
                                      const num = Number.isNaN(v) ? 0 : Math.max(0, v);
                                      setEditingCell({ key: cellKey, value: num });
                                    }}
                                    onBlur={(e) => {
                                      const v = Number(e.target.value);
                                      const num = Number.isNaN(v) || v < 0 ? 0 : v;
                                      handleCellBlur(row, date, num, () => setEditingCell((prev) => (prev?.key === cellKey ? null : prev)));
                                    }}
                                    onKeyDown={(e) => {
                                      const rowsCount = rows.length;
                                      if (e.key === 'ArrowRight' && dIdx < colsCount - 1) {
                                        e.preventDefault();
                                        gridInputRefs.current[rIdx]?.[dIdx + 1]?.focus();
                                      } else if (e.key === 'ArrowLeft' && dIdx > 0) {
                                        e.preventDefault();
                                        gridInputRefs.current[rIdx]?.[dIdx - 1]?.focus();
                                      } else if (e.key === 'ArrowDown' && rIdx < rowsCount - 1) {
                                        e.preventDefault();
                                        gridInputRefs.current[rIdx + 1]?.[dIdx]?.focus();
                                      } else if (e.key === 'ArrowUp' && rIdx > 0) {
                                        e.preventDefault();
                                        gridInputRefs.current[rIdx - 1]?.[dIdx]?.focus();
                                      } else if (e.key === 'Tab') {
                                        e.preventDefault();
                                        if (e.shiftKey) {
                                          if (dIdx > 0) {
                                            gridInputRefs.current[rIdx]?.[dIdx - 1]?.focus();
                                          } else if (rIdx > 0) {
                                            gridInputRefs.current[rIdx - 1]?.[colsCount - 1]?.focus();
                                          }
                                        } else {
                                          if (dIdx < colsCount - 1) {
                                            gridInputRefs.current[rIdx]?.[dIdx + 1]?.focus();
                                          } else if (rIdx < rowsCount - 1) {
                                            gridInputRefs.current[rIdx + 1]?.[0]?.focus();
                                          }
                                        }
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (rIdx < rowsCount - 1) {
                                          gridInputRefs.current[rIdx + 1]?.[dIdx]?.focus();
                                        }
                                      }
                                    }}
                                    className={`w-full min-w-[56px] px-2 py-1.5 rounded-none text-center text-inherit focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary ${editingCell?.key === cellKey ? 'bg-background/80 border border-primary/40' : 'bg-transparent border border-transparent'}`}
                                  />
                                  {isSaving && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-black/20">
                                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="px-2 py-1.5 text-center">
                                  {val ? formatValue(val, '') : '—'}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 border-r border-border text-center font-medium text-textPrimary">
                          {formatValue(row.weekTotal, row.unit)}
                        </td>
                        {(isAdmin || user?.role === 'Department Head') && (
                          <td className="p-1 text-center align-middle">
                            {canDeleteRow(row) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row)}
                                disabled={deletingRowKey === `${row.postId}-${row.metricCode}`}
                                className="rounded p-2 text-textSecondary hover:bg-primarySoft hover:text-primary disabled:opacity-50"
                                title="Удалить метрику из матрицы"
                              >
                                {deletingRowKey === `${row.postId}-${row.metricCode}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                )}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {addRowMode && (
                    <tr className="border-b border-border bg-primary/5">
                      <td colSpan={4} className="p-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={addPostId}
                            onChange={(e) => setAddPostId(e.target.value)}
                            className="select-std min-w-[140px] w-auto h-9 py-0"
                          >
                            <option value="">Должность</option>
                            {posts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                          </select>
                          <select
                            value={addMetricCode}
                            onChange={(e) => setAddMetricCode(e.target.value)}
                            className="select-std min-w-[160px] w-auto h-9 py-0"
                          >
                            <option value="">Метрика</option>
                            {metricsList.map((m) => (
                              <option key={m.code} value={m.code}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={addResponsibleId}
                            onChange={(e) => setAddResponsibleId(e.target.value)}
                            className="select-std min-w-[140px] w-auto h-9 py-0"
                          >
                            <option value="">Ответственный</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-textSecondary whitespace-nowrap">Цель/неделя</label>
                            <Input
                              type="number"
                              min={0}
                              value={addDailyTarget}
                              onChange={(e) => setAddDailyTarget(e.target.value)}
                              placeholder="0"
                              className="w-24 h-8 text-sm"
                            />
                          </div>
                          <Button size="sm" onClick={handleAddAssignment} disabled={!addPostId || !addMetricCode}>
                            Сохранить
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddRowMode(false);
                              setAddMetricCode('');
                              setAddResponsibleId('');
                              setAddDailyTarget('');
                              setAddPostId('');
                            }}
                          >
                            Отмена
                          </Button>
                        </div>
                      </td>
                      <td colSpan={dates.length + 1 + ((isAdmin || user?.role === 'Department Head') ? 1 : 0)} />
                    </tr>
                  )}

                  {canAddAssignment && (
                    <tr>
                      <td colSpan={dates.length + 5 + ((isAdmin || user?.role === 'Department Head') ? 1 : 0)} className="p-2">
                        <button
                          type="button"
                          onClick={() => setAddRowMode(true)}
                          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-textSecondary hover:text-primary"
                        >
                          <Plus className="w-5 h-5" />
                          Добавить метрику
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCreateMetricOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Создать определение метрики
          </Button>
          <Button variant="outline" onClick={() => setDeleteMetricOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить определение метрики
          </Button>
        </div>
      )}
        </>
      )}

      <CreateMetricDialog
        isOpen={createMetricOpen}
        onClose={() => setCreateMetricOpen(false)}
        onSuccess={refreshMetrics}
      />

      <DeleteMetricDialog
        isOpen={deleteMetricOpen}
        onClose={() => setDeleteMetricOpen(false)}
        onSuccess={refreshMetrics}
        metrics={metricDefinitions}
      />
    </div>
  );
}
