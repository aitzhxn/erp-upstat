import api from './api';

export interface MailboxAttachment {
  id: string;
  filename: string;
  mimeType: string | null;
  fileSize: number | null;
}

export type MailboxFolder = 'inbox' | 'archive' | 'sent';

export interface MailboxMessage {
  id: string;
  recipientPostId: string;
  senderPostId?: string | null;
  senderEmail: string;
  subject: string;
  bodySnippet: string | null;
  /** Full body when loaded via getMessage (for view modal). */
  body?: string | null;
  messageDate: string;
  unread: number;
  folder?: string;
  attachments?: MailboxAttachment[];
  workPlanId?: string | null;
}

export const communicationService = {
  getUnreadCount: async (): Promise<number> => {
    const response = await api.get<{ count: number }>('/communication/unread-count');
    return response.data.count;
  },
  getMessages: async (postId?: string, folder: MailboxFolder = 'inbox'): Promise<MailboxMessage[]> => {
    const params = new URLSearchParams();
    if (postId) params.set('postId', postId);
    params.set('folder', folder);
    const response = await api.get<MailboxMessage[]>(`/communication?${params}`);
    return response.data;
  },
  getMessage: async (id: string): Promise<MailboxMessage> => {
    const response = await api.get<MailboxMessage>(`/communication/messages/${encodeURIComponent(id)}`);
    return response.data;
  },
  archiveMessages: async (ids: string[]): Promise<void> => {
    await api.post('/communication/messages/archive', { ids });
  },
  deleteMessages: async (ids: string[]): Promise<void> => {
    await api.post('/communication/messages/delete', { ids });
  },
  clearMailbox: async (postId: string, folder: MailboxFolder): Promise<{ deleted: number }> => {
    const response = await api.post<{ deleted: number }>('/communication/clear', { postId, folder });
    return response.data;
  },
  markAsRead: async (id: string): Promise<void> => {
    await api.patch(`/communication/messages/${encodeURIComponent(id)}/read`);
  },
  sendMessage: async (data: {
    recipientPostId: string;
    senderPostId?: string;
    subject: string;
    body: string;
    files?: File[];
  }): Promise<MailboxMessage> => {
    const form = new FormData();
    form.append('recipientPostId', data.recipientPostId);
    if (data.senderPostId) form.append('senderPostId', data.senderPostId);
    form.append('subject', data.subject);
    form.append('body', data.body);
    if (data.files?.length) {
      data.files.forEach((f) => form.append('files', f));
    }
    const response = await api.post<MailboxMessage>('/communication/send', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  downloadAttachment: async (attachmentId: string, filename: string): Promise<void> => {
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${base}/communication/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Ошибка скачивания');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'file';
    a.click();
    URL.revokeObjectURL(url);
  },
};
