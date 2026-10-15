import React from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** A change is in flight: clicks are ignored but the switch keeps focus and its look (no flash). */
  busy?: boolean;
  ariaLabel?: string;
  title?: string;
}

/** On/off toggle (role="switch") built on the design tokens. */
export const Switch: React.FC<SwitchProps> = ({ checked, onCheckedChange, disabled, busy, ariaLabel, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    title={title}
    disabled={disabled}
    aria-busy={busy || undefined}
    onClick={() => {
      if (!busy) onCheckedChange(!checked);
    }}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
      'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:border-ink',
      checked ? 'border-ink bg-ink' : 'border-hairline-strong bg-surface-3'
    )}
  >
    <span
      className={cn(
        'inline-block h-3.5 w-3.5 rounded-full shadow-sm transition-transform',
        checked ? 'translate-x-[18px] bg-on-ink' : 'translate-x-[2px] bg-surface'
      )}
    />
  </button>
);
