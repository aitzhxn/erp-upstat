import api from './api';

export type WorkPlanWorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';

export interface WorkPlanTaskItem {
  id: string;
  workPlanId: string;
  title: string;
  dueDate: string | null;
  orderIndex: number;
}

export interface WorkPlanItem {
  id: string;
  title: string;
  postId: string;
  department: string | null;
  status: string;
  dueDate: string | null;
  workflowStatus: WorkPlanWorkflowStatus;
  authorUserId: string | null;
  approverPostId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionComment: string | null;
  approvalComment: string | null;
  period: string | null;
  messageText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPlanWithTasks extends WorkPlanItem {
  tasks: WorkPlanTaskItem[];
}

export interface CreateWorkPlanData {
  title: string;
  postId: string;
  department?: string | null;
  status?: string;
  dueDate?: string | null;
  period?: string | null;
  messageText?: string | null;
}

export const workPlansService = {
  getList: async (params?: { postId?: string; workflowStatus?: WorkPlanWorkflowStatus; forMyApproval?: boolean }): Promise<WorkPlanItem[]> => {
    const search = new URLSearchParams();
    if (params?.postId) search.set('postId', params.postId);
    if (params?.workflowStatus) search.set('workflowStatus', params.workflowStatus);
    if (params?.forMyApproval) search.set('forMyApproval', '1');
    const q = search.toString();
    const response = await api.get<WorkPlanItem[]>(`/work-plans${q ? `?${q}` : ''}`);
    return response.data;
  },

  getById: async (id: string): Promise<WorkPlanWithTasks> => {
    const response = await api.get<WorkPlanWithTasks>(`/work-plans/${encodeURIComponent(id)}`);
    return response.data;
  },

  create: async (data: CreateWorkPlanData): Promise<WorkPlanItem> => {
    const response = await api.post<WorkPlanItem>('/work-plans', {
      title: data.title,
      postId: data.postId,
      department: data.department ?? null,
      status: data.status ?? 'on-track',
      dueDate: data.dueDate ?? null,
      period: data.period ?? null,
      messageText: data.messageText ?? null,
    });
    return response.data;
  },

  update: async (id: string, data: Partial<CreateWorkPlanData>): Promise<WorkPlanItem> => {
    const response = await api.put<WorkPlanItem>(`/work-plans/${encodeURIComponent(id)}`, data);
    return response.data;
  },

  submit: async (id: string, approverPostId?: string): Promise<WorkPlanItem> => {
    const response = await api.post<WorkPlanItem>(`/work-plans/${encodeURIComponent(id)}/submit`, { approverPostId: approverPostId || undefined });
    return response.data;
  },

  approve: async (id: string, comment?: string): Promise<WorkPlanItem> => {
    const response = await api.post<WorkPlanItem>(`/work-plans/${encodeURIComponent(id)}/approve`, { comment });
    return response.data;
  },

  reject: async (id: string, comment?: string): Promise<WorkPlanItem> => {
    const response = await api.post<WorkPlanItem>(`/work-plans/${encodeURIComponent(id)}/reject`, { comment });
    return response.data;
  },

  requestRevision: async (id: string, comment?: string): Promise<WorkPlanItem> => {
    const response = await api.post<WorkPlanItem>(`/work-plans/${encodeURIComponent(id)}/request-revision`, { comment });
    return response.data;
  },

  getTasks: async (workPlanId: string): Promise<WorkPlanTaskItem[]> => {
    const response = await api.get<WorkPlanTaskItem[]>(`/work-plans/${encodeURIComponent(workPlanId)}/tasks`);
    return response.data;
  },

  createTask: async (workPlanId: string, data: { title: string; dueDate?: string | null; orderIndex?: number }): Promise<WorkPlanTaskItem> => {
    const response = await api.post<WorkPlanTaskItem>(`/work-plans/${encodeURIComponent(workPlanId)}/tasks`, data);
    return response.data;
  },

  updateTask: async (workPlanId: string, taskId: string, data: Partial<{ title: string; dueDate: string | null; orderIndex: number }>): Promise<void> => {
    await api.put(`/work-plans/${encodeURIComponent(workPlanId)}/tasks/${encodeURIComponent(taskId)}`, data);
  },

  deleteTask: async (workPlanId: string, taskId: string): Promise<void> => {
    await api.delete(`/work-plans/${encodeURIComponent(workPlanId)}/tasks/${encodeURIComponent(taskId)}`);
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/work-plans/${encodeURIComponent(id)}`);
  },

  getNotificationCount: async (): Promise<number> => {
    const response = await api.get<{ count: number }>('/work-plans/notifications/count');
    return response.data.count;
  },

  getNotifications: async (limit?: number): Promise<Array<{
    id: string;
    workPlanId: string;
    workPlanTitle: string;
    action: string;
    createdAt: string;
    read: boolean;
    actorName?: string | null;
  }>> => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    const response = await api.get(`/work-plans/notifications${params.toString() ? `?${params}` : ''}`);
    return response.data;
  },

  markNotificationAsRead: async (id: string): Promise<void> => {
    await api.patch(`/work-plans/notifications/${encodeURIComponent(id)}/read`);
  },

  markAllNotificationsAsRead: async (): Promise<void> => {
    await api.post('/work-plans/notifications/read-all');
  },
};
