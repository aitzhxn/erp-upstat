import axios from 'axios';
import { store } from '@/store/store';
import { logout } from '@/store/slices/authSlice';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

let onUnauthorized: (() => void) | null = null;
/** Prevents multiple 401 handlers from firing (e.g. getMe + Dashboard requests). */
let unauthorizedHandled = false;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/** Call after successful login/signup so a future 401 can trigger logout again. */
export function resetUnauthorizedFlag(): void {
  unauthorizedHandled = false;
}

function isAuthEndpoint(config: { url?: string; baseURL?: string }): boolean {
  const url = config.url ?? '';
  const base = config.baseURL ?? '';
  const path = url.startsWith('http') ? url : `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  return path.includes('/auth/login') || path.includes('/auth/signup');
}

// Add token to requests (key must match authService AUTH_TOKEN_KEY). Skip for login/signup.
api.interceptors.request.use((config) => {
  if (isAuthEndpoint(config)) return config;
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // If the backend signals that the user's role changed, force re-authentication
    // so the next JWT reflects the updated role from the new post assignment.
    if (response.headers['x-token-refresh-required']) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_organizations');
      store.dispatch(logout());
    }
    return response;
  },
  (error) => {
    // Do not clear session / redirect on 401 from login or signup — that means "invalid credentials", show error in form
    const isAuth = error.config ? isAuthEndpoint(error.config) : false;
    if (error.response?.status === 401 && onUnauthorized && !isAuth) {
      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        onUnauthorized();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
