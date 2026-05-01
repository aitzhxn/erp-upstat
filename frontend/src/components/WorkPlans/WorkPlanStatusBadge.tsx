/**
 * WorkPlanStatusBadge — Anti-Gravity State Visualizer
 *
 * Renders the current machine state with animated, color-coded badges.
 * Each state has a distinct visual identity and motion semantic.
 */

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
  icon: React.ElementType;
  className: string;
  dotClass: string;
  animate?: 'pulse' | 'spin' | 'none';
}

const STATE_CONFIG: Record<WorkPlanMachineState, BadgeConfig> = {
  DRAFT: {
    label: 'Черновик',
    icon: FileEdit,
    className:
      'bg-zinc-800/60 text-zinc-300 border border-zinc-700/50 shadow-inner',
    dotClass: 'bg-zinc-400',
    animate: 'none',
  },
  ASCENDING: {
    label: 'На согласовании',
    icon: SendHorizonal,
    className:
      'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.15)]',
    dotClass: 'bg-sky-400',
    animate: 'pulse',
  },
  ACTIVE: {
    label: 'Одобрен',
    icon: CheckCircle2,
    className:
      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
    dotClass: 'bg-emerald-400',
    animate: 'none',
  },
  REFRACTING: {
    label: 'На доработку',
    icon: RefreshCw,
    className:
      'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
    dotClass: 'bg-amber-400',
    animate: 'spin',
  },
  RESTRUCTURED: {
    label: 'Отклонён',
    icon: XCircle,
    className:
      'bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
    dotClass: 'bg-rose-400',
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
        transition-all duration-300 ease-out
        ${s.badge} ${config.className}
      `}
    >
      {/* Animated state indicator dot */}
      <span
        className={`
          rounded-full flex-shrink-0
          ${s.dot} ${config.dotClass} ${animClass}
        `}
      />

      {/* State icon */}
      <Icon
        className={`
          flex-shrink-0 ${s.icon}
          ${config.animate === 'spin' ? 'animate-spin' : ''}
        `}
        style={config.animate === 'spin' ? { animationDuration: '2s' } : undefined}
      />

      {/* Label */}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

/** Inline mini badge — icon only, for tight spaces like table rows */
export function WorkPlanStatusDot({ state }: { state: WorkPlanMachineState }) {
  return <WorkPlanStatusBadge state={state} size="sm" showLabel={false} />;
}

/** Flow step indicator — shows the full journey */
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
                w-6 h-6 rounded-full flex items-center justify-center
                transition-all duration-500
                ${
                  isCompleted
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : isCurrent
                    ? isError
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                      : `${cfg.className} scale-110`
                    : 'bg-zinc-800/40 border border-zinc-700/30 text-zinc-600'
                }
              `}
            >
              {isCurrent && isError ? (
                <XCircle className="w-3 h-3" />
              ) : (
                <Icon className="w-3 h-3" />
              )}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`
                  h-px w-4 transition-all duration-700
                  ${isCompleted ? 'bg-emerald-500/50' : 'bg-zinc-700/40'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
