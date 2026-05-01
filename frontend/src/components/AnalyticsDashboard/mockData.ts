import type { AnalyticsDataPoint } from './types';

/** Mock-данные: дата, результат, цель. Имитация показателей выручки по дням. */
export const MOCK_ANALYTICS_DATA: AnalyticsDataPoint[] = [
  { date: '2025-02-03', value: 42000, goal: 50000 },
  { date: '2025-02-04', value: 51000, goal: 50000 },
  { date: '2025-02-05', value: 48000, goal: 50000 },
  { date: '2025-02-06', value: 55000, goal: 50000 },
  { date: '2025-02-07', value: 47000, goal: 50000 },
  { date: '2025-02-08', value: 39000, goal: 45000 },
  { date: '2025-02-09', value: 28000, goal: 30000 },
  { date: '2025-02-10', value: 53000, goal: 52000 },
  { date: '2025-02-11', value: 49000, goal: 52000 },
  { date: '2025-02-12', value: 58000, goal: 52000 },
  { date: '2025-02-13', value: 54000, goal: 52000 },
  { date: '2025-02-14', value: 51000, goal: 52000 },
  { date: '2025-02-15', value: 45000, goal: 48000 },
  { date: '2025-02-16', value: 32000, goal: 35000 },
  { date: '2025-02-17', value: 61000, goal: 55000 },
  { date: '2025-02-18', value: 57000, goal: 55000 },
];
