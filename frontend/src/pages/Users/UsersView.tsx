import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Shield, ShieldOff, User, Trash2 } from 'lucide-react';
import { orgService } from '@/services/orgService';
import type { RootState } from '@/store/store';
import ProtectedAction from '@/components/rbac/ProtectedAction';

type UserWithRole = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  postId: string | null;
  postTitle: string | null;
  role: string | null;
  adminAssignedAt: string | null;
};

export default function UsersView() {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);
  const isAdmin = currentUser?.role === 'Admin';
  const myAdminAssignedAt = (currentUser as { adminAssignedAt?: string } | null)?.adminAssignedAt ?? null;

  const load = () => {
    setLoading(true);
    orgService
      .getUsersWithRoles()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const handleMakeAdmin = async (userId: string) => {
    if (userId === currentUser?.id) return;
    setAssigningId(userId);
    try {
      await orgService.makeAdmin(userId);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Не удалось назначить админа';
      alert(msg);
    } finally {
      setAssigningId(null);
    }
  };

  const canRemoveAdmin = (u: UserWithRole) =>
    isAdmin && u.role === 'Admin' && u.id !== currentUser?.id &&
    myAdminAssignedAt != null && u.adminAssignedAt != null &&
    myAdminAssignedAt < u.adminAssignedAt;

  const handleRemoveAdmin = async (userId: string, userName: string) => {
    if (!confirm(`Снять роль администратора с пользователя "${userName}"?`)) return;
    setRemovingAdminId(userId);
    try {
      await orgService.removeAdmin(userId);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Не удалось снять админа';
      alert(msg);
    } finally {
      setRemovingAdminId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === currentUser?.id) {
      alert('Нельзя удалить самого себя');
      return;
    }
    
    if (!confirm(`Вы уверены, что хотите удалить пользователя "${userName}"?\n\nЭто действие нельзя отменить. Все должности, которые занимает пользователь, станут вакантными.`)) {
      return;
    }
    
    setDeletingId(userId);
    try {
      await orgService.deleteUser(userId);
      load();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Ошибка при удалении пользователя';
      alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-textPrimary">Пользователи</h1>
          <p className="text-sm text-textSecondary mt-4">
            Доступ только для администраторов.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-textPrimary">Пользователи</h1>
        <p className="text-sm text-textSecondary mt-1">
          Список пользователей и их ролей. «Сделать админом» — назначить роль; «Убрать админа» — снять роль (только админ со старшинством может снять того, кто стал админом позже).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Сотрудники и роли</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-textSecondary py-4">Загрузка...</p>
          )}
          {!loading && users.length === 0 && (
            <p className="text-sm text-textSecondary py-4">Нет пользователей.</p>
          )}
          {!loading && users.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Роль</TableHead>
                  {isAdmin && <TableHead className="w-[140px]">Действия</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <span className="font-medium text-textPrimary">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-textSecondary">{u.email}</TableCell>
                    <TableCell className="text-textSecondary">{u.postTitle ?? '—'}</TableCell>
                    <TableCell>
                      <span className={u.role === 'Admin' ? 'text-primary font-medium' : 'text-textSecondary'}>
                        {u.role ?? '—'}
                      </span>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.role === 'Admin' ? (
                            <>
                              <span className="text-xs text-textSecondary">Администратор</span>
                              {canRemoveAdmin(u) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={removingAdminId === u.id}
                                  onClick={() => handleRemoveAdmin(u.id, u.name)}
                                  title="Убрать роль администратора"
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                >
                                  {removingAdminId === u.id ? '…' : <><ShieldOff className="w-4 h-4 mr-1" />Убрать админа</>}
                                </Button>
                              )}
                            </>
                          ) : (
                            <ProtectedAction action="edit" resource="org">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={assigningId === u.id || u.id === currentUser?.id}
                                onClick={() => handleMakeAdmin(u.id)}
                              >
                                {assigningId === u.id ? '…' : <><Shield className="w-4 h-4 mr-1" />Сделать админом</>}
                              </Button>
                            </ProtectedAction>
                          )}
                          <ProtectedAction action="edit" resource="org">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                              disabled={deletingId === u.id || u.id === currentUser?.id}
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              title="Удалить пользователя"
                            >
                              {deletingId === u.id ? '…' : <Trash2 className="w-4 h-4" />}
                            </Button>
                          </ProtectedAction>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
