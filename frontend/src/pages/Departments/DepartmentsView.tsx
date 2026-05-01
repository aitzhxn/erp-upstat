import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Building2, Loader2 } from 'lucide-react';
import { orgService } from '@/services/orgService';
import type { RootState } from '@/store/store';
import type { Department } from '@/types';

export default function DepartmentsView() {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formManagerPostId, setFormManagerPostId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  
  const isAdmin = currentUser?.role === 'Admin';

  const load = () => {
    setLoading(true);
    orgService
      .getDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const handleCreate = async () => {
    if (!formName.trim()) {
      alert('Введите название отдела');
      return;
    }
    
    setSaving(true);
    try {
      await orgService.createDepartment({
        name: formName.trim(),
        parentId: formParentId || null,
        managerPostId: formManagerPostId || null,
      });
      setFormName('');
      setFormParentId('');
      setFormManagerPostId('');
      setShowCreateForm(false);
      load();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Ошибка при создании отдела';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formName.trim()) {
      alert('Введите название отдела');
      return;
    }
    
    setSaving(true);
    try {
      await orgService.updateDepartment(id, {
        name: formName.trim(),
        parentId: formParentId || null,
        managerPostId: formManagerPostId || null,
      });
      setEditingId(null);
      setFormName('');
      setFormParentId('');
      setFormManagerPostId('');
      load();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Ошибка при обновлении отдела';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Вы уверены, что хотите удалить отдел "${name}"?\n\nЭто действие нельзя отменить.`)) {
      return;
    }
    
    setDeletingId(id);
    try {
      await orgService.deleteDepartment(id);
      load();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Ошибка при удалении отдела';
      alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (dept: Department) => {
    setEditingId(dept.id);
    setFormName(dept.name);
    setFormParentId(dept.parentId || '');
    setFormManagerPostId(dept.managerPostId || '');
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormName('');
    setFormParentId('');
    setFormManagerPostId('');
  };

  const startCreate = () => {
    setShowCreateForm(true);
    setEditingId(null);
    setFormName('');
    setFormParentId('');
    setFormManagerPostId('');
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-textPrimary">Отделы</h1>
          <p className="text-sm text-textSecondary mt-4">
            Доступ только для администраторов.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-textPrimary">Управление отделами</h1>
          <p className="text-sm text-textSecondary mt-1">
            Создавайте, редактируйте и удаляйте отделы организации
          </p>
        </div>
        {!showCreateForm && !editingId && (
          <Button onClick={startCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Создать отдел
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Новый отдел</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-textPrimary mb-2">
                  Название отдела *
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Например: Производство"
                  disabled={saving}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-textPrimary mb-2">
                  Родительский отдел (опционально)
                </label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  disabled={saving}
                >
                  <option value="">Нет (корневой отдел)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Создание...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Создать
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormName('');
                    setFormParentId('');
                  }}
                  disabled={saving}
                >
                  Отмена
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Departments Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Список отделов
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : departments.length === 0 ? (
            <p className="text-sm text-textSecondary py-8 text-center">
              Нет отделов. Создайте первый отдел.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Родительский отдел</TableHead>
                  <TableHead className="w-[200px]">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell>
                      {editingId === dept.id ? (
                        <Input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="Название отдела"
                          disabled={saving}
                          className="max-w-md"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-textSecondary" />
                          <span className="font-medium text-textPrimary">{dept.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-textSecondary">
                      {editingId === dept.id ? (
                        <select
                          value={formParentId}
                          onChange={(e) => setFormParentId(e.target.value)}
                          className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          disabled={saving}
                        >
                          <option value="">Нет (корневой отдел)</option>
                          {departments
                            .filter((d) => d.id !== dept.id)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        departments.find((d) => d.id === dept.parentId)?.name || '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === dept.id ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(dept.id)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Сохранить'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            Отмена
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(dept)}
                            disabled={deletingId === dept.id}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => handleDelete(dept.id, dept.name)}
                            disabled={deletingId === dept.id}
                          >
                            {deletingId === dept.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
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
