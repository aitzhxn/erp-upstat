/**
 * useWorkPlan — Anti-Gravity State Machine Hook
 *
 * Models work plan flow as explicit state transitions.
 * State flows: DRAFT → ASCENDING → ACTIVE
 *                         ↓           (or)
 *                      REFRACTING ← ASCENDING
 *                         ↓
 *                       DRAFT (re-submit loop)
 */

import { useState, useCallback, useMemo } from 'react';
import {
  workPlansService,
  type WorkPlanWithTasks,
  type WorkPlanWorkflowStatus,
} from '@/services/workPlansService';

// ─── State Machine Types ───────────────────────────────────────────────────

export type WorkPlanMachineState =
  | 'DRAFT'        // Worker owns it, not yet sent
  | 'ASCENDING'    // Emitted upward — awaiting Lead decision
  | 'ACTIVE'       // LIFTED — approved, fully active
  | 'REFRACTING'   // Sent back with diff — worker must revise
  | 'RESTRUCTURED'; // Rejected — plan must be rebuilt

export const WORKFLOW_TO_MACHINE: Record<WorkPlanWorkflowStatus, WorkPlanMachineState> = {
  draft:              'DRAFT',
  submitted:          'ASCENDING',
  approved:           'ACTIVE',
  revision_requested: 'REFRACTING',
  rejected:           'RESTRUCTURED',
};

export const MACHINE_TO_WORKFLOW: Record<WorkPlanMachineState, WorkPlanWorkflowStatus> = {
  DRAFT:        'draft',
  ASCENDING:    'submitted',
  ACTIVE:       'approved',
  REFRACTING:   'revision_requested',
  RESTRUCTURED: 'rejected',
};

// ─── Permission Matrix ─────────────────────────────────────────────────────

export interface WorkPlanActorContext {
  currentUserId: string | null;
  myPostIds: string[];
  userRole: string | null;
}

function derivePermissions(plan: WorkPlanWithTasks | null, actor: WorkPlanActorContext) {
  if (!plan) {
    return { canEdit: false, canSubmit: false, canDelete: false, canApprove: false, canReject: false, canRevise: false, isAuthor: false, isApprover: false };
  }

  const isAuthor =
    (actor.currentUserId != null && plan.authorUserId === actor.currentUserId) ||
    actor.myPostIds.includes(plan.postId);

  const isApprover =
    plan.approverPostId != null &&
    actor.myPostIds.includes(plan.approverPostId);

  const isAdmin = actor.userRole === 'Admin';
  const isAdminOrHead =
    actor.userRole === 'Admin' ||
    actor.userRole === 'Department Head' ||
    actor.userRole === 'Section Head';

  const state = WORKFLOW_TO_MACHINE[plan.workflowStatus as WorkPlanWorkflowStatus] ?? 'DRAFT';
  const isEditable = state === 'DRAFT' || state === 'REFRACTING' || state === 'RESTRUCTURED';
  const isAwaitingDecision = state === 'ASCENDING';

  return {
    isAuthor,
    isApprover,
    canEdit:    isEditable && (isAuthor || isAdminOrHead),
    canSubmit:  isEditable && isAuthor,
    canDelete:  isAuthor || isAdminOrHead,
    canApprove: isAwaitingDecision && (isApprover || (isAdmin && !isAuthor)),
    canReject:  isAwaitingDecision && (isApprover || (isAdmin && !isAuthor)),
    canRevise:  isAwaitingDecision && (isApprover || (isAdmin && !isAuthor)),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export interface UseWorkPlanReturn {
  plan: WorkPlanWithTasks | null;
  machineState: WorkPlanMachineState | null;
  permissions: ReturnType<typeof derivePermissions>;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;

  // Actions — the Decision Matrix
  load: (id: string) => Promise<void>;
  /** LIFT: approve the plan */
  lift: (comment?: string) => Promise<void>;
  /** REFRACT: send back for revision with mandatory comment */
  refract: (comment: string) => Promise<void>;
  /** RESTRUCTURE: reject the plan with mandatory comment */
  restructure: (comment: string) => Promise<void>;
  /** Elevate: submit plan upward to Lead */
  elevate: (approverPostId?: string) => Promise<void>;
  /** Delete the plan entirely */
  destroy: () => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

export function useWorkPlan(actor: WorkPlanActorContext): UseWorkPlanReturn {
  const [plan, setPlan] = useState<WorkPlanWithTasks | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const machineState = useMemo(
    () => (plan ? (WORKFLOW_TO_MACHINE[plan.workflowStatus as WorkPlanWorkflowStatus] ?? 'DRAFT') : null),
    [plan]
  );

  const permissions = useMemo(() => derivePermissions(plan, actor), [plan, actor]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await workPlansService.getById(id);
      setPlan(data);
    } catch {
      setError('Не удалось загрузить план работ');
    } finally {
      setLoading(false);
    }
  }, []);

  const withAction = useCallback(
    async (fn: () => Promise<WorkPlanWithTasks | undefined | void>) => {
      setActionLoading(true);
      setError(null);
      try {
        const result = await fn();
        if (result && typeof result === 'object' && 'id' in result) {
          // Reload fresh copy with tasks
          const fresh = await workPlansService.getById((result as WorkPlanWithTasks).id);
          setPlan(fresh);
        }
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Произошла ошибка';
        setError(msg);
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  /** LIFT — approve */
  const lift = useCallback(
    (comment?: string) => {
      if (!plan) return Promise.resolve();
      return withAction(async () => {
        const updated = await workPlansService.approve(plan.id, comment);
        return updated as WorkPlanWithTasks;
      });
    },
    [plan, withAction]
  );

  /** REFRACT — send back for revision */
  const refract = useCallback(
    (comment: string) => {
      if (!plan) return Promise.resolve();
      return withAction(async () => {
        const updated = await workPlansService.requestRevision(plan.id, comment);
        return updated as WorkPlanWithTasks;
      });
    },
    [plan, withAction]
  );

  /** RESTRUCTURE — reject */
  const restructure = useCallback(
    (comment: string) => {
      if (!plan) return Promise.resolve();
      return withAction(async () => {
        const updated = await workPlansService.reject(plan.id, comment);
        return updated as WorkPlanWithTasks;
      });
    },
    [plan, withAction]
  );

  /** ELEVATE — submit upward */
  const elevate = useCallback(
    (approverPostId?: string) => {
      if (!plan) return Promise.resolve();
      return withAction(async () => {
        const updated = await workPlansService.submit(plan.id, approverPostId);
        return updated as WorkPlanWithTasks;
      });
    },
    [plan, withAction]
  );

  /** DESTROY — delete plan */
  const destroy = useCallback(() => {
    if (!plan) return Promise.resolve();
    return withAction(async () => {
      await workPlansService.delete(plan.id);
      setPlan(null);
    });
  }, [plan, withAction]);

  const clearError = useCallback(() => setError(null), []);
  const reset = useCallback(() => {
    setPlan(null);
    setError(null);
    setLoading(false);
    setActionLoading(false);
  }, []);

  return {
    plan,
    machineState,
    permissions,
    loading,
    actionLoading,
    error,
    load,
    lift,
    refract,
    restructure,
    elevate,
    destroy,
    clearError,
    reset,
  };
}
