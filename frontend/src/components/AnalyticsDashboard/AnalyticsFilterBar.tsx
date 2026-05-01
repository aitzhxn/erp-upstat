import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PeriodType, FilterOption } from './types';
import { Filter } from 'lucide-react';

const SELECT_STYLE =
  'px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary min-w-[140px] focus:outline-none focus:ring-2 focus:ring-primary/20';

interface AnalyticsFilterBarProps {
  departments: FilterOption[];
  employees: FilterOption[];
  metrics: FilterOption[];
  departmentId: string;
  employeeId: string;
  metricId: string;
  period: PeriodType;
  startDate: string;
  endDate: string;
  onDepartmentChange: (id: string) => void;
  onEmployeeChange: (id: string) => void;
  onMetricChange: (id: string) => void;
  onPeriodChange: (p: PeriodType) => void;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
}

export function AnalyticsFilterBar({
  departments,
  employees,
  metrics,
  departmentId,
  employeeId,
  metricId,
  period,
  startDate,
  endDate,
  onDepartmentChange,
  onEmployeeChange,
  onMetricChange,
  onPeriodChange,
  onStartDateChange,
  onEndDateChange,
}: AnalyticsFilterBarProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-textSecondary">
        <Filter className="w-4 h-4 shrink-0" />
        <span className="font-medium">Фильтры</span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textSecondary">Департамент</label>
          <select
            value={departmentId}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className={SELECT_STYLE}
          >
            <option value="">Все</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textSecondary">Сотрудник</label>
          <select
            value={employeeId}
            onChange={(e) => onEmployeeChange(e.target.value)}
            className={SELECT_STYLE}
          >
            <option value="">Все</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textSecondary">Метрика</label>
          <select
            value={metricId}
            onChange={(e) => onMetricChange(e.target.value)}
            className={SELECT_STYLE}
          >
            <option value="">Все</option>
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-textSecondary">Период</span>
          <div className="flex rounded-lg border border-border p-1 bg-background">
            {(['week', 'month', 'quarter', 'year'] as const).map((p) => (
              <Button
                key={p}
                type="button"
                variant={period === p ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => onPeriodChange(p)}
                className="rounded-md"
              >
                {p === 'week' && 'Неделя'}
                {p === 'month' && 'Месяц'}
                {p === 'quarter' && 'Квартал'}
                {p === 'year' && 'Год'}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-textSecondary">Начало</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <span className="text-textSecondary pb-2">—</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-textSecondary">Конец</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-[140px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
