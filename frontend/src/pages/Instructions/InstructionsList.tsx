import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
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
  const [createTitle, setCreateTitle] = useState('');
  const [createPostId, setCreatePostId] = useState('');
  const [createOwnerPostId, setCreateOwnerPostId] = useState('');
  const [createStatus, setCreateStatus] = useState('draft');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const refetch = () => {
    instructionsService.getList(postIdFilter).then(setInstructions).catch(() => setInstructions([]));
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
      setCreateTitle('');
      setCreatePostId(postIdFilter ?? '');
      setCreateOwnerPostId(postIdFilter ?? '');
      setCreateStatus('draft');
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
    return matchesSearch && matchesStatus;
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
                    <TableCell>{instruction.postId}</TableCell>
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
        title="Create Instruction"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Title *</label>
            <input
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Post (Position) *</label>
            <select
              value={createPostId}
              onChange={(e) => setCreatePostId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
              required
            >
              <option value="">— Select —</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Owner Post *</label>
            <select
              value={createOwnerPostId}
              onChange={(e) => setCreateOwnerPostId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
              required
            >
              <option value="">— Select —</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Status</label>
            <select
              value={createStatus}
              onChange={(e) => setCreateStatus(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button
              disabled={!createTitle.trim() || !createPostId || !createOwnerPostId || createSubmitting}
              onClick={async () => {
                if (!createTitle.trim() || !createPostId || !createOwnerPostId) return;
                setCreateSubmitting(true);
                try {
                  const created = await instructionsService.create({
                    title: createTitle.trim(),
                    postId: createPostId,
                    ownerPostId: createOwnerPostId,
                    status: createStatus,
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
              {createSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
