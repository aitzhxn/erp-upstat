import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Search, User, Building2, FileText, BarChart3, Mail, Plus, Pencil, Trash2, Move, UserMinus, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import ProtectedAction from '@/components/rbac/ProtectedAction';
import type { PostWithHolder, PostHolder } from '@/types';
import { orgService } from '@/services/orgService';
import { auditService, type AuditLogEntry } from '@/services/auditService';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';

/** Аватар: картинка или инициалы. */
function HolderAvatar({ holder, size = 'md' }: { holder: PostHolder; size?: 'sm' | 'md' }) {
  const initial = holder.name?.slice(0, 1).toUpperCase() ?? '?';
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  if (holder.avatarUrl) {
    return (
      <img
        src={holder.avatarUrl}
        alt={holder.name}
        className={`${sizeClass} rounded-full object-cover border border-border shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold shrink-0 border border-border`}
    >
      {initial}
    </div>
  );
}

/** Card color classes (Admin can set per post). */
const CARD_COLOR_CLASSES: Record<string, string> = {
  default: 'bg-surface border-border',
  blue: 'bg-primarySoft border-primarySoftBorder',
  green: 'bg-primary/5 border-primary/25',
  amber: 'bg-primary/10 border-primary/30',
  violet: 'bg-primary/[0.07] border-primary/30',
};

/** Компактная карточка узла оргсхемы (один пост). */
function NodeCard({
  post,
  isSelected,
  onSelect,
  HolderAvatar,
  isRoot,
  isSearchMatch,
}: {
  post: PostWithHolder;
  isSelected: boolean;
  onSelect: () => void;
  HolderAvatar: (props: { holder: PostHolder; size?: 'sm' | 'md' }) => React.ReactElement;
  isRoot: boolean;
  isSearchMatch?: boolean;
}) {
  const colorKey = post.cardColor && CARD_COLOR_CLASSES[post.cardColor] ? post.cardColor : 'default';
  const baseColorClass = CARD_COLOR_CLASSES[colorKey];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`shrink-0 rounded-lg text-left transition-all border-2 shadow-sm min-w-[140px] max-w-[200px] ${
        isRoot ? 'p-3' : 'p-2.5'
      } ${
        isSelected
          ? 'bg-primary/15 border-primary ring-2 ring-primary/30'
          : isSearchMatch
            ? 'border-primary/40 bg-primarySoft hover:bg-primary/10'
            : `${baseColorClass} hover:bg-background/80 hover:border-primary/40`
      }`}
    >
      <div className={`font-semibold text-textPrimary truncate ${isRoot ? 'text-sm' : 'text-xs'}`} title={post.title}>
        {post.title}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        {post.currentHolder ? (
          <>
            <HolderAvatar holder={post.currentHolder} size={isRoot ? 'md' : 'sm'} />
            <span className={`text-textSecondary truncate ${isRoot ? 'text-xs' : 'text-[11px]'}`} title={post.currentHolder.name}>
              {post.currentHolder.name}
            </span>
          </>
        ) : (
          <span className={`text-textSecondary italic ${isRoot ? 'text-xs' : 'text-[11px]'}`}>Вакансия</span>
        )}
      </div>
      {post.code && (
        <div className="text-[10px] text-textSecondary mt-0.5 truncate">{post.code}</div>
      )}
      {post.cardNotes && (
        <div className="text-[10px] text-textSecondary mt-1 line-clamp-2" title={post.cardNotes}>
          {/^https?:\/\//i.test(post.cardNotes.trim()) ? (
            <a href={post.cardNotes.trim()} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all" onClick={(e) => e.stopPropagation()}>
              {post.cardNotes.trim()}
            </a>
          ) : (
            post.cardNotes
          )}
        </div>
      )}
    </button>
  );
}

