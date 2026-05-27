import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signup } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const res = await signup({ name, email, password });
        navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true });
      } catch (err) {
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
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Пароль</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-textPrimary mb-2">Подтвердите пароль</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
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
