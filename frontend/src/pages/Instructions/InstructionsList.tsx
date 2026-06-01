import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import ProtectedAction from '@/components/rbac/ProtectedAction';
import { instructionsService, type InstructionListItem } from '@/services/instructionsService';
import { orgService } from '@/services/orgService';
import type { PostWithHolder } from '@/types';

export default function InstructionsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postIdFilter = searchParams.get('postId') ?? undefined;
  const urlSearch = searchParams.get('search') ?? '';
  const [instructions, setInstructions] = useState<InstructionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [posts, setPosts] = useState<PostWithHolder[]>([]);
  const [myPosts, setMyPosts] = useState<PostWithHolder[]>([]);
  const [createTitle, setCreateTitle] = useState('');
  const [createPostId, setCreatePostId] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  
  const isSuperAdmin = currentUser?.role === 'Admin' || currentUser?.postId === 'p1';
  
  // Tab state: 'received' | 'issued' | 'all'
  const [activeTab, setActiveTab] = useState<'received' | 'issued' | 'all'>(
    isSuperAdmin ? 'all' : 'received'
  );

  const showTabs = currentUser?.role === 'Admin' || currentUser?.role === 'Department Head';

  const receivedCount = instructions.filter(i => i.postId === currentUser?.postId).length;
  const issuedCount = instructions.filter(i => i.ownerPostId === currentUser?.postId && i.postId !== currentUser?.postId).length;
  const allCount = instructions.length;

  const refetch = () => {
    instructionsService.getList(postIdFilter).then(setInstructions).catch(() => setInstructions([]));
  };

  const getDescendantPostIds = (allPosts: PostWithHolder[], startPostIds: string[]): string[] => {
    const descendants: string[] = [];
    const queue = [...startPostIds];
    const visited = new Set<string>(startPostIds);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = allPosts.filter(p => p.parentPostId === currentId);
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          descendants.push(child.id);
          queue.push(child.id);
        }
      }
    }
    return descendants;
  };

  const getFilteredPosts = () => {
    if (myPosts.length === 0) {
      return posts;
    }

    const isSuperAdmin = myPosts.some(p => p.id === 'p1');
    if (isSuperAdmin) {
      return posts;
    }

    const myPostIds = myPosts.map(p => p.id);
    const descendantIds = getDescendantPostIds(posts, myPostIds);
    return posts.filter(p => descendantIds.includes(p.id));
  };

  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    setLoading(true);
    instructionsService.getList(postIdFilter).then(setInstructions).catch(() => setInstructions([])).finally(() => setLoading(false));
  }, [postIdFilter]);

  useEffect(() => {
    if (showCreateModal) {
      orgService.getPosts().then(setPosts).catch(() => setPosts([]));
      orgService.getMyPosts().then(setMyPosts).catch(() => setMyPosts([]));
      setCreateTitle('');
      setCreatePostId(postIdFilter ?? '');
    }
  }, [showCreateModal, postIdFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'draft':
        return <Badge variant="warning">Draft</Badge>;
      case 'archived':
        return <Badge variant="default">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredInstructions = instructions.filter((instruction) => {
    const matchesSearch = instruction.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || instruction.status === statusFilter;
    
    let matchesTab = true;
    if (showTabs) {
      if (activeTab === 'received') {
        matchesTab = instruction.postId === currentUser?.postId;
      } else if (activeTab === 'issued') {
        matchesTab = instruction.ownerPostId === currentUser?.postId && instruction.postId !== currentUser?.postId;
      }
    }
    
    return matchesSearch && matchesStatus && matchesTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Инструкции</h1>
          <p className="text-sm text-textSecondary mt-1">
            {postIdFilter ? `По должности (postId: ${postIdFilter})` : 'Политики и процедуры по должностям'}
          </p>
        </div>
        <ProtectedAction action="edit" resource="instructions">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Instruction
          </Button>
        </ProtectedAction>
      </div>

      {showTabs && (
        <div className="flex border-b border-border/60 gap-2 mb-2">
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
                activeTab === 'all'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-hover/20'
              }`}
            >
              <span>Все регламенты</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === 'all' ? 'bg-primary/20 text-primary' : 'bg-surface border border-border text-textSecondary'
              }`}>
                {allCount}
              </span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
              activeTab === 'received'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-hover/20'
            }`}
          >
            <span>Полученные регламенты</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'received' ? 'bg-primary/20 text-primary' : 'bg-surface border border-border text-textSecondary'
            }`}>
              {receivedCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('issued')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
              activeTab === 'issued'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-surface-hover/20'
            }`}
          >
            <span>Выданные мной</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'issued' ? 'bg-primary/20 text-primary' : 'bg-surface border border-border text-textSecondary'
            }`}>
              {issuedCount}
            </span>
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-textSecondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-background border border-border rounded-lg text-sm text-textPrimary"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-textSecondary py-4">Загрузка...</p>}
          {!loading && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>По должности</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstructions.map((instruction) => (
                  <TableRow
                    key={instruction.id}
                    onClick={() => navigate(`/instructions/${instruction.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs">{instruction.id}</TableCell>
                    <TableCell className="font-medium text-textPrimary">{instruction.title}</TableCell>
                    <TableCell>{instruction.postTitle || instruction.postId}</TableCell>
                    <TableCell>{getStatusBadge(instruction.status)}</TableCell>
                    <TableCell>{instruction.updatedAt}</TableCell>
                    <TableCell>v{instruction.version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Создать регламент"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Название регламента *</label>
            <input
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Например: Регламент обработки заказов"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Должность сотрудника *</label>
            <select
              value={createPostId}
              onChange={(e) => setCreatePostId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
              required
            >
              <option value="">— Выберите должность —</option>
              {getFilteredPosts().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Отмена
            </Button>
            <Button
              disabled={!createTitle.trim() || !createPostId || createSubmitting}
              onClick={async () => {
                if (!createTitle.trim() || !createPostId) return;
                setCreateSubmitting(true);
                try {
                  const created = await instructionsService.create({
                    title: createTitle.trim(),
                    postId: createPostId,
                    status: 'draft',
                  });
                  setShowCreateModal(false);
                  refetch();
                  navigate(`/instructions/${created.id}`);
                } catch {
                  // keep modal open
                } finally {
                  setCreateSubmitting(false);
                }
              }}
            >
              {createSubmitting ? 'Создание…' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
