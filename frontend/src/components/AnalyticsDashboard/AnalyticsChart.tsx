import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AnalyticsDataPoint, ChartType } from './types';
import { cn } from '@/lib/utils';

function formatValue(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

interface TooltipPayloadItem {
  dataKey: string;
  value?: number;
}

interface AnalyticsTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

/** Delta = ((Result - Goal) / Goal) * 100. Красный при отрицательном значении. */
function AnalyticsTooltip({ active, payload, label }: AnalyticsTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const result = payload.find((p) => p.dataKey === 'value')?.value ?? 0;
  const goal = payload.find((p) => p.dataKey === 'goal')?.value ?? 0;
  const deltaPercent = goal > 0 ? ((result - goal) / goal) * 100 : 0;
  const isOver = deltaPercent >= 0;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
      <p className="text-sm font-medium text-textPrimary mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-textSecondary">Результат:</span>
          <span className="font-medium text-textPrimary">{Number(result).toLocaleString('ru-RU')}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-textSecondary">Цель:</span>
          <span className="font-medium text-textPrimary">{Number(goal).toLocaleString('ru-RU')}</span>
        </div>
        <div className="flex justify-between gap-4 pt-2 border-t border-border">
          <span className="text-textSecondary">Отклонение:</span>
          <span
            className={cn(
              'font-semibold',
              isOver ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {deltaPercent >= 0 ? '+' : ''}
            {deltaPercent.toFixed(1)}% от цели
          </span>
        </div>
      </div>
    </div>
  );
}

interface AnalyticsChartProps {
  data: AnalyticsDataPoint[];
  chartType: ChartType;
}

export function AnalyticsChart({ data, chartType }: AnalyticsChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    dateShort: d.date.slice(8),
    name: d.date,
  }));

  const commonProps = {
    data: chartData,
    margin: { top: 12, right: 12, left: 0, bottom: 0 } as const,
  };

  if (!data.length) return null;

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height={320} debounce={1}>
        {chartType === 'area' ? (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (value === 'value' ? 'Результат' : 'Цель')}
            />
            <Area
              type="monotone"
              dataKey="goal"
              stroke="hsl(214, 32%, 70%)"
              fill="hsl(214, 32%, 91% / 0.4)"
              strokeDasharray="4 4"
              strokeWidth={2}
              name="goal"
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.4)"
              strokeWidth={2}
              name="value"
            />
          </AreaChart>
        ) : (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="dateShort" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (value === 'value' ? 'Результат' : 'Цель')}
            />
            <Bar dataKey="goal" fill="hsl(214, 32%, 85%)" fillOpacity={0.6} radius={[4, 4, 0, 0]} name="goal" />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="value" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