/** Классическая top-down иерархия: родитель сверху, дети в ряд под ним, соединительные линии. */
function PostNode({
  post,
  getChildren,
  selectedPost,
  onSelect,
  HolderAvatar,
  depth,
  isSearchMatch,
  getDepartmentName,
}: {
  post: PostWithHolder;
  getChildren: (parentId: string) => PostWithHolder[];
  selectedPost: PostWithHolder | null;
  onSelect: (p: PostWithHolder) => void;
  HolderAvatar: (props: { holder: PostHolder; size?: 'sm' | 'md' }) => React.ReactElement;
  depth: number;
  isSearchMatch?: (p: PostWithHolder) => boolean;
  getDepartmentName: (id: string) => string;
}) {
  const children = getChildren(post.id);
  const isSelected = selectedPost?.id === post.id;
  const isRoot = depth === 0;
  const match = isSearchMatch ? isSearchMatch(post) : false;

  return (
    <div className="inline-flex flex-col items-center">
      <NodeCard
        post={post}
        isSelected={!!isSelected}
        onSelect={() => onSelect(post)}
        HolderAvatar={HolderAvatar}
        isRoot={isRoot}
        isSearchMatch={match}
      />
      {children.length > 0 && (
        <>
          {/* Вертикальная линия от карточки вниз (elbow: к горизонтали) */}
          <div className="h-5 w-0.5 bg-black shrink-0" aria-hidden />
          {/* Горизонтальная линия; под ней — вертикальные отрезки к каждой дочерней карточке */}
          <div className="flex flex-row gap-3 justify-center items-start border-t-2 border-black pt-2">
            {children.map((child, idx) => (
              <div key={`${child.id}-${idx}`} className="flex flex-col items-center">
                <div className="h-2 w-0.5 bg-black shrink-0" aria-hidden />
                <PostNode
                  post={child}
                  getChildren={getChildren}
                  selectedPost={selectedPost}
                  onSelect={onSelect}
                  HolderAvatar={HolderAvatar}
                  depth={depth + 1}
                  isSearchMatch={isSearchMatch}
                  getDepartmentName={getDepartmentName}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Локальный mock, если API недоступен. Дерево постов; currentHolder === null = вакансия. */
const initialPostsMock: PostWithHolder[] = [
  { id: 'p1', title: 'Исполнительный директор', parentPostId: null, departmentId: 'd1', role: 'Admin', level: 0, orderIndex: 0, currentHolder: { userId: 'u1', name: 'Королева Анастасия', email: 'a@example.com' } },
  { id: 'p2', title: 'Заместитель по управлению', parentPostId: 'p1', departmentId: 'd2', role: 'Department Head', level: 1, orderIndex: 0, currentHolder: { userId: 'u2', name: 'Дана Ишмухаметова', email: 'd@example.com' } },
  { id: 'p3', title: 'Заместитель по производству', parentPostId: 'p1', departmentId: 'd3', role: 'Department Head', level: 1, orderIndex: 1, currentHolder: null },
  { id: 'p4', title: 'Руководитель 1 Отделения', parentPostId: 'p2', departmentId: 'd4', role: 'Section Head', level: 2, orderIndex: 0, currentHolder: { userId: 'u2', name: 'Дана Ишмухаметова', email: 'd@example.com' } },
  { id: 'p5', title: 'Начальник отдела 1', parentPostId: 'p4', departmentId: 'd4', role: 'Employee', level: 3, orderIndex: 0, currentHolder: { userId: 'u2', name: 'Дана Ишмухаметова', email: 'd@example.com' } },
];

export default function OrgChartView() {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [posts, setPosts] = useState<PostWithHolder[]>(initialPostsMock);
  const [myPosts, setMyPosts] = useState<PostWithHolder[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<PostWithHolder | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Partial<PostWithHolder>>({});
  const [newPostParentId, setNewPostParentId] = useState<string | null>(null);
  const [moveTargetParentId, setMoveTargetParentId] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string; email?: string; avatarUrl?: string; postId?: string | null }[]>([]);
  const [assignUserId, setAssignUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const refetchMyPosts = () => {
    if (currentUser?.id) {
      orgService.getMyPosts().then(setMyPosts).catch(() => setMyPosts([]));
    } else {
      setMyPosts([]);
    }
  };

  const refetchPosts = () => {
    setLoadError(null);
    refetchMyPosts();
    return orgService.getPosts()
      .then((data) => {
        setPosts(Array.isArray(data) ? data : []);
        return data;
      })
      .catch((err) => {
        setLoadError(err?.message ?? 'Не удалось загрузить данные');
        setPosts(initialPostsMock);
        return [] as PostWithHolder[];
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetchPosts();
  }, [currentUser?.id]);

  const myAllowedPostIds = useMemo(() => {
    if (currentUser?.role === 'Admin') {
      return new Set(posts.map((p) => p.id));
    }
    const allowed = new Set<string>();
    const getSubtree = (id: string) => {
      if (allowed.has(id)) return;
      allowed.add(id);
      posts.filter((p) => p.parentPostId === id).forEach((c) => getSubtree(c.id));
    };
    myPosts.forEach((mp) => getSubtree(mp.id));
    return allowed;
  }, [posts, myPosts, currentUser]);

  const isAtTheVeryTop = useMemo(() => {
    return currentUser?.role === 'Admin' || myPosts.some((mp) => !mp.parentPostId);
  }, [myPosts, currentUser]);

  const isSuperAdmin = useMemo(() => {
    return myPosts.some((mp) => mp.id === 'p1');
  }, [myPosts]);

  const canModifySelectedPost = useMemo(() => {
    if (!selectedPost) return false;
    if (isSuperAdmin) return true;
    if (selectedPost.parentPostId === null) {
      if (selectedPost.createdBy) {
        return selectedPost.createdBy === currentUser?.id;
      }
      return currentUser?.role === 'Admin';
    }
    return true;
  }, [selectedPost, currentUser, isSuperAdmin]);

  useEffect(() => {
    orgService.getDepartments().then((list) => {
      setDepartments(Array.isArray(list) ? list.map((d) => ({ id: d.id, name: d.name })) : []);
    }).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (showAssignModal) {
      orgService.getUsers().then(setUsers).catch(() => setUsers([]));
      setAssignUserId(selectedPost?.currentHolder?.userId ?? '');
    }
  }, [showAssignModal, selectedPost?.currentHolder?.userId]);

  const rootPosts = posts.filter((p) => !p.parentPostId);
  const getChildren = (parentId: string) =>
    posts.filter((p) => p.parentPostId === parentId).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const getDepartmentName = (departmentId: string) =>
    departments.find((d) => d.id === departmentId)?.name ?? departmentId;

  const searchQueryLower = searchQuery.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!searchQueryLower) return new Set(posts.map((p) => p.id));
    const getDept = (id: string) => departments.find((d) => d.id === id)?.name ?? id;
    const matching = posts.filter(
      (p) =>
        p.title.toLowerCase().includes(searchQueryLower) ||
        getDept(p.departmentId).toLowerCase().includes(searchQueryLower)
    );
    const ids = new Set<string>(matching.map((p) => p.id));
    matching.forEach((p) => {
      let current: PostWithHolder | undefined = p;
      while (current?.parentPostId) {
        ids.add(current.parentPostId);
        current = posts.find((x) => x.id === current!.parentPostId);
      }
    });
    return ids;
  }, [posts, searchQueryLower, departments]);

  const filteredRootPosts = useMemo(() => rootPosts.filter((p) => visibleIds.has(p.id)), [rootPosts, visibleIds]);
  const getChildrenFiltered = (parentId: string) =>
    getChildren(parentId).filter((c) => visibleIds.has(c.id));
  const isSearchMatch = (post: PostWithHolder) =>
    !!searchQueryLower &&
    (post.title.toLowerCase().includes(searchQueryLower) ||
      getDepartmentName(post.departmentId).toLowerCase().includes(searchQueryLower));

  const handleAddPost = (parentId: string | null) => {
    setNewPostParentId(parentId);
    setEditingPost({
      title: '',
      code: '',
      departmentId: departments[0]?.id ?? 'd1',
      parentPostId: parentId,
      level: parentId ? (posts.find((p) => p.id === parentId)?.level ?? 0) + 1 : 0,
      orderIndex: parentId ? getChildren(parentId).length : rootPosts.length,
      role: 'Employee',
      currentHolder: null,
    });
    setShowAddModal(true);
  };

  const handleSaveNewPost = async () => {
    const title = (editingPost.title as string)?.trim();
    if (!title) return;
    setShowAddModal(false);
    setEditingPost({});
    setNewPostParentId(null);
    try {
      const newPost = await orgService.createPost({
        title,
        parentPostId: newPostParentId ?? undefined,
        departmentId: (editingPost.departmentId as string) || 'd1',
        role: (editingPost.role as PostWithHolder['role']) ?? 'Employee',
        level: (editingPost.level as number) ?? 0,
        orderIndex: editingPost.orderIndex ?? 0,
        code: (editingPost.code as string) || undefined,
      });
      const data = await refetchPosts();
      setSelectedPost(data.find((p) => p.id === newPost.id) ?? newPost);
    } catch {
      setShowAddModal(true);
      setNewPostParentId(newPostParentId);
      setEditingPost(editingPost);
    }
  };

  const handleEditPost = () => {
    if (!selectedPost) return;
    setEditingPost({
      title: selectedPost.title,
      code: selectedPost.code ?? '',
      departmentId: selectedPost.departmentId,
      cardColor: selectedPost.cardColor ?? '',
      cardNotes: selectedPost.cardNotes ?? '',
    });
    setShowEditModal(true);
  };

  const handleSaveEditPost = async () => {
    const title = (editingPost.title as string)?.trim();
    if (!title || !selectedPost) return;
    setShowEditModal(false);
    setEditingPost({});
    try {
      await orgService.updatePost(selectedPost.id, {
        title,
        code: (editingPost.code as string) || undefined,
        departmentId: (editingPost.departmentId as string) ?? selectedPost.departmentId,
        cardColor: (editingPost.cardColor as string) || undefined,
        cardNotes: (editingPost.cardNotes as string) || undefined,
      });
      const data = await refetchPosts();
      setSelectedPost(data.find((p) => p.id === selectedPost.id) ?? null);
    } catch {
      setShowEditModal(true);
      setEditingPost(editingPost);
    }
  };

  const handleMovePost = () => {
    if (!selectedPost) return;
    setMoveTargetParentId(selectedPost.parentPostId ?? null);
    setShowMoveModal(true);
  };

  const handleSaveMovePost = async () => {
    if (!selectedPost) return;
    const newParentId = moveTargetParentId;
    const parentLevel = newParentId ? (posts.find((p) => p.id === newParentId)?.level ?? 0) + 1 : 0;
    setShowMoveModal(false);
    setMoveTargetParentId(null);
    try {
      await orgService.updatePost(selectedPost.id, { parentPostId: newParentId, level: parentLevel });
      const data = await refetchPosts();
      setSelectedPost(data.find((p) => p.id === selectedPost.id) ?? null);
    } catch {
      setShowMoveModal(true);
      setMoveTargetParentId(moveTargetParentId);
    }
  };

  const handleDeletePost = async () => {
    if (!selectedPost) return;
    const hasChildren = getChildren(selectedPost.id).length > 0;
    if (hasChildren && !window.confirm('У этой должности есть подчинённые. Удалить вместе с ними?')) return;
    setShowDeleteModal(false);
    const postToDelete = selectedPost;
    setSelectedPost(null);
    try {
      await orgService.deletePost(postToDelete.id, hasChildren);
      await refetchPosts();
    } catch {
      setSelectedPost(postToDelete);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Организационная схема</h1>
          <p className="text-sm text-textSecondary mt-1">
            Схема строится из должностей (постов). Редактируйте структуру в режиме конструктора.
          </p>
        </div>
        {isAtTheVeryTop && (
          <ProtectedAction action="edit" resource="org">
            <Button variant="outline" size="sm" onClick={() => handleAddPost(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить корневую должность
            </Button>
          </ProtectedAction>
        )}
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-textSecondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-surface">
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} title="Уменьшить">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-textSecondary min-w-[2.5rem] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} title="Увеличить">
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={exporting !== null || loading || rootPosts.length === 0}
          onClick={async () => {
            if (!chartContainerRef.current) return;
            setExporting('png');
            try {
              const canvas = await html2canvas(chartContainerRef.current, {
                backgroundColor: undefined,
                scale: 2,
                useCORS: true,
              });
              const link = document.createElement('a');
              link.download = `org-chart-${new Date().toISOString().slice(0, 10)}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
            } finally {
              setExporting(null);
            }
          }}
          title="Экспорт в PNG"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting === 'png' ? '…' : 'Экспорт PNG'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={exporting !== null || loading || rootPosts.length === 0}
          onClick={async () => {
            if (!chartContainerRef.current) return;
            setExporting('pdf');
            try {
              const canvas = await html2canvas(chartContainerRef.current, {
                backgroundColor: undefined,
                scale: 2,
                useCORS: true,
              });
              const imgData = canvas.toDataURL('image/png');
              const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
              const pageW = pdf.internal.pageSize.getWidth();
              const pageH = pdf.internal.pageSize.getHeight();
              const scale = Math.min(pageW / canvas.width, pageH / canvas.height) * 0.95;
              const imgW = canvas.width * scale;
              const imgH = canvas.height * scale;
              pdf.addImage(imgData, 'PNG', (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH);
              pdf.save(`org-chart-${new Date().toISOString().slice(0, 10)}.pdf`);
            } finally {
              setExporting(null);
            }
          }}
          title="Экспорт в PDF"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting === 'pdf' ? '…' : 'Экспорт PDF'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0 flex flex-col">
          <Card>
            <CardContent className="p-4 min-h-[360px] flex flex-col">
              {loading && (
                <div className="flex items-center justify-center py-12 text-textSecondary text-sm">
                  Загрузка...
                </div>
              )}
              {!loading && loadError && (
                <div className="mb-4 shrink-0 rounded-lg border border-primary/20 bg-primarySoft p-4 text-sm text-primary">
                  {loadError}. Показаны локальные данные.
                </div>
              )}
              {!loading && rootPosts.length === 0 && (
                <div className="text-center py-12 text-textSecondary text-sm">
                  Нет должностей. Добавьте корневую должность.
                </div>
              )}
              {!loading && rootPosts.length > 0 && (
                <div
                  className="overflow-auto flex-1 rounded border border-border bg-background/50"
                  onWheel={(e) => {
                    if (!e.ctrlKey) return;
                    e.preventDefault();
                    setZoom((z) => Math.min(2, Math.max(0.5, z - (e.deltaY > 0 ? 0.1 : -0.1))));
                  }}
                >
                  <div
                    ref={chartContainerRef}
                    className="flex justify-center p-6 min-w-max origin-top"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <div className="inline-flex flex-col items-center">
                      {filteredRootPosts.length === 0 ? (
                        <p className="text-sm text-textSecondary py-8">Нет должностей по запросу «{searchQuery}»</p>
                      ) : filteredRootPosts.length === 1 ? (
                        <PostNode
                          key={filteredRootPosts[0].id}
                          post={filteredRootPosts[0]}
                          getChildren={getChildrenFiltered}
                          selectedPost={selectedPost}
                          onSelect={setSelectedPost}
                          HolderAvatar={HolderAvatar}
                          depth={0}
                          isSearchMatch={isSearchMatch}
                          getDepartmentName={getDepartmentName}
                        />
                      ) : (
                        <div className="flex flex-row gap-6 justify-center items-start">
                          {filteredRootPosts.map((post, idx) => (
                            <PostNode
                              key={`${post.id}-${idx}`}
                              post={post}
                              getChildren={getChildrenFiltered}
                              selectedPost={selectedPost}
                              onSelect={setSelectedPost}
                              HolderAvatar={HolderAvatar}
                              depth={0}
                              isSearchMatch={isSearchMatch}
                              getDepartmentName={getDepartmentName}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedPost && (isSuperAdmin || myAllowedPostIds.has(selectedPost.id)) ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-textPrimary">{selectedPost.title}</h3>
                  {selectedPost.code && (
                    <p className="text-sm text-textSecondary mt-1">{selectedPost.code}</p>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-textSecondary shrink-0" />
                    <span className="text-textSecondary">Отдел:</span>
                    <span className="text-textPrimary">{getDepartmentName(selectedPost.departmentId)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-textSecondary shrink-0" />
                    <span className="text-textSecondary">На посту:</span>
                    {selectedPost.currentHolder ? (
                      <span className="flex items-center gap-2 text-textPrimary">
                        <HolderAvatar holder={selectedPost.currentHolder} size="sm" />
                        {selectedPost.currentHolder.name}
                      </span>
                    ) : (
                      <span className="text-textSecondary italic">Вакансия</span>
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t border-border space-y-2">
                  <Link
                    to={`/instructions?postId=${selectedPost.id}`}
                    className="flex items-center w-full px-4 py-2 rounded-lg text-textSecondary hover:bg-background text-sm font-medium border border-transparent hover:border-border"
                  >
                    <FileText className="w-4 h-4 mr-2 shrink-0" />
                    Инструкции по должности
                  </Link>
                  <Link
                    to={`/statistics?postId=${selectedPost.id}`}
                    className="flex items-center w-full px-4 py-2 rounded-lg text-textSecondary hover:bg-background text-sm font-medium border border-transparent hover:border-border"
                  >
                    <BarChart3 className="w-4 h-4 mr-2 shrink-0" />
                    Статистика по должности
                  </Link>
                  <Link
                    to={selectedPost ? `/communication?postId=${selectedPost.id}` : '/communication'}
                    className="flex items-center w-full px-4 py-2 rounded-lg text-textSecondary hover:bg-background text-sm font-medium"
                  >
                    <Mail className="w-4 h-4 mr-2 shrink-0" />
                    Почта по должности
                  </Link>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="text-sm font-semibold text-textPrimary mb-2">Конструктор</div>
                  <div className="space-y-2">
                    <ProtectedAction action="edit" resource="org">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => handleAddPost(selectedPost.id)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить дочернюю должность
                      </Button>
                    </ProtectedAction>
                    {canModifySelectedPost && (
                      <ProtectedAction action="edit" resource="org">
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleEditPost}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Редактировать должность
                        </Button>
                      </ProtectedAction>
                    )}
                    {canModifySelectedPost && (
                      <ProtectedAction action="edit" resource="org">
                        <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleMovePost}>
                          <Move className="w-4 h-4 mr-2" />
                          Переместить в дереве
                        </Button>
                      </ProtectedAction>
                    )}
                    {canModifySelectedPost && (
                      <ProtectedAction action="edit" resource="org">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => setShowDeleteModal(true)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Удалить должность
                        </Button>
                      </ProtectedAction>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-2">
                  {canModifySelectedPost && (
                    <ProtectedAction action="edit" resource="org">
                      <Button variant="outline" className="w-full" onClick={() => setShowAssignModal(true)}>
                        Назначить / переместить сотрудника
                      </Button>
                    </ProtectedAction>
                  )}
                  {canModifySelectedPost && selectedPost.currentHolder && (
                    <ProtectedAction action="edit" resource="org">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                          if (!selectedPost) return;
                          try {
                            await orgService.vacatePost(selectedPost.id);
                            const data = await refetchPosts();
                            setSelectedPost(data.find((p) => p.id === selectedPost.id) ?? null);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <UserMinus className="w-4 h-4 mr-2" />
                        Снять сотрудника (вакансия)
                      </Button>
                    </ProtectedAction>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={async () => {
                      if (!selectedPost) return;
                      setShowAuditModal(true);
                      setAuditLoading(true);
                      try {
                        const list = await auditService.getByPostId(selectedPost.id);
                        setAuditLogs(list);
                      } catch {
                        setAuditLogs([]);
                      } finally {
                        setAuditLoading(false);
                      }
                    }}
                  >
                    Аудит по должности
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-textSecondary text-center mb-2">
                Выберите должность (пост) в схеме слева — откроются инструкции, статистика, почта и конструктор.
              </p>
              <p className="text-xs text-textSecondary text-center">
                Кликните по блоку «Исполнительный директор» или по заместителям — справа появится блок «Конструктор» с кнопками редактирования.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Назначить / переместить сотрудника на должность" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Сотрудник</label>
            <select
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
            >
              <option value="">— Не назначать (оставить вакансию) —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.email ? `(${u.email})` : ''} {u.postId && u.postId !== selectedPost?.id ? ' — на другой должности' : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-textSecondary">
            При назначении сотрудник будет снят с текущей должности и получит доступ к инструкциям и статистике по новой должности.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>Отмена</Button>
            <Button
              onClick={async () => {
                if (!selectedPost) return;
                try {
                  if (assignUserId) {
                    await orgService.assignUserToPost(selectedPost.id, assignUserId);
                  } else {
                    await orgService.vacatePost(selectedPost.id);
                  }
                  const data = await refetchPosts();
                  setSelectedPost(data.find((p) => p.id === selectedPost.id) ?? null);
                  setShowAssignModal(false);
                } catch {
                  // keep modal open
                }
              }}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAuditModal}
        onClose={() => { setShowAuditModal(false); setAuditLogs([]); }}
        title={selectedPost ? `Аудит по должности: ${selectedPost.title}` : 'Аудит по должности'}
        size="md"
      >
        <div className="space-y-2 max-h-[60vh] overflow-auto">
          {auditLoading ? (
            <p className="text-sm text-textSecondary py-4 text-center">Загрузка…</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-textSecondary py-4 text-center">Нет записей аудита по этой должности</p>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 border border-border rounded-lg bg-background text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-textPrimary">{log.action}</span>
                  <span className="text-xs text-textSecondary">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-xs text-textSecondary mt-1">Пользователь: {log.userId}</div>
                {log.changes ? (
                  <div className="text-xs text-textSecondary mt-1 break-all">{log.changes}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setEditingPost({}); setNewPostParentId(null); }} title="Добавить должность" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Название должности *</label>
            <input
              type="text"
              value={editingPost.title ?? ''}
              onChange={(e) => setEditingPost((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Ключевое слово (код)</label>
            <input
              type="text"
              value={editingPost.code ?? ''}
              onChange={(e) => setEditingPost((p) => ({ ...p, code: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Отдел</label>
            <select
              value={editingPost.departmentId ?? 'd1'}
              onChange={(e) => setEditingPost((p) => ({ ...p, departmentId: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowAddModal(false); setEditingPost({}); setNewPostParentId(null); }}>Отмена</Button>
            <Button onClick={handleSaveNewPost}>Добавить</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setEditingPost({}); }} title="Редактировать должность" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Название должности *</label>
            <input
              type="text"
              value={editingPost.title ?? ''}
              onChange={(e) => setEditingPost((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Ключевое слово (код)</label>
            <input
              type="text"
              value={editingPost.code ?? ''}
              onChange={(e) => setEditingPost((p) => ({ ...p, code: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Отдел</label>
            <select
              value={editingPost.departmentId ?? departments[0]?.id ?? 'd1'}
              onChange={(e) => setEditingPost((p) => ({ ...p, departmentId: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Цвет карточки</label>
            <select
              value={editingPost.cardColor ?? 'default'}
              onChange={(e) => setEditingPost((p) => ({ ...p, cardColor: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            >
              <option value="default">По умолчанию</option>
              <option value="blue">Синий</option>
              <option value="green">Зелёный</option>
              <option value="amber">Янтарный</option>
              <option value="violet">Фиолетовый</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Заметка или ссылка на карточке</label>
            <textarea
              value={editingPost.cardNotes ?? ''}
              onChange={(e) => setEditingPost((p) => ({ ...p, cardNotes: e.target.value }))}
              placeholder=""
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm min-h-[60px] resize-y"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingPost({}); }}>Отмена</Button>
            <Button onClick={handleSaveEditPost}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showMoveModal} onClose={() => { setShowMoveModal(false); setMoveTargetParentId(null); }} title="Переместить должность в дереве" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Новый родитель (вышестоящая должность)</label>
            <select
              value={moveTargetParentId ?? ''}
              onChange={(e) => setMoveTargetParentId(e.target.value === '' ? null : e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
            >
              <option value="">— Корень (без родителя) —</option>
              {posts.filter((p) => p.id !== selectedPost?.id).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowMoveModal(false); setMoveTargetParentId(null); }}>Отмена</Button>
            <Button onClick={handleSaveMovePost}>Переместить</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Удалить должность?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-textSecondary">
            Должность «{selectedPost?.title}» будет удалена. Подчинённые должности тоже можно удалить.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleDeletePost}>Удалить</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
