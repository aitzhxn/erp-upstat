/** Одна точка данных для графика аналитики */
export interface AnalyticsDataPoint {
  date: string;
  value: number;
  goal: number;
}

/** Опция фильтра */
export interface FilterOption {
  id: string;
  label: string;
}

/** Период для группировки */
export type PeriodType = 'week' | 'month' | 'quarter' | 'year';

/** Тип графика */
export type ChartType = 'area' | 'bar';
