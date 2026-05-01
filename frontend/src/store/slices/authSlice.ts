import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/types';

interface Organization {
  id: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  organizations: Organization[];
  currentOrganizationId: string | null;
  isAuthenticated: boolean;
  /** False until token is verified (getMe) or we know there is no token. Prevents flash of protected UI. */
  authCheckComplete: boolean;
}

function getInitialAuthState(): AuthState {
  if (typeof window === 'undefined') {
    return { user: null, token: null, organizations: [], currentOrganizationId: null, isAuthenticated: false, authCheckComplete: false };
  }
  try {
    const token = localStorage.getItem('auth_token');
    const userJson = localStorage.getItem('auth_user');
    const orgsJson = localStorage.getItem('auth_organizations');
    if (token && userJson) {
      const user = JSON.parse(userJson) as User;
      const organizations = orgsJson ? (JSON.parse(orgsJson) as Organization[]) : [];
      return { user, token, organizations, currentOrganizationId: null, isAuthenticated: true, authCheckComplete: false };
    }
  } catch {
    /* ignore */
  }
  return { user: null, token: null, organizations: [], currentOrganizationId: null, isAuthenticated: false, authCheckComplete: false };
}

const initialState: AuthState = getInitialAuthState();

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
    setOrganizations: (state, action: PayloadAction<Organization[]>) => {
      state.organizations = action.payload;
    },
    setCurrentOrganization: (state, action: PayloadAction<string>) => {
      state.currentOrganizationId = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.currentOrganizationId = null;
    },
    setAuthCheckComplete: (state, action: PayloadAction<boolean>) => {
      state.authCheckComplete = action.payload;
    },
  },
});

export const { setUser, setToken, setOrganizations, setCurrentOrganization, logout, setAuthCheckComplete } = authSlice.actions;
export default authSlice.reducer;
