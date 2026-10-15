import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-hairline hover:bg-surface-3 hover:border-hairline-strong',
  ghost: 'bg-transparent text-body border border-transparent hover:bg-surface-3 hover:text-ink',
  danger: 'bg-danger text-white border border-transparent hover:opacity-90'
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-8 px-3.5 text-[13px] gap-2',
  lg: 'h-10 px-5 text-[14px] gap-2'
};

export const buttonClasses = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string =>
  cn(
    'inline-flex items-center justify-center rounded-[6px] font-medium tracking-[-0.28px] select-none',
    'transition-[background-color,border-color,color,transform,opacity] duration-[var(--duration-fast)] ease-[var(--ease-soft)]',
    'active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0',
    VARIANTS[variant],
    SIZES[size]
  );
