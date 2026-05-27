import api, { resetUnauthorizedFlag } from './api';
import type { User } from '@/types';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';
const AUTH_ORGS_KEY = 'auth_organizations';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  name: string;
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
    const responseData = (err as { response?: { data?: any } })?.response?.data;
    if (responseData && responseData.isVerified === false) {
      const customError = new Error(responseData.error || 'Email not verified') as any;
      customError.isVerified = false;
      customError.email = responseData.email;
      throw customError;
    }
    const msg = responseData?.error
      ?? (err as Error)?.message
      ?? 'Ошибка входа';
    throw new Error(msg);
  }
}

export async function signup(data: SignupData): Promise<{ message: string; email: string }> {
  const { name, email, password } = data;
  if (!name.trim() || !email.trim() || !password) {
    throw new Error('Заполните имя, email и пароль');
  }
  if (password.length < 6) {
    throw new Error('Пароль не менее 6 символов');
  }
  try {
    const { data: res } = await api.post<{ message: string; email: string }>('/auth/signup', {
      name: name.trim(),
      email: email.trim(),
      password,
    });
    if (!res.email) {
      throw new Error('Invalid response from server');
    }
    return { message: res.message, email: res.email };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
      ?? (err as Error)?.message
      ?? 'Ошибка регистрации';
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

/** Verify OTP code for the user. */
export async function verifyEmail(email: string, code: string): Promise<{ user: User; token: string }> {
  try {
    const { data } = await api.post<{ token: string; user: User }>('/auth/verify-email', { email, code });
    if (!data.token || !data.user) {
      throw new Error('Invalid response from server');
    }
    resetUnauthorizedFlag();
    return { user: data.user, token: data.token };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
      ?? (err as Error)?.message
      ?? 'Ошибка верификации';
    throw new Error(msg);
  }
}

/** Resend OTP code for the user. */
export async function resendVerification(email: string): Promise<{ message: string }> {
  try {
    const { data } = await api.post<{ message: string }>('/auth/resend-verification', { email });
    return { message: data.message };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
      ?? (err as Error)?.message
      ?? 'Ошибка повторной отправки';
    throw new Error(msg);
  }
}
