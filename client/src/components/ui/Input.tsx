import React from 'react';
import { cn } from '../../utils/cn';

export const inputClasses =
  'h-9 w-full rounded-[6px] bg-surface border border-hairline px-3 text-[13px] text-ink placeholder:text-mute ' +
  'transition-colors duration-[var(--duration-fast)] hover:border-hairline-strong focus:outline-none focus:border-ink ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClasses, className)} {...rest} />;
});

interface NumberInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}

/** Numeric field that never reports NaN and clamps to [min, max] when it loses focus. */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, min, max, className, onBlur, ...rest },
  ref
) {
  const clamp = (next: number) => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  };

  return (
    <Input
      ref={ref}
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      className={cn('font-mono', className)}
      onChange={(event) => {
        const parsed = event.target.valueAsNumber;
        if (!Number.isNaN(parsed)) onValueChange(parsed);
      }}
      onBlur={(event) => {
        onValueChange(clamp(Number.isFinite(value) ? value : (min ?? 0)));
        onBlur?.(event);
      }}
      {...rest}
    />
  );
});
