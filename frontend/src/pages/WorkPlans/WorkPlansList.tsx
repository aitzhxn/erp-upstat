import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import { Modal } from '@/components/ui/modal';
import {
  Search, Plus, Pencil, Send, Check, X, Trash2,
  ArrowUpRight, MessageSquare, Clock, ChevronRight, FileText,
  CheckCircle, XCircle, RefreshCw, AlertCircle, LayoutGrid, List,
} from 'lucide-react';
import {
  workPlansService,
  type WorkPlanItem,
  type WorkPlanWithTasks,
  type WorkPlanWorkflowStatus,
} from '@/services/workPlansService';
import { orgService } from '@/services/orgService';
import type { PostWithHolder } from '@/types';
import {
  useWorkPlan,
  WORKFLOW_TO_MACHINE,
  type WorkPlanMachineState,
} from '@/components/WorkPlans/useWorkPlan';

type TabFilter = 'all' | 'draft' | 'my_approval' | 'submitted' | 'approved';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getMachineState(wfStatus: string): WorkPlanMachineState {
  return WORKFLOW_TO_MACHINE[wfStatus as WorkPlanWorkflowStatus] ?? 'DRAFT';
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s));
  } catch {
    return s;
  }
}

/** Renders plain text with any URLs converted to clickable <a> tags. */
function renderTextWithLinks(text: string): ReactNode {
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const IS_URL = /^https?:\/\//;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all inline-flex items-center gap-0.5 font-medium"
          >
            {part}
            <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function getTrackBadge(status: string): ReactNode {
  const cfg: Record<string, { label: string; cls: string }> = {
    'on-track': { label: 'В норме',  cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    'at-risk':  { label: 'Под угрозой', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    'overdue':  { label: 'Просрочен', cls: 'bg-red-50 text-red-700 border border-red-200' },
  };
  const c = cfg[status];
  if (!c) return <span className="text-xs text-slate-500">{status}</span>;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
}

// ─── Workflow Status Badge — строгий корпоративный ─────────────────────────

type WFConfig = { label: string; icon: React.ElementType; textCls: string; dotCls: string };

const WF_CONFIG: Record<WorkPlanMachineState, WFConfig> = {
  DRAFT:        { label: 'Черновик',         icon: FileText,    textCls: 'text-slate-500', dotCls: 'bg-slate-400' },
  ASCENDING:    { label: 'На согласовании',  icon: Send,        textCls: 'text-blue-600',  dotCls: 'bg-blue-500 animate-pulse' },
  ACTIVE:       { label: 'Согласован',        icon: CheckCircle, textCls: 'text-emerald-600', dotCls: 'bg-emerald-500' },
  REFRACTING:   { label: 'На доработку',     icon: RefreshCw,   textCls: 'text-amber-600', dotCls: 'bg-amber-500' },
  RESTRUCTURED: { label: 'Отклонён',          icon: XCircle,     textCls: 'text-red-600',   dotCls: 'bg-red-500' },
};

function StatusChip({ state, compact = false }: { state: WorkPlanMachineState; compact?: boolean }) {
  const cfg = WF_CONFIG[state];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} font-medium ${cfg.textCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dotCls}`} />
      <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {cfg.label}
    </span>
  );
}

// ─── Journey Steps ─────────────────────────────────────────────────────────

function JourneySteps({ state }: { state: WorkPlanMachineState }) {
  const steps: { label: string; key: WorkPlanMachineState }[] = [
    { label: 'Черновик', key: 'DRAFT' },
    { label: 'Согласование', key: 'ASCENDING' },
    { label: 'Исполнение', key: 'ACTIVE' },
  ];

  const orderMap: Record<WorkPlanMachineState, number> = {
    DRAFT: 0, ASCENDING: 1, ACTIVE: 2, REFRACTING: 1, RESTRUCTURED: 1,
  };
  const currentOrder = orderMap[state];
  const isError = state === 'REFRACTING' || state === 'RESTRUCTURED';

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const done = idx < currentOrder;
        const active = idx === currentOrder;
        const errActive = active && isError;
        return (
          <div key={step.key} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-y border-l
              ${idx === 0 ? 'rounded-l border-l' : ''}
              ${idx === steps.length - 1 ? 'rounded-r border-r' : ''}
              ${done
                ? 'bg-slate-900 text-white border-slate-900'
                : errActive
                ? 'bg-red-50 text-red-700 border-red-200'
                : active
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-400 border-slate-200'
              }
            `}>
              {done && <Check className="w-3 h-3" />}
              {errActive && <AlertCircle className="w-3 h-3" />}
              {step.label}
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-4 h-px ${done ? 'bg-slate-900' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
      {isError && (
        <div className="ml-2">
          <StatusChip state={state} compact />
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function WorkPlansList() {
  const [searchParams] = useSearchParams();
  const postIdFilter = searchParams.get('postId') ?? undefined;
  const viewIdFromUrl = searchParams.get('viewId') ?? undefined;

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [tab, setTab] = useState<TabFilter>('all');
  const [workPlans, setWorkPlans] = useState<WorkPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewPlanId, setViewPlanId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<WorkPlanWithTasks | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [submitPlan, setSubmitPlan] = useState<WorkPlanWithTasks | null>(null);
  const [submitAncestors, setSubmitAncestors] = useState<Array<{ id: string; title: string; label: string }>>([]);
  const [submitApproverId, setSubmitApproverId] = useState('');
  const [bossComment, setBossComment] = useState('');

  const [posts, setPosts] = useState<PostWithHolder[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [formPostId, setFormPostId] = useState('');
  const [formMessageText, setFormMessageText] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formStatus, setFormStatus] = useState('on-track');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPeriod, setFormPeriod] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createAncestors, setCreateAncestors] = useState<Array<{ id: string; title: string; label: string }>>([]);
  const [createApproverId, setCreateApproverId] = useState('');
  const [approverLabel, setApproverLabel] = useState<string | null>(null);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [myPostIds, setMyPostIds] = useState<string[]>([]);

  const actorCtx = useMemo(() => ({
    currentUserId: currentUser?.id ?? null,
    myPostIds,
    userRole: currentUser?.role ?? null,
  }), [currentUser, myPostIds]);

  const workPlanHook = useWorkPlan(actorCtx);

  // ─── Fetching ─────────────────────────────────────────────────────────────

  const refetch = useCallback(() => {
    setLoading(true);
    if (tab === 'my_approval') {
      workPlansService.getList({ forMyApproval: true })
        .then(setWorkPlans).catch(() => setWorkPlans([]))
        .finally(() => setLoading(false));
      return;
    }
    const params: { postId?: string; workflowStatus?: WorkPlanWorkflowStatus } = postIdFilter ? { postId: postIdFilter } : {};
    if (tab === 'submitted') params.workflowStatus = 'submitted';
    if (tab === 'approved') params.workflowStatus = 'approved';
    workPlansService.getList(params).then((list) => {
      if (tab === 'draft') {
        setWorkPlans(list.filter((p) => ['draft', 'rejected', 'revision_requested'].includes(p.workflowStatus)));
      } else {
        setWorkPlans(list);
      }
    }).catch(() => setWorkPlans([])).finally(() => setLoading(false));
  }, [tab, postIdFilter]);

  useEffect(() => {
    refetch();
    workPlansService.markAllNotificationsAsRead().catch(console.error);
  }, [refetch]);

  useEffect(() => {
    if (showCreateModal || editingPlan) orgService.getMyPosts().then(setPosts).catch(() => setPosts([]));
  }, [showCreateModal, !!editingPlan]);

  useEffect(() => {
    if (currentUser?.id) {
      orgService.getMyPosts().then((l) => setMyPostIds(l.map((p) => p.id))).catch(() => setMyPostIds([]));
    } else setMyPostIds([]);
  }, [currentUser?.id]);

  useEffect(() => {
    if (viewIdFromUrl && !viewPlanId && !loading) setViewPlanId(viewIdFromUrl);
  }, [viewIdFromUrl, loading]);

  useEffect(() => {
    if (viewPlanId) workPlanHook.load(viewPlanId);
    else { workPlanHook.reset(); setBossComment(''); }
  }, [viewPlanId]);

  useEffect(() => {
    if (!showCreateModal || !formPostId) { setCreateAncestors([]); setCreateApproverId(''); return; }
    let c = false;
    orgService.getPostAncestors(formPostId).then((l) => {
      if (!c) { setCreateAncestors(l); if (l.length > 0) setCreateApproverId(l[0].id); }
    }).catch(() => { if (!c) setCreateAncestors([]); });
    return () => { c = true; };
  }, [showCreateModal, formPostId]);

  useEffect(() => {
    if (!formPostId || (!showCreateModal && !editingPlan)) { setApproverLabel(null); return; }
    if (showCreateModal) return;
    let c = false;
    orgService.getPost(formPostId).then((post) => {
      if (c) return;
      if (!post.parentPostId) { setApproverLabel('Нет вышестоящего руководителя'); return; }
      orgService.getPost(post.parentPostId!).then((par) => {
        if (!c && par) setApproverLabel(`${par.title} — ${par.currentHolder?.name ?? par.title}`);
      });
    }).catch(() => { if (!c) setApproverLabel(null); });
    return () => { c = true; };
  }, [formPostId, showCreateModal, !!editingPlan]);

  useEffect(() => {
    if (editingPlan) {
      setFormTitle(editingPlan.title);
      setFormPostId(editingPlan.postId);
      setFormMessageText((editingPlan as WorkPlanWithTasks & { messageText?: string | null }).messageText ?? '');
      setFormDepartment(editingPlan.department ?? '');
      setFormStatus(editingPlan.status);
      setFormDueDate(editingPlan.dueDate?.slice(0, 10) ?? '');
      setFormPeriod(editingPlan.period ?? '');
    } else if (showCreateModal) {
      setFormTitle(''); setFormPostId(postIdFilter ?? '');
      setFormMessageText(''); setFormDepartment('');
      setFormStatus('on-track'); setFormDueDate('');
      setFormPeriod('');
    }
  }, [editingPlan, showCreateModal, postIdFilter]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => workPlans.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.department ?? '').toLowerCase().includes(search.toLowerCase())
  ), [workPlans, search]);

  const openView = (plan: WorkPlanItem) => setViewPlanId(plan.id);
  const closeView = () => { setViewPlanId(null); workPlanHook.reset(); setBossComment(''); };

  const openEdit = async (plan: WorkPlanItem) => {
    closeView();
    const full = await workPlansService.getById(plan.id).catch(() => null);
    if (full) setEditingPlan(full);
  };

  const openSubmitModal = (plan: WorkPlanWithTasks) => {
    setSubmitPlan(plan); setSubmitAncestors([]); setSubmitApproverId('');
    if (!plan.postId) return;
    orgService.getPostAncestors(plan.postId).then((l) => {
      setSubmitAncestors(l);
      if (l.length > 0) setSubmitApproverId(l[0].id);
    }).catch(() => setSubmitAncestors([]));
  };

  const handleElevate = async (planId: string, approverPostId?: string) => {
    try {
      await workPlansService.submit(planId, approverPostId);
      setSubmitPlan(null); setSubmitAncestors([]); setSubmitApproverId('');
      if (viewPlanId === planId) await workPlanHook.load(planId);
      refetch();
    } catch (e) { console.error(e); }
  };

  const handleLift     = async () => { await workPlanHook.lift(bossComment.trim() || undefined); setBossComment(''); refetch(); };
  const handleRefract  = async () => { if (!bossComment.trim()) return; await workPlanHook.refract(bossComment.trim()); setBossComment(''); refetch(); };
  const handleRestruc  = async () => { if (!bossComment.trim()) return; await workPlanHook.restructure(bossComment.trim()); setBossComment(''); refetch(); };
  const handleDelete   = (id: string) => setDeletePlanId(id);

  const confirmDelete = async () => {
    if (!deletePlanId) return;
    try {
      await workPlansService.delete(deletePlanId);
      if (viewPlanId === deletePlanId) closeView();
      setEditingPlan(null); setDeletePlanId(null); refetch();
    } catch { alert('Не удалось удалить план работ'); }
  };

  // ─── Tab counts ───────────────────────────────────────────────────────────

  const TABS: { key: TabFilter; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'draft', label: 'Черновики' },
    { key: 'my_approval', label: 'На моё согласование' },
    { key: 'submitted', label: 'На согласовании' },
    { key: 'approved', label: 'Согласованы' },
  ];

  const counts: Record<TabFilter, number> = useMemo(() => ({
    all: workPlans.length,
    draft: workPlans.filter((p) => ['draft', 'rejected', 'revision_requested'].includes(p.workflowStatus)).length,
    my_approval: tab === 'my_approval' ? workPlans.length : 0,
    submitted: workPlans.filter((p) => p.workflowStatus === 'submitted').length,
    approved: workPlans.filter((p) => p.workflowStatus === 'approved').length,
  }), [workPlans, tab]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">

      {/* ── Page Header ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">Планы работ</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {postIdFilter ? 'Фильтр по должности' : 'Управление рабочими планами и согласованиями'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center border border-slate-200 rounded divide-x divide-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Создать план
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-slate-200 bg-white px-6">
        <div className="flex items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-0 -mb-px">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`
                  px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${tab === key
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
                `}
              >
                {label}
                {counts[key] > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full
                    ${tab === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative py-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию..."
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-50 placeholder:text-slate-400 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white w-52 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {viewMode === 'list' ? (
        <div className="bg-white border-b border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Название</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Отдел</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Статус</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Исполнение</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Срок</th>
                <th className="w-20 px-4 py-2.5">{' '}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                      Загрузка данных…
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border border-slate-200 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">Планов нет</p>
                        <p className="text-xs text-slate-400 mt-0.5">Создайте первый план работ</p>
                      </div>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Создать план →
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((plan) => (
                <tr
                  key={plan.id}
                  className="group hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => openView(plan)}
                >
                  <td className="px-6 py-3.5">
                    <div className="font-medium text-slate-900">{plan.title}</div>
                    {plan.period && <div className="text-xs text-slate-400 mt-0.5">{plan.period}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">{plan.department ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <StatusChip state={getMachineState(plan.workflowStatus)} compact />
                  </td>
                  <td className="px-4 py-3.5">
                    {getTrackBadge(plan.status)}
                  </td>
                  <td className="px-4 py-3.5">
                    {(plan.dueDate ?? plan.period) ? (
                      <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(plan.dueDate ?? plan.period)}
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                        onClick={() => openEdit(plan)}
                        title="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        onClick={() => handleDelete(plan.id)}
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length > 0 && (
            <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              Показано {filtered.length} из {workPlans.length} записей
            </div>
          )}
        </div>
      ) : (
        /* ── Kanban ── */
        <div className="p-6 grid grid-cols-3 gap-4">
          {(['DRAFT', 'ASCENDING', 'ACTIVE'] as const).map((state) => {
            const plans = filtered.filter((p) => getMachineState(p.workflowStatus) === state);
            return (
              <div key={state} className="flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-t">
                  <StatusChip state={state} />
                  <span className="text-xs font-semibold text-slate-500 tabular-nums">{plans.length}</span>
                </div>
                <div className="flex-1 border border-t-0 border-slate-200 rounded-b bg-slate-50 p-2 space-y-2 min-h-[200px]">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      onClick={() => openView(plan)}
                      className="bg-white border border-slate-200 rounded p-3 cursor-pointer hover:border-slate-400 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm text-slate-900 leading-snug">{plan.title}</div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5 transition-colors" />
                      </div>
                      {plan.department && <div className="text-xs text-slate-400 mt-1">{plan.department}</div>}
                      <div className="flex items-center justify-between mt-2">
                        {getTrackBadge(plan.status)}
                        {(plan.dueDate ?? plan.period) && (
                          <span className="text-xs text-slate-400">{formatDate(plan.dueDate ?? plan.period)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {plans.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-slate-400 border border-dashed border-slate-200 rounded">
                      Нет планов
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── View Modal ── */}
      <Modal isOpen={!!viewPlanId} onClose={closeView} title={workPlanHook.plan?.title ?? 'План работ'} size="lg">
        {workPlanHook.loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : workPlanHook.plan ? (
          <WorkPlanDetail
            plan={workPlanHook.plan}
            machineState={workPlanHook.machineState!}
            permissions={workPlanHook.permissions}
            actionLoading={workPlanHook.actionLoading}
            error={workPlanHook.error}
            bossComment={bossComment}
            setBossComment={setBossComment}
            onEdit={() => openEdit(workPlanHook.plan!)}
            onSubmitClick={() => openSubmitModal(workPlanHook.plan!)}
            onLift={handleLift}
            onRefract={handleRefract}
            onRestructure={handleRestruc}
            onDelete={() => { closeView(); handleDelete(workPlanHook.plan!.id); }}
          />
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center">Не удалось загрузить план</p>
        )}
      </Modal>

      {/* ── Submit Modal ── */}
      <Modal
        isOpen={!!submitPlan}
        onClose={() => { setSubmitPlan(null); setSubmitAncestors([]); setSubmitApproverId(''); }}
        title="Отправить на согласование"
        size="sm"
      >
        {submitPlan && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Выберите руководителя для направления плана на согласование.</p>
            {submitAncestors.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Получатель</label>
                <select
                  value={submitApproverId}
                  onChange={(e) => setSubmitApproverId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  {submitAncestors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Нет вышестоящих должностей.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setSubmitPlan(null); setSubmitAncestors([]); setSubmitApproverId(''); }}
                className="px-3.5 py-2 text-sm border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors">
                Отмена
              </button>
              <button
                disabled={submitAncestors.length === 0 || !submitApproverId}
                onClick={() => handleElevate(submitPlan.id, submitApproverId)}
                className="px-3.5 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />Отправить
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Create Modal ── */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Новый план работ" size="md">
        <div className="space-y-4">
          <Field label="Название *">
            <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              className={INPUT_CLS} placeholder="Введите название плана" autoFocus />
          </Field>
          <Field label="Должность *">
            <select value={formPostId} onChange={(e) => setFormPostId(e.target.value)} className={INPUT_CLS}>
              <option value="">— Выберите —</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="Текст сообщения / ссылка">
            <textarea value={formMessageText} onChange={(e) => setFormMessageText(e.target.value)}
              className={`${INPUT_CLS} min-h-[72px] resize-none`} placeholder="Опишите задачу или вставьте ссылку на документ" />
          </Field>
          <Field label="Кому направить *">
            {createAncestors.length > 0 ? (
              <select value={createApproverId} onChange={(e) => setCreateApproverId(e.target.value)} className={INPUT_CLS}>
                {createAncestors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-400 italic py-2">
                {formPostId ? 'Загрузка…' : 'Сначала выберите должность'}
              </p>
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setShowCreateModal(false)}
              className="px-3.5 py-2 text-sm border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors">
              Отмена
            </button>
            <button
              disabled={!formTitle.trim() || !formPostId || createAncestors.length === 0 || !createApproverId || formSubmitting}
              className="px-3.5 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              onClick={async () => {
                if (!formTitle.trim() || !formPostId || !createApproverId) return;
                setFormSubmitting(true);
                try {
                  const created = await workPlansService.create({ title: formTitle.trim(), postId: formPostId, messageText: formMessageText.trim() || null });
                  await workPlansService.submit(created.id, createApproverId);
                  setShowCreateModal(false); refetch();
                } finally { setFormSubmitting(false); }
              }}
            >
              {formSubmitting ? 'Отправка…' : <><Send className="w-3.5 h-3.5" />Отправить</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} title="Редактирование плана" size="lg">
        {editingPlan && (
          <WorkPlanForm
            title={formTitle} setTitle={setFormTitle}
            postId={formPostId} setPostId={setFormPostId}
            messageText={formMessageText} setMessageText={setFormMessageText}
            department={formDepartment} setDepartment={setFormDepartment}
            status={formStatus} setStatus={setFormStatus}
            dueDate={formDueDate} setDueDate={setFormDueDate}
            period={formPeriod} setPeriod={setFormPeriod}
            posts={posts} approverLabel={approverLabel} submitting={formSubmitting}
            onSave={async () => {
              if (!formTitle.trim() || !formPostId) return;
              setFormSubmitting(true);
              try {
                await workPlansService.update(editingPlan.id, { title: formTitle.trim(), postId: formPostId, department: formDepartment.trim() || null, status: formStatus, dueDate: formDueDate.trim() || null, period: formPeriod.trim() || null, messageText: formMessageText.trim() || null });
                setEditingPlan(await workPlansService.getById(editingPlan.id));
                refetch();
              } finally { setFormSubmitting(false); }
            }}
            onCancel={() => setEditingPlan(null)}
          />
        )}
      </Modal>

      {/* ── Delete Confirm ── */}
      <Modal isOpen={!!deletePlanId} onClose={() => setDeletePlanId(null)} title="Подтверждение удаления" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Вы уверены? Этот план работ будет удалён безвозвратно вместе со всеми задачами.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeletePlanId(null)}
              className="px-3.5 py-2 text-sm border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors">
              Отмена
            </button>
            <button onClick={confirmDelete}
              className="px-3.5 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />Удалить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── WorkPlanDetail ────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-slate-200 rounded text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function WorkPlanDetail({
  plan, machineState, permissions, actionLoading, error,
  bossComment, setBossComment,
  onEdit, onSubmitClick, onLift, onRefract, onRestructure, onDelete,
}: {
  plan: WorkPlanWithTasks;
  machineState: WorkPlanMachineState;
  permissions: ReturnType<typeof useWorkPlan>['permissions'];
  actionLoading: boolean;
  error: string | null;
  bossComment: string;
  setBossComment: (v: string) => void;
  onEdit: () => void;
  onSubmitClick: () => void;
  onLift: () => void;
  onRefract: () => void;
  onRestructure: () => void;
  onDelete: () => void;
}) {
  const commentTrim = bossComment.trim();
  const planEx = plan as WorkPlanWithTasks & { messageText?: string | null; approvalComment?: string | null };

  return (
    <div className="space-y-5">

      {/* Journey */}
      <JourneySteps state={machineState} />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Период',    value: plan.period },
          { label: 'Отдел',     value: plan.department },
          { label: 'Срок',      value: formatDate(plan.dueDate) },
          { label: 'Должность', value: plan.postId },
        ].map(({ label, value }) => (
          <div key={label} className="border border-slate-200 rounded p-3">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{label}</div>
            <div className="text-sm text-slate-900 font-medium">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Message / link */}
      {planEx.messageText && (
        <div className="border border-slate-200 rounded p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">
            <MessageSquare className="w-3.5 h-3.5" />Сообщение / ссылка
          </div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {renderTextWithLinks(planEx.messageText)}
          </p>
        </div>
      )}

      {/* Revision / rejection comment */}
      {plan.rejectionComment && (
        <div className={`flex items-start gap-2 p-3 rounded border text-sm
          ${machineState === 'REFRACTING'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-200 text-red-800'}
        `}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">
              {machineState === 'REFRACTING' ? 'Требует доработки:' : 'Причина отклонения:'}
            </strong>
            {' '}{plan.rejectionComment}
          </div>
        </div>
      )}

      {/* Approval comment */}
      {planEx.approvalComment && (
        <div className="flex items-start gap-2 p-3 border border-emerald-200 bg-emerald-50 rounded text-sm text-emerald-800">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div><strong className="font-semibold">Комментарий при согласовании:</strong> {planEx.approvalComment}</div>
        </div>
      )}

      {/* Tasks */}
      {plan.tasks && plan.tasks.length > 0 && (
        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Задачи ({plan.tasks.length})
          </div>
          <div className="divide-y divide-slate-100">
            {plan.tasks.map((t, i) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 tabular-nums w-5">{i + 1}.</span>
                  <span className="text-slate-800">{t.title}</span>
                </div>
                {t.dueDate && (
                  <span className="text-xs text-slate-400">{formatDate(t.dueDate)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        {permissions.canEdit && (
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />Редактировать
          </button>
        )}
        {permissions.canSubmit && (
          <button onClick={onSubmitClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 transition-colors">
            <Send className="w-3.5 h-3.5" />Отправить на согласование
          </button>
        )}
        {permissions.canDelete && (
          <button onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors ml-auto">
            <Trash2 className="w-3.5 h-3.5" />Удалить
          </button>
        )}
      </div>

      {/* Decision panel */}
      {permissions.canApprove && (
        <div className="border border-slate-200 rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Решение руководителя</p>
          </div>
          <div className="p-4 space-y-3">
            <textarea
              value={bossComment}
              onChange={(e) => setBossComment(e.target.value)}
              rows={3}
              className={`${INPUT_CLS} resize-none`}
              placeholder="Комментарий к решению (обязателен для «Доработать» и «Отклонить»)"
            />
            <div className="flex items-center gap-2">
              <button onClick={onLift} disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-40 transition-colors">
                <Check className="w-3.5 h-3.5" />Согласовать
              </button>
              <button onClick={onRefract} disabled={!commentTrim || actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-amber-300 bg-amber-50 text-amber-800 rounded hover:bg-amber-100 disabled:opacity-40 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />На доработку
              </button>
              <button onClick={onRestructure} disabled={!commentTrim || actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded disabled:opacity-40 transition-colors">
                <X className="w-3.5 h-3.5" />Отклонить
              </button>
            </div>
            {actionLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-3.5 h-3.5 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                Обработка…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WorkPlanForm ──────────────────────────────────────────────────────────

function WorkPlanForm({
  title, setTitle, postId, setPostId, messageText, setMessageText,
  department, setDepartment, status, setStatus, dueDate, setDueDate,
  period, setPeriod, posts, approverLabel,
  submitting, onSave, onCancel,
}: {
  title: string; setTitle: (v: string) => void;
  postId: string; setPostId: (v: string) => void;
  messageText: string; setMessageText: (v: string) => void;
  department: string; setDepartment: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  dueDate: string; setDueDate: (v: string) => void;
  period: string; setPeriod: (v: string) => void;
  posts: PostWithHolder[]; approverLabel: string | null;
  submitting: boolean; onSave: () => Promise<void>; onCancel: () => void;
}) {

  return (
    <div className="space-y-4">
      <Field label="Название *">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Должность *">
          <select value={postId} onChange={(e) => setPostId(e.target.value)} className={INPUT_CLS}>
            <option value="">— Выберите —</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {postId && approverLabel && (
            <p className="mt-1 text-xs text-slate-500">Уйдёт к: <span className="font-medium text-slate-700">{approverLabel}</span></p>
          )}
        </Field>
        <Field label="Период">
          <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Март 2025" className={INPUT_CLS} />
        </Field>
      </div>
      <Field label="Сообщение / ссылка">
        <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
          className={`${INPUT_CLS} min-h-[60px] resize-none`} placeholder="Ссылка на документ или описание" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Отдел">
          <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className={INPUT_CLS} />
        </Field>
        <Field label="Статус">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT_CLS}>
            <option value="on-track">В норме</option>
            <option value="at-risk">Под угрозой</option>
            <option value="overdue">Просрочен</option>
          </select>
        </Field>
        <Field label="Срок">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT_CLS} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onCancel}
          className="px-3.5 py-2 text-sm border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors">
          Отмена
        </button>
        <button
          disabled={!title.trim() || !postId || submitting}
          onClick={() => onSave()}
          className="px-3.5 py-2 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
