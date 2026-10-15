import React from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import { cn } from '../../utils/cn';

export type SliderVariant = 'default' | 'danger' | 'success' | 'warning';

const RANGE: Record<SliderVariant, string> = {
  default: 'bg-ink',
  danger: 'bg-danger',
  success: 'bg-accent',
  warning: 'bg-warning'
};

const THUMB: Record<SliderVariant, string> = {
  default: 'border-ink',
  danger: 'border-danger',
  success: 'border-accent',
  warning: 'border-warning'
};

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  variant?: SliderVariant;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Accessible slider (Radix) with Hosty styling; keyboard and touch support come for free. */
export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  variant = 'default',
  disabled = false,
  className,
  ariaLabel
}) => (
  <RadixSlider.Root
    value={[value]}
    onValueChange={([next]) => onChange(next)}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    className={cn('relative flex h-5 w-full touch-none select-none items-center', disabled && 'opacity-50', className)}
  >
    <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
      <RadixSlider.Range className={cn('absolute h-full rounded-full', RANGE[variant])} />
    </RadixSlider.Track>
    <RadixSlider.Thumb
      aria-label={ariaLabel}
      className={cn(
        'block h-4 w-4 rounded-full border-2 bg-surface shadow-card transition-transform',
        'hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer',
        THUMB[variant]
      )}
    />
  </RadixSlider.Root>
);
