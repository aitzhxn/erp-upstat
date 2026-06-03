import api, { resetUnauthorizedFlag } from './api';
import type { User } from '@/types';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';
const AUTH_ORGS_KEY = 'auth_organizations';

export interface LoginCredentials {
  email: string;
  password: string;
}

export async function login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
  const { email, password } = credentials;
  if (!email.trim() || !password) {
    throw new Error('Введите email и пароль');
  }
  try {
    const { data } = await api.post<{ token: string; user: User }>('/auth/login', { email: email.trim(), password });
    if (!data.token || !data.user) {
      throw new Error('Invalid response from server');
    }
    resetUnauthorizedFlag();
    return { user: data.user, token: data.token };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
      ?? (err as Error)?.message
      ?? 'Ошибка входа';
    throw new Error(msg);
  }
}

export function saveAuth(token: string, user: User, organizations: { id: string; name: string }[]): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_ORGS_KEY, JSON.stringify(organizations));
}

export function loadAuth(): { token: string; user: User; organizations: { id: string; name: string }[] } | null {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userJson = localStorage.getItem(AUTH_USER_KEY);
  const orgsJson = localStorage.getItem(AUTH_ORGS_KEY);
  if (!token || !userJson) return null;
  try {
    const user = JSON.parse(userJson) as User;
    const organizations = orgsJson ? (JSON.parse(orgsJson) as { id: string; name: string }[]) : [];
    return { token, user, organizations };
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_ORGS_KEY);
}

/** Validate token and get current user (for session restore). */
export async function getMe(): Promise<{ user: User } | null> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data?.user ? { user: data.user } : null;
}
