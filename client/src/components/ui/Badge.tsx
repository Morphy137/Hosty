import React from 'react';
import { cn } from '../../utils/cn';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-3 text-body border-hairline',
  accent: 'bg-info-soft text-accent-fg border-transparent',
  success: 'bg-success-soft text-success-fg border-transparent',
  warning: 'bg-warning-soft text-warning-fg border-transparent',
  danger: 'bg-danger-soft text-danger-fg border-transparent'
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', className, ...rest }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
      VARIANTS[variant],
      className
    )}
    {...rest}
  />
);
