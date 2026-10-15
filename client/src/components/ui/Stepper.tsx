import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface StepItem {
  id: string;
  label: React.ReactNode;
}

interface StepperProps {
  steps: StepItem[];
  current: number;
  /** Called when a completed step is clicked. */
  onSelect?: (index: number) => void;
  disabled?: boolean;
}

export const Stepper: React.FC<StepperProps> = ({ steps, current, onSelect, disabled }) => (
  <ol className="flex items-center gap-2">
    {steps.map((step, index) => {
      const isPast = index < current;
      const isCurrent = index === current;
      return (
        <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            disabled={disabled || !isPast}
            onClick={() => onSelect?.(index)}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] transition-colors',
              isPast && !disabled ? 'cursor-pointer text-ink hover:bg-surface-3' : 'cursor-default',
              isCurrent ? 'font-medium text-accent-fg' : !isPast && 'text-mute'
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono',
                isPast && 'border-accent bg-accent text-white',
                isCurrent && 'border-accent text-accent-fg',
                !isPast && !isCurrent && 'border-hairline-strong text-mute'
              )}
            >
              {isPast ? <Check className="h-3 w-3 stroke-[3]" /> : index + 1}
            </span>
            <span className="truncate">{step.label}</span>
          </button>
          {index < steps.length - 1 && <span className="h-px flex-1 bg-hairline" aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);
