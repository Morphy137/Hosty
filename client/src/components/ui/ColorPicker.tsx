import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { formatColor, parseColor } from '../../settings/color';
import { inputClasses } from './Input';

interface ColorPickerProps {
  /** `#rrggbb`; empty shows the placeholder swatch. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** Native colour well plus a hex field; only valid `#rrggbb` values are reported. */
export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, ariaLabel, className }) => {
  // Text being typed; `null` shows the current value.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (next: string) => {
    const parsed = parseColor(next);
    if (parsed) onChange(formatColor(parsed));
    setDraft(null);
  };

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <label
        className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-[6px] border border-hairline-strong"
        style={{ background: value || 'transparent' }}
      >
        <input
          type="color"
          aria-label={ariaLabel}
          value={value || formatColor([128, 128, 128])}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <input
        type="text"
        aria-label={ariaLabel}
        value={draft ?? value}
        spellCheck={false}
        maxLength={7}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
        className={cn(inputClasses, 'h-8 w-24 font-mono text-[12px] uppercase')}
      />
    </div>
  );
};
