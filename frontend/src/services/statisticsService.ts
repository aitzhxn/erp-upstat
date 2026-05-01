import api from './api';

export interface PostStatisticsResponse {
  postId: string;
  period: string;
  metrics: Record<string, number>;
  raw?: Array<{ id: string; postId: string; period: string; metricCode: string; value: number }>;
}

export interface StatisticsRecord {
  id: string;
  postId: string;
  postTitle: string;
  holderName: string | null;
  period: string;
  metricCode: string;
  value: number;
  createdAt: string;
}

export interface SeriesPoint {
  period: string;
  value: number;
}

export interface SeriesResponse {
  postId: string;
  metricCode: string;
  series: SeriesPoint[];
}

export type MetricDefinition = { code: string; name: string; unit: string };

/** One row for constructor grid: post + metric with quota, value, needMore for a period. */
export interface ConstructorRow {
  postId: string;
  postTitle: string;
  holderName: string | null;
  metricCode: string;
  metricName: string;
  unit: string;
  quota: number;
  value: number;
  needMore: number;
}

/** Fallback when API metrics not loaded (e.g. getMetricName). */
export const METRIC_DEFINITIONS_FALLBACK: MetricDefinition[] = [
  { code: 'completedTasks', name: 'Выполненные задачи', unit: 'шт' },
  { code: 'overdue', name: 'Просрочено', unit: 'шт' },
  { code: 'revenue', name: 'Валовой доход', unit: 'руб' },
  { code: 'calls', name: 'Исходящие звонки', unit: 'шт' },
  { code: 'presentations', name: 'Отправленные презентации', unit: 'шт' },
  { code: 'proposals', name: 'Отправленные КП', unit: 'шт' },
  { code: 'contracts', name: 'Заключённые договоры', unit: 'шт' },
];

