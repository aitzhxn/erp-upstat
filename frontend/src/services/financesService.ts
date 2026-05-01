import api from './api';

export interface Budget {
  id: string;
  departmentId: string;
  department?: string;
  responsiblePostId: string | null;
  category: string;
  period: string;
  planned: number;
  approved: number;
  spent: number;
  remaining: number;
  limits: number;
  approvalStatus: string;
}

export const financesService = {
  getBudgets: async (responsiblePostId?: string, period?: string): Promise<Budget[]> => {
    const params = new URLSearchParams();
    if (responsiblePostId) params.set('responsiblePostId', responsiblePostId);
    if (period) params.set('period', period);
    const q = params.toString();
    const response = await api.get<Budget[]>(`/finances${q ? `?${q}` : ''}`);
    return response.data;
  },

  create: async (data: {
    departmentId: string;
    responsiblePostId?: string | null;
    category: string;
    period: string;
    planned: number;
    limits?: number;
  }): Promise<Budget> => {
    const response = await api.post<Budget>('/finances', data);
    return response.data;
  },

  approve: async (id: string): Promise<Budget> => {
    const response = await api.post<Budget>(`/finances/${id}/approve`);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/finances/${id}`);
  },
};
