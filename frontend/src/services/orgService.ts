import api from './api';
import type { Employee, Department, PostWithHolder, User } from '@/types';

export const orgService = {
  /** Список пользователей для выбора при назначении на должность. */
  getUsers: async (): Promise<Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'postId'>[]> => {
    const response = await api.get('/org/users');
    return response.data;
  },

  /** Список пользователей с ролями (только для Admin — страница управления). */
  getUsersWithRoles: async (): Promise<Array<{ id: string; name: string; email: string; avatarUrl?: string; postId: string | null; postTitle: string | null; role: string | null; adminAssignedAt: string | null }>> => {
    const response = await api.get('/org/users/with-roles');
    return response.data;
  },
  makeAdmin: async (userId: string): Promise<void> => {
    await api.post(`/org/users/${encodeURIComponent(userId)}/make-admin`);
  },
  removeAdmin: async (userId: string): Promise<void> => {
    await api.post(`/org/users/${encodeURIComponent(userId)}/remove-admin`);
  },

  getEmployees: async (): Promise<Employee[]> => {
    const response = await api.get('/org/employees');
    return response.data;
  },

  getEmployee: async (id: string): Promise<Employee> => {
    const response = await api.get(`/org/employees/${id}`);
    return response.data;
  },

  getDepartments: async (): Promise<Department[]> => {
    const response = await api.get('/org/departments');
    return response.data;
  },

  /** Дерево постов (Post). currentHolder === null = вакансия. */
  getPosts: async (): Promise<PostWithHolder[]> => {
    const response = await api.get('/org/posts');
    return response.data;
  },

  /** Все должности для выбора получателя при отправке сообщения (без ограничений по роли). */
  getPostsForRecipients: async (): Promise<PostWithHolder[]> => {
    const response = await api.get<PostWithHolder[]>('/org/posts/for-recipients');
    return response.data;
  },

  /** Посты текущего пользователя («мои коробки» для Communication). */
  getMyPosts: async (): Promise<PostWithHolder[]> => {
    const response = await api.get<PostWithHolder[]>('/org/my-posts');
    return response.data;
  },

  getPost: async (id: string): Promise<PostWithHolder> => {
    const response = await api.get(`/org/posts/${id}`);
    return response.data;
  },

  /** Предки поста (вышестоящие должности) для выбора «кому отправить» план на согласование. */
  getPostAncestors: async (postId: string): Promise<Array<{ id: string; title: string; label: string }>> => {
    const response = await api.get<Array<{ id: string; title: string; label: string }>>(`/org/posts/${encodeURIComponent(postId)}/ancestors`);
    return response.data;
  },

  createPost: async (data: {
    title: string;
    parentPostId?: string | null;
    departmentId?: string;
    role?: PostWithHolder['role'];
    level?: number;
    orderIndex?: number;
    code?: string;
  }): Promise<PostWithHolder> => {
    const response = await api.post<PostWithHolder>('/org/posts', data);
    return response.data;
  },

  updatePost: async (
    id: string,
    data: Partial<Pick<PostWithHolder, 'title' | 'description' | 'departmentId' | 'role' | 'parentPostId' | 'level' | 'orderIndex' | 'code' | 'cardColor' | 'cardNotes'>>
  ): Promise<PostWithHolder> => {
    const response = await api.put<PostWithHolder>(`/org/posts/${id}`, data);
    return response.data;
  },

  deletePost: async (id: string, cascade = false): Promise<void> => {
    await api.delete(`/org/posts/${id}${cascade ? '?cascade=true' : ''}`);
  },

  getHierarchy: async () => {
    const response = await api.get('/org/hierarchy');
    return response.data;
  },

  /** Назначить сотрудника на пост (снимает с предыдущей должности). */
  assignToPost: async (postId: string, data: { userId?: string; name?: string; email?: string; startedAt?: string; reason?: string }) => {
    const response = await api.post(`/org/posts/${postId}/assign`, data);
    return response.data;
  },

  /** Назначить пользователя на должность (то же, что assign). */
  assignUserToPost: async (postId: string, userId: string): Promise<PostWithHolder> => {
    const response = await api.post(`/org/posts/${postId}/assign-user`, { userId });
    return response.data;
  },

  /** Снять сотрудника с должности (сделать вакансией). */
  vacatePost: async (postId: string): Promise<PostWithHolder> => {
    const response = await api.post(`/org/posts/${postId}/vacate`);
    return response.data;
  },

  /** Удалить пользователя (только Admin). */
  deleteUser: async (userId: string): Promise<void> => {
    await api.delete(`/org/users/${userId}`);
  },

  /** Создать отдел (только Admin). */
  createDepartment: async (data: { name: string; parentId?: string | null; managerPostId?: string | null }): Promise<Department> => {
    const response = await api.post<Department>('/org/departments', data);
    return response.data;
  },

  /** Обновить отдел (только Admin). */
  updateDepartment: async (id: string, data: { name?: string; parentId?: string | null; managerPostId?: string | null }): Promise<Department> => {
    const response = await api.put<Department>(`/org/departments/${id}`, data);
    return response.data;
  },

  /** Удалить отдел (только Admin). */
  deleteDepartment: async (id: string): Promise<void> => {
    await api.delete(`/org/departments/${id}`);
  },

  /** Legacy: positions = posts */
  getPositions: async (): Promise<PostWithHolder[]> => {
    return orgService.getPosts();
  },

  getPosition: async (id: string): Promise<PostWithHolder> => {
    return orgService.getPost(id);
  },

  assignToPosition: async (positionId: string, data: { employeeId: string; startedAt: string; reason?: string }) => {
    return orgService.assignToPost(positionId, { ...data, userId: data.employeeId, startedAt: data.startedAt, reason: data.reason });
  },
};
