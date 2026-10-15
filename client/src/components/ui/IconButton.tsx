import React from 'react';
import { cn } from '../../utils/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Accessible name; also shown as a tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const SQUARE: Record<ButtonSize, string> = {
  sm: 'h-7 w-7 px-0',
  md: 'h-8 w-8 px-0',
  lg: 'h-10 w-10 px-0'
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest },
  ref
) {
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(buttonClasses(variant, size), SQUARE[size], className)}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});
