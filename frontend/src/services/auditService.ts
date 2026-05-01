import api from './api';

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  userName: string | null;
  changes: string | null;
  createdAt: string;
}

export const auditService = {
  getByPostId: async (postId: string): Promise<AuditLogEntry[]> => {
    const response = await api.get<AuditLogEntry[]>(`/audit?postId=${encodeURIComponent(postId)}`);
    return response.data;
  },
  getRecent: async (limit = 10): Promise<AuditLogEntry[]> => {
    const response = await api.get<AuditLogEntry[]>(`/audit/recent?limit=${limit}`);
    return response.data;
  },
};
