import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Edit2, Save, X, FileText, CheckCircle } from 'lucide-react';
import ProtectedAction from '@/components/rbac/ProtectedAction';
import { instructionsService, type InstructionListItem } from '@/services/instructionsService';

export default function InstructionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [instruction, setInstruction] = useState<InstructionListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingInstruction, setDeletingInstruction] = useState(false);

  // Acknowledgement states
  const [acknowledgements, setAcknowledgements] = useState<Array<{ userId: string; userName: string; userEmail: string; acknowledgedAt: string }>>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);

  useEffect(() => {
    if (!id) {
      setError('No instruction ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    instructionsService
      .getOne(id)
      .then((data) => {
        setInstruction(data);
        setEditTitle(data.title);
        setEditStatus(data.status);
        setEditContent(data.content || '');

        // Fetch acknowledgements if user has permissions
        if (currentUser?.role === 'Admin' || currentUser?.role === 'Department Head') {
          instructionsService.getAcknowledgements(id)
            .then(setAcknowledgements)
            .catch(() => setAcknowledgements([]));
        }
      })
      .catch(() => setError('Не удалось загрузить инструкцию'))
      .finally(() => setLoading(false));
  }, [id, currentUser]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Активна</Badge>;
      case 'draft':
        return <Badge variant="warning">Черновик</Badge>;
      case 'archived':
        return <Badge variant="default">Архив</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const handleStartEdit = () => {
    if (!instruction) return;
    setEditTitle(instruction.title);
    setEditStatus(instruction.status);
    setEditContent(instruction.content || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveChanges = async () => {
    if (!id || !instruction) return;
    if (!editTitle.trim()) {
      alert('Укажите название инструкции');
      return;
    }
    setSaving(true);
    try {
      const updated = await instructionsService.update(id, {
        title: editTitle.trim(),
        status: editStatus,
        content: editContent,
        version: editStatus === 'active' && instruction.status !== 'active' ? instruction.version + 1 : instruction.version,
      });
      setInstruction(updated);
      setIsEditing(false);
    } catch (err) {
      alert('Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInstruction = async () => {
    if (!id || !instruction) return;
    if (!window.confirm(`Вы уверены, что хотите удалить инструкцию «${instruction.title}»?`)) return;
    setDeletingInstruction(true);
    try {
      await instructionsService.delete(id);
      navigate('/instructions');
    } catch {
      alert('Не удалось удалить инструкцию');
    } finally {
      setDeletingInstruction(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!id) return;
    setAcknowledging(true);
    try {
      await instructionsService.acknowledge(id);
      setInstruction(prev => prev ? { ...prev, isAcknowledged: true } : null);
      
      // Update list if manager
      if (currentUser?.role === 'Admin' || currentUser?.role === 'Department Head') {
        const list = await instructionsService.getAcknowledgements(id);
        setAcknowledgements(list);
      }
    } catch (err) {
      alert('Не удалось зафиксировать ознакомление');
    } finally {
      setAcknowledging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
          <p className="text-textSecondary text-sm">Загрузка регламента...</p>
        </div>
      </div>
    );
  }

  if (error || !instruction) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/instructions')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>
        <p className="text-textSecondary">{error ?? 'Инструкция не найдена'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Navigation & Actions */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/instructions')} className="mb-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-textPrimary tracking-tight">{instruction.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {getStatusBadge(instruction.status)}
              <span className="text-xs text-textSecondary bg-surface border border-border px-2 py-0.5 rounded">
                Версия {instruction.version}
              </span>
              <span className="text-sm text-textSecondary border-l border-border pl-3">
                Для должности: <span className="font-medium text-textPrimary">{instruction.postTitle || instruction.postId}</span>
              </span>
            </div>
          </div>
          
          {!isEditing && (
            <div className="flex gap-2">
              <ProtectedAction action="edit" resource="instructions">
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Edit2 className="w-4 h-4 mr-1.5" />
                  Редактировать
                </Button>
              </ProtectedAction>
              
              <ProtectedAction action="edit" resource="instructions">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-error hover:bg-error/10 hover:text-error border-error/20"
                  disabled={deletingInstruction}
                  onClick={handleDeleteInstruction}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deletingInstruction ? 'Удаление…' : 'Удалить'}
                </Button>
              </ProtectedAction>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isEditing ? (
        <Card className="border border-border/80 shadow-lg bg-surface/50 backdrop-blur-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-lg font-semibold text-textPrimary flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              Редактирование регламента
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">
                  Название инструкции *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">
                  Статус
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="draft">Черновик</option>
                  <option value="active">Активна</option>
                  <option value="archived">Архив</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-textSecondary uppercase tracking-wider mb-2">
                Текст регламента
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={16}
                placeholder="Напишите здесь регламент, правила и инструкции для должности... Поддерживается перенос строк и форматирование списков."
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 line-height-relaxed font-sans"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border/40">
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving} className="px-4">
                <X className="w-4 h-4 mr-1.5" />
                Отменить
              </Button>
              <Button onClick={handleSaveChanges} disabled={saving} className="px-5">
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? 'Сохранение…' : 'Сохранить изменения'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border/80 shadow-md bg-surface overflow-hidden">
          <CardHeader className="bg-surface/50 border-b border-border/40 py-4 px-6 flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-textPrimary">Текст регламента</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 md:p-8 bg-surface">
            {instruction.content ? (
              <div 
                className="text-textPrimary text-sm md:text-base leading-relaxed whitespace-pre-wrap font-normal"
                style={{ fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)' }}
              >
                {instruction.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a
                      key={i}
                      href={part}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium break-all"
                    >
                      {part}
                    </a>
                  ) : (
                    part
                  )
                )}
              </div>
            ) : (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-surface-hover/30">
                <FileText className="w-12 h-12 text-textSecondary/40 mx-auto mb-3" />
                <h3 className="font-semibold text-textPrimary text-sm mb-1">Регламент пуст</h3>
                <p className="text-xs text-textSecondary max-w-sm mx-auto mb-5 leading-normal">
                  Текст инструкции для данной должности пока не заполнен. Добавьте описание обязанностей и правил.
                </p>
                <ProtectedAction action="edit" resource="instructions">
                  <Button variant="outline" size="sm" onClick={handleStartEdit}>
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    Заполнить регламент
                  </Button>
                </ProtectedAction>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Acknowledgment widgets for targeted employees */}
      {!isEditing && instruction?.status === 'active' && currentUser?.postId === instruction.postId && (
        <div>
          {instruction.isAcknowledged ? (
            <div className="flex items-center gap-3.5 p-4 bg-success/10 border border-success/30 rounded-xl text-success shadow-sm">
              <div className="p-2 rounded-full bg-success/15">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div className="space-y-0.5">
                <h4 className="font-semibold text-sm">Вы ознакомлены с этой инструкцией</h4>
                <p className="text-xs text-success/80">
                  Ваше ознакомление зафиксировано в системе и передано руководству. Регламент обязателен к исполнению.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-warning/10 border border-warning/30 rounded-xl shadow-sm">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-textPrimary">Требуется ознакомление с регламентом</h4>
                <p className="text-xs text-textSecondary leading-normal max-w-2xl">
                  Пожалуйста, внимательно изучите текст регламента выше. После прочтения нажмите на кнопку, чтобы подтвердить вашему руководителю факт ознакомления.
                </p>
              </div>
              <Button 
                onClick={handleAcknowledge} 
                disabled={acknowledging}
                className="bg-warning hover:bg-warning/90 text-textPrimary font-semibold w-full md:w-auto px-5 py-2.5 h-auto text-sm shrink-0"
              >
                {acknowledging ? 'Запись…' : 'Ознакомлен с инструкцией'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Acknowledgment Status Report for Managers */}
      {!isEditing && (currentUser?.role === 'Admin' || currentUser?.role === 'Department Head') && (
        <Card className="border border-border/80 shadow-md bg-surface overflow-hidden">
          <CardHeader className="bg-surface/50 border-b border-border/40 py-4 px-6 flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-textPrimary">Статус ознакомления сотрудников</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 bg-surface">
            {acknowledgements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-xs font-semibold text-textSecondary uppercase tracking-wider">
                      <th className="pb-3 pr-4 font-semibold">Сотрудник</th>
                      <th className="pb-3 px-4 font-semibold">Email</th>
                      <th className="pb-3 pl-4 font-semibold">Дата ознакомления</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-sm">
                    {acknowledgements.map((ack) => (
                      <tr key={ack.userId} className="hover:bg-surface-hover/30">
                        <td className="py-3.5 pr-4 font-medium text-textPrimary">{ack.userName}</td>
                        <td className="py-3.5 px-4 text-textSecondary">{ack.userEmail}</td>
                        <td className="py-3.5 pl-4 text-textSecondary font-mono text-xs">
                          {new Date(ack.acknowledgedAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 px-4">
                <p className="text-sm text-textSecondary leading-normal">
                  Никто из сотрудников пока не подтвердил ознакомление с данной инструкцией.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
