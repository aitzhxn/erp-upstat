/**
 * WorkPlanStatusBadge — статусы в единой бело-синей палитре приложения.
 */

import type { ElementType } from 'react';
import { type WorkPlanMachineState } from './useWorkPlan';
import {
  FileEdit,
  SendHorizonal,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface BadgeConfig {
  label: string;
  icon: ElementType;
  className: string;
  dotClass: string;
  animate?: 'pulse' | 'spin' | 'none';
}

const STATE_CONFIG: Record<WorkPlanMachineState, BadgeConfig> = {
  DRAFT: {
    label: 'Черновик',
    icon: FileEdit,
    className: 'border border-border bg-background text-textSecondary',
    dotClass: 'bg-textSecondary/40',
    animate: 'none',
  },
  ASCENDING: {
    label: 'На согласовании',
    icon: SendHorizonal,
    className: 'border border-primary/25 bg-primarySoft text-primary shadow-sm',
    dotClass: 'bg-primary',
    animate: 'pulse',
  },
  ACTIVE: {
    label: 'Одобрен',
    icon: CheckCircle2,
    className: 'border border-primary/30 bg-primary/10 text-primary shadow-sm',
    dotClass: 'bg-primary',
    animate: 'none',
  },
  REFRACTING: {
    label: 'На доработку',
    icon: RefreshCw,
    className: 'border border-primary/25 bg-primarySoft text-primary',
    dotClass: 'bg-primary/70',
    animate: 'spin',
  },
  RESTRUCTURED: {
    label: 'Отклонён',
    icon: XCircle,
    className: 'border border-primary/35 bg-primary/10 text-primary',
    dotClass: 'bg-primaryHover',
    animate: 'none',
  },
};

interface WorkPlanStatusBadgeProps {
  state: WorkPlanMachineState;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function WorkPlanStatusBadge({
  state,
  size = 'md',
  showLabel = true,
}: WorkPlanStatusBadgeProps) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  const sizeMap = {
    sm: { badge: 'px-2 py-0.5 text-xs gap-1', icon: 'w-3 h-3', dot: 'w-1.5 h-1.5' },
    md: { badge: 'px-2.5 py-1 text-xs gap-1.5', icon: 'w-3.5 h-3.5', dot: 'w-2 h-2' },
    lg: { badge: 'px-3 py-1.5 text-sm gap-2', icon: 'w-4 h-4', dot: 'w-2 h-2' },
  };

  const s = sizeMap[size];

  const animClass =
    config.animate === 'pulse'
      ? 'animate-pulse'
      : config.animate === 'spin'
        ? 'animate-spin'
        : '';

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium
        transition-colors duration-200
        ${s.badge} ${config.className}
      `}
    >
      <span
        className={`
          flex-shrink-0 rounded-full
          ${s.dot} ${config.dotClass} ${animClass}
        `}
      />

      <Icon
        className={`
          flex-shrink-0 ${s.icon}
          ${config.animate === 'spin' ? 'animate-spin' : ''}
        `}
        style={config.animate === 'spin' ? { animationDuration: '2s' } : undefined}
      />

      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export function WorkPlanStatusDot({ state }: { state: WorkPlanMachineState }) {
  return <WorkPlanStatusBadge state={state} size="sm" showLabel={false} />;
}

export function WorkPlanJourneyBar({ state }: { state: WorkPlanMachineState }) {
  const steps: WorkPlanMachineState[] = ['DRAFT', 'ASCENDING', 'ACTIVE'];
  const isError = state === 'REFRACTING' || state === 'RESTRUCTURED';

  const stepIndex: Record<WorkPlanMachineState, number> = {
    DRAFT: 0,
    ASCENDING: 1,
    ACTIVE: 2,
    REFRACTING: 1,
    RESTRUCTURED: 1,
  };

  const current = isError ? 1 : stepIndex[state];

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const isCurrent = idx === current;
        const isCompleted = idx < current && !isError;
        const cfg = STATE_CONFIG[step];
        const Icon = cfg.icon;

        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`
                flex h-6 w-6 items-center justify-center rounded-full border transition-colors
                ${
                  isCompleted
                    ? 'border-primary/35 bg-primary/15 text-primary'
                    : isCurrent
                      ? isError
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : `${cfg.className} scale-105`
                      : 'border-border bg-background text-textSecondary/50'
                }
              `}
            >
              {isCurrent && isError ? (
                <XCircle className="h-3 w-3" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`
                  h-px w-4 transition-colors
                  ${isCompleted ? 'bg-primary/50' : 'bg-border'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
