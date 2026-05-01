import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setUser, setToken, setOrganizations, setAuthCheckComplete } from '@/store/slices/authSlice';
import { loadAuth, getMe, saveAuth } from '@/services/authService';

export default function AuthInit({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const saved = loadAuth();
    if (!saved) {
      dispatch(setAuthCheckComplete(true));
      return;
    }
    dispatch(setUser(saved.user));
    dispatch(setToken(saved.token));
    dispatch(setOrganizations(saved.organizations));

    getMe()
      .then((result) => {
        if (result?.user) {
          dispatch(setUser(result.user));
          saveAuth(saved.token, result.user, saved.organizations);
        }
        dispatch(setAuthCheckComplete(true));
      })
      .catch(() => {
        // 401 is handled by api interceptor (clearAuth + redirect to login)
        dispatch(setAuthCheckComplete(true));
      });
  }, [dispatch]);

  return <>{children}</>;
}
