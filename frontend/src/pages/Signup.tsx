import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser, setToken, setOrganizations } from '@/store/slices/authSlice';
import { signup, saveAuth } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const defaultOrgs = [{ id: '1', name: 'Main Organization' }];

export default function Signup() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    (async () => {
      try {
        const { user, token } = await signup({ name, email, password });
        dispatch(setUser(user));
        dispatch(setToken(token));
        dispatch(setOrganizations(defaultOrgs));
        saveAuth(token, user, defaultOrgs);
        navigate('/dashboard', { replace: true });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Ошибка регистрации');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold text-textPrimary">Регистрация</h1>
          <p className="text-sm text-textSecondary">Создайте аккаунт</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-primary/20 bg-primarySoft px-3 py-2 text-sm text-primary">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Имя</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Пароль</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-textSecondary">Не менее 6 символов</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-textSecondary text-center">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Войти
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