export const statisticsService = {
  getMetricDefinitions: async (): Promise<MetricDefinition[]> => {
    const response = await api.get<MetricDefinition[]>('/statistics/metrics');
    return response.data;
  },
  createMetric: async (data: { code: string; name: string; unit: string }): Promise<MetricDefinition> => {
    const response = await api.post<MetricDefinition>('/statistics/metrics', data);
    return response.data;
  },
  deleteMetric: async (code: string): Promise<void> => {
    await api.delete(`/statistics/metrics?code=${encodeURIComponent(code)}`);
  },
  getByPostId: async (postId: string): Promise<PostStatisticsResponse> => {
    const response = await api.get<PostStatisticsResponse>(`/statistics/post/${postId}`);
    return response.data;
  },
  getSummary: async () => {
    const response = await api.get('/statistics');
    return response.data;
  },
  getRecords: async (params?: { postId?: string; period?: string; metricCode?: string }): Promise<StatisticsRecord[]> => {
    const search = new URLSearchParams();
    if (params?.postId) search.set('postId', params.postId);
    if (params?.period) search.set('period', params.period);
    if (params?.metricCode) search.set('metricCode', params.metricCode);
    const q = search.toString();
    const response = await api.get<StatisticsRecord[]>(`/statistics/records${q ? `?${q}` : ''}`);
    return response.data;
  },
  getSeries: async (postId: string, metricCode: string, from?: string, to?: string): Promise<SeriesResponse> => {
    const search = new URLSearchParams({ postId, metricCode });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    const response = await api.get<SeriesResponse>(`/statistics/series?${search.toString()}`);
    return response.data;
  },
  createRecord: async (data: { postId: string; period: string; metricCode: string; value: number }): Promise<{ id: string; postId: string; period: string; metricCode: string; value: number }> => {
    const response = await api.post<{ id: string; postId: string; period: string; metricCode: string; value: number }>('/statistics', data);
    return response.data;
  },
  getConstructorView: async (period: string): Promise<ConstructorRow[]> => {
    const response = await api.get<ConstructorRow[]>(`/statistics/constructor?period=${encodeURIComponent(period)}`);
    return response.data;
  },
  getQuotas: async (params?: { postId?: string; metricCode?: string; period?: string }): Promise<Array<{ id: string; postId: string; metricCode: string; period: string; targetValue: number }>> => {
    const search = new URLSearchParams();
    if (params?.postId) search.set('postId', params.postId);
    if (params?.metricCode) search.set('metricCode', params.metricCode);
    if (params?.period) search.set('period', params.period);
    const q = search.toString();
    const response = await api.get(`/statistics/quotas${q ? `?${q}` : ''}`);
    return response.data;
  },
  setQuota: async (data: { postId: string; metricCode: string; period: string; targetValue: number }): Promise<{ postId: string; metricCode: string; period: string; targetValue: number }> => {
    const response = await api.put<{ postId: string; metricCode: string; period: string; targetValue: number }>('/statistics/quotas', data);
    return response.data;
  },
  getMetricToPostList: async (params?: { postId?: string; metricCode?: string }) => {
    const q = new URLSearchParams();
    if (params?.postId) q.set('postId', params.postId);
    if (params?.metricCode) q.set('metricCode', params.metricCode);
    const url = `/statistics/metric-to-post${q.toString() ? `?${q}` : ''}`;
    const response = await api.get<Array<{ postId: string; metricCode: string; responsibleUserId: string | null; dailyTarget: number | null }>>(url);
    return response.data;
  },
  setMetricToPost: async (data: { postId: string; metricCode: string; responsibleUserId?: string | null; dailyTarget?: number | null }) => {
    const response = await api.post('/statistics/metric-to-post', data);
    return response.data;
  },
  deleteMetricToPost: async (postId: string, metricCode: string) => {
    await api.delete(`/statistics/metric-to-post?postId=${encodeURIComponent(postId)}&metricCode=${encodeURIComponent(metricCode)}`);
  },
  getGrid: async (params: { weekStart?: string; periodType?: 'week' | 'month' | 'quarter' | 'year'; period?: string; departmentId?: string; responsibleUserId?: string; myData?: boolean; _cacheBust?: boolean }) => {
    const q = new URLSearchParams();
    if (params.weekStart) q.set('weekStart', params.weekStart);
    if (params.periodType) q.set('periodType', params.periodType);
    if (params.period) q.set('period', params.period);
    if (params.departmentId) q.set('departmentId', params.departmentId);
    if (params.responsibleUserId) q.set('responsibleUserId', params.responsibleUserId);
    if (params.myData !== undefined) q.set('myData', String(params.myData));
    if (params._cacheBust) q.set('_t', String(Date.now()));
    const response = await api.get<{
      weekStart: string;
      dates: string[];
      rows: Array<{
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
      }>;
    }>(`/statistics/grid?${q.toString()}`);
    return response.data;
  },
  getSeries30d: async (postId: string, metricCode: string, weekStart?: string) => {
    const q = new URLSearchParams({ postId, metricCode });
    if (weekStart) q.set('weekStart', weekStart);
    const response = await api.get<{
      postId: string;
      metricCode: string;
      series: Array<{ date: string; value: number }>;
      weekOverWeekGrowthPercent: number | null;
    }>(`/statistics/series-30d?${q.toString()}`);
    return response.data;
  },
  getDailyTracking: async (weekStart: string) => {
    const response = await api.get<{
      weekStart: string;
      dates: string[];
      rows: Array<{
        postId: string;
        postTitle: string;
        metricCode: string;
        metricName: string;
        unit: string;
        dailyTarget: number | null;
        days: Record<string, number>;
        plan: number;
        actual: number;
      }>;
    }>(`/statistics/daily-tracking?weekStart=${encodeURIComponent(weekStart)}`);
    return response.data;
  },
  saveDailyEntry: async (data: { postId: string; metricCode: string; date: string; value: number }) => {
    const response = await api.post('/statistics/daily-entry', data);
    return response.data;
  },
  getPlanVsFact: async (metricCode: string = 'revenue', postId?: string) => {
    const q = new URLSearchParams({ metricCode });
    if (postId) q.set('postId', postId);
    const response = await api.get<Array<{ date: string; plan: number | null; fact: number }>>(`/statistics/plan-vs-fact?${q}`);
    return response.data;
  },
};
