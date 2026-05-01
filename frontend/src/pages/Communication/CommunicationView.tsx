import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Send, Inbox, Archive, Mail, Paperclip, X, Download, Trash2 } from 'lucide-react';
import { communicationService, type MailboxMessage, type MailboxFolder } from '@/services/communicationService';
import { orgService } from '@/services/orgService';
import type { PostWithHolder } from '@/types';

export default function CommunicationView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const postIdFromUrl = searchParams.get('postId') ?? undefined;
  const [myPosts, setMyPosts] = useState<PostWithHolder[]>([]);
  const [myPostsLoading, setMyPostsLoading] = useState(true);
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [allPosts, setAllPosts] = useState<PostWithHolder[]>([]);
  const [composeRecipient, setComposeRecipient] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [folder, setFolder] = useState<MailboxFolder>('inbox');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clearConfirm, setClearConfirm] = useState(false);
  const [viewMessageId, setViewMessageId] = useState<string | null>(null);
  const [viewMessageFull, setViewMessageFull] = useState<MailboxMessage | null>(null);

  useEffect(() => {
    orgService
      .getMyPosts()
      .then(setMyPosts)
      .catch(() => setMyPosts([]))
      .finally(() => setMyPostsLoading(false));
  }, []);

  useEffect(() => {
    orgService.getPostsForRecipients().then(setAllPosts).catch(() => setAllPosts([]));
  }, []);

  const selectedPostId = postIdFromUrl && myPosts.some((p) => p.id === postIdFromUrl)
    ? postIdFromUrl
    : myPosts[0]?.id;

  useEffect(() => {
    if (myPosts.length > 0 && !postIdFromUrl) {
      setSearchParams({ postId: myPosts[0].id }, { replace: true });
    }
  }, [myPosts, postIdFromUrl, setSearchParams]);

  useEffect(() => {
    if (!selectedPostId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setSelectedIds(new Set());
    setLoading(true);
    communicationService
      .getMessages(selectedPostId, folder)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [selectedPostId, folder]);

  const selectBox = (postId: string) => {
    setSearchParams({ postId });
  };

  const openCompose = () => {
    setComposeRecipient('');
    setComposeSubject('');
    setComposeBody('');
    setComposeFiles([]);
    setComposeError(null);
    setShowComposeModal(true);
  };

  const closeCompose = () => {
    setShowComposeModal(false);
    setComposeError(null);
  };

  const handleSend = async () => {
    if (!composeRecipient.trim()) {
      setComposeError('Выберите получателя');
      return;
    }
    if (!composeSubject.trim()) {
      setComposeError('Введите тему');
      return;
    }
    setComposeSending(true);
    setComposeError(null);
    try {
      await communicationService.sendMessage({
        recipientPostId: composeRecipient,
        senderPostId: selectedPostId ?? undefined,
        subject: composeSubject.trim(),
        body: composeBody.trim(),
        files: composeFiles.length > 0 ? composeFiles : undefined,
      });
      closeCompose();
      window.dispatchEvent(new CustomEvent('communication-unread-changed'));
      if (selectedPostId) {
        communicationService.getMessages(selectedPostId, folder).then(setMessages).catch(() => {});
      }
    } catch {
      setComposeError('Не удалось отправить. Попробуйте позже.');
    } finally {
      setComposeSending(false);
    }
  };

  const handleMessageClick = async (msg: MailboxMessage) => {
    if (msg.unread && folder !== 'sent') {
      try {
        await communicationService.markAsRead(msg.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, unread: 0 } : m))
        );
        window.dispatchEvent(new CustomEvent('communication-unread-changed'));
      } catch {
        // ignore
      }
    }
    setViewMessageId(msg.id);
    setViewMessageFull(null);
  };

  const handleViewWorkPlan = (workPlanId: string) => {
    navigate(`/work-plans?viewId=${workPlanId}`);
    setViewMessageId(null);
  };

  useEffect(() => {
    if (!viewMessageId) {
      setViewMessageFull(null);
      return;
    }
    communicationService
      .getMessage(viewMessageId)
      .then(setViewMessageFull)
      .catch(() => setViewMessageId(null));
  }, [viewMessageId]);

  const closeViewModal = () => {
    setViewMessageId(null);
    setViewMessageFull(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(messages.map((m) => m.id)));
  };

  const handleArchiveSelected = async () => {
    if (selectedIds.size === 0 || folder === 'sent') return;
    try {
      await communicationService.archiveMessages(Array.from(selectedIds));
      setSelectedIds(new Set());
      communicationService.getMessages(selectedPostId!, folder).then(setMessages).catch(() => {});
      window.dispatchEvent(new CustomEvent('communication-unread-changed'));
    } catch {
      // ignore
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      await communicationService.deleteMessages(Array.from(selectedIds));
      setSelectedIds(new Set());
      communicationService.getMessages(selectedPostId!, folder).then(setMessages).catch(() => {});
      window.dispatchEvent(new CustomEvent('communication-unread-changed'));
    } catch {
      // ignore
    }
  };

  const handleClearMailbox = async () => {
    if (!selectedPostId) return;
    try {
      await communicationService.clearMailbox(selectedPostId, folder);
      setSelectedIds(new Set());
      setClearConfirm(false);
      communicationService.getMessages(selectedPostId, folder).then(setMessages).catch(() => {});
      window.dispatchEvent(new CustomEvent('communication-unread-changed'));
    } catch {
      setClearConfirm(false);
    }
  };

  const selectedPost = myPosts.find((p) => p.id === selectedPostId);
  const getRecipientTitle = (postId: string) => allPosts.find((p) => p.id === postId)?.title ?? postId;

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Communication</h1>
        <p className="text-sm text-textSecondary mt-1">
          {selectedPost
            ? `Письма для должности: ${selectedPost.title}`
            : 'Корпоративная переписка по должностям'}
        </p>
      </div>

      {/* Мои коробки (ящики) */}
      {myPostsLoading ? (
        <p className="text-sm text-textSecondary">Загрузка должностей…</p>
      ) : myPosts.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-textSecondary text-center">
              У вас нет назначенных должностей. Обратитесь к администратору.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-textSecondary self-center">Мои ящики:</span>
            {myPosts.map((post) => (
              <Button
                key={post.id}
                variant={selectedPostId === post.id ? 'primary' : 'outline'}
                size="sm"
                onClick={() => selectBox(post.id)}
                className="flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                {post.title}
              </Button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setFolder('inbox')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${folder === 'inbox' ? 'bg-primary text-white' : 'bg-surface text-textSecondary hover:bg-background'}`}
              >
                <Inbox className="w-4 h-4" />
                Входящие
              </button>
              <button
                type="button"
                onClick={() => setFolder('sent')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-l border-border ${folder === 'sent' ? 'bg-primary text-white' : 'bg-surface text-textSecondary hover:bg-background'}`}
              >
                <Send className="w-4 h-4" />
                Отправленные
              </button>
              <button
                type="button"
                onClick={() => setFolder('archive')}
                className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-l border-border ${folder === 'archive' ? 'bg-primary text-white' : 'bg-surface text-textSecondary hover:bg-background'}`}
              >
                <Archive className="w-4 h-4" />
                Архив
              </button>
            </div>
            <Button onClick={openCompose}>
              <Send className="w-4 h-4 mr-2" />
              Написать
            </Button>
          </div>

          {/* Bulk actions */}
          {(selectedIds.size > 0 || messages.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {messages.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === messages.length}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                  />
                  Выбрать все
                </label>
              )}
              {selectedIds.size > 0 && (
                <>
                  {folder !== 'sent' && (
                    <Button variant="outline" size="sm" onClick={handleArchiveSelected}>
                      В архив
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleDeleteSelected} className="text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Удалить выбранные ({selectedIds.size})
                  </Button>
                </>
              )}
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearConfirm(true)}
                  className="ml-auto text-textSecondary"
                >
                  Очистить почту
                </Button>
              )}
            </div>
          )}

          {clearConfirm && (
            <div className="p-4 border border-border rounded-lg bg-surface">
              <p className="text-sm text-textPrimary mb-2">
                Удалить все сообщения в «{folder === 'inbox' ? 'Входящих' : folder === 'sent' ? 'Отправленных' : 'Архиве'}» для {selectedPost?.title}?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleClearMailbox} className="bg-red-500 hover:bg-red-600">
                  Да, очистить
                </Button>
                <Button variant="outline" size="sm" onClick={() => setClearConfirm(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}

      <Modal isOpen={showComposeModal} onClose={closeCompose} title="Написать сотруднику" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Кому (должность) *</label>
            <select
              value={composeRecipient}
              onChange={(e) => setComposeRecipient(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
            >
              <option value="">— Выберите должность —</option>
              {allPosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.currentHolder ? ` (${p.currentHolder.name})` : ' (вакансия)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Тема *</label>
            <input
              type="text"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              placeholder="Тема сообщения"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Сообщение</label>
            <textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              placeholder="Текст сообщения"
              rows={4}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary min-h-[100px] resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Вложения</label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx"
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setComposeFiles((prev) => [...prev, ...list]);
                e.target.value = '';
              }}
              className="hidden"
              id="compose-files"
            />
            <label
              htmlFor="compose-files"
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer hover:bg-background text-sm text-textSecondary"
            >
              <Paperclip className="w-4 h-4" />
              Прикрепить файлы (фото, PDF, документы)
            </label>
            {composeFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {composeFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1">
                    <span className="truncate text-textPrimary">{f.name}</span>
                    <button type="button" onClick={() => setComposeFiles((p) => p.filter((_, j) => j !== i))} className="p-1 hover:bg-surface rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {composeError && (
            <p className="text-sm text-red-500">{composeError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeCompose}>Отмена</Button>
            <Button onClick={handleSend} disabled={composeSending}>
              {composeSending ? 'Отправка…' : 'Отправить'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View message modal */}
      <Modal isOpen={!!viewMessageId} onClose={closeViewModal} title="Письмо" size="lg">
        {!viewMessageFull ? (
          <p className="text-sm text-textSecondary py-8 text-center">Загрузка…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div><span className="text-textSecondary">Тема: </span><span className="font-medium text-textPrimary">{viewMessageFull.subject}</span></div>
              {folder === 'sent' ? (
                <div><span className="text-textSecondary">Кому: </span><span className="text-textPrimary">{getRecipientTitle(viewMessageFull.recipientPostId)}</span></div>
              ) : (
                <div><span className="text-textSecondary">От: </span><span className="text-textPrimary">{viewMessageFull.senderEmail}</span></div>
              )}
              <div><span className="text-textSecondary">Дата: </span><span className="text-textPrimary">{viewMessageFull.messageDate}</span></div>
            </div>
            {viewMessageFull.workPlanId && (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-sm text-textPrimary mb-2">Это уведомление о плане работ</p>
                <Button size="sm" onClick={() => handleViewWorkPlan(viewMessageFull.workPlanId!)}>
                  Открыть план работ
                </Button>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <div className="text-sm text-textPrimary whitespace-pre-wrap min-h-[80px]">{viewMessageFull.body ?? viewMessageFull.bodySnippet ?? '—'}</div>
            </div>
            {viewMessageFull.attachments && viewMessageFull.attachments.length > 0 && (
              <div className="border-t border-border pt-4">
                <div className="text-sm font-medium text-textPrimary mb-2">Вложения</div>
                <div className="flex flex-wrap gap-2">
                  {viewMessageFull.attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => communicationService.downloadAttachment(att.id, att.filename).catch(() => {})}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg hover:bg-background"
                    >
                      <Download className="w-4 h-4" />
                      {att.filename}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Messages List */}
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-textSecondary py-8 text-center">Загрузка…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-textSecondary py-8 text-center">Нет сообщений по выбранной должности</p>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleMessageClick(message)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMessageClick(message)}
                  className={`h-[100px] p-4 border border-border rounded-lg cursor-pointer hover:bg-background transition-colors flex gap-3 overflow-hidden ${
                    message.unread ? 'bg-primary/5' : ''
                  } ${selectedIds.has(message.id) ? 'ring-2 ring-primary' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(message.id)}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(message.id);
                    }}
                    className="mt-1 rounded border-border flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 mb-0.5">
                        {message.unread ? <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div> : null}
                        {folder === 'sent' ? (
                          <span className="font-medium text-textPrimary truncate">Кому: {getRecipientTitle(message.recipientPostId)}</span>
                        ) : (
                          <span className="font-medium text-textPrimary truncate">{message.senderEmail}</span>
                        )}
                      </div>
                      <div className="text-sm text-textSecondary truncate">{message.subject}</div>
                      {message.bodySnippet ? (
                        <div className="text-xs text-textSecondary mt-0.5 line-clamp-2">{message.bodySnippet}</div>
                      ) : null}
                    </div>
                    <div className="text-xs text-textSecondary flex-shrink-0">{message.messageDate}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Внутренняя переписка</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-textSecondary">
            Сообщения доставляются в ящик должности. Выберите должность получателя при отправке.
          </p>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
