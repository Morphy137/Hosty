import React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Themed select (Radix) — replaces the native select element, which ignores the dark theme on Windows. */
export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel
}) => (
  <RadixSelect.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
    <RadixSelect.Trigger
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-9 w-full items-center justify-between gap-2 rounded-[6px] border border-hairline bg-surface px-3',
        'text-[13px] text-ink transition-colors hover:border-hairline-strong focus:outline-none focus:border-ink',
        'disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-mute cursor-pointer',
        className
      )}
    >
      <span className="truncate">
        <RadixSelect.Value placeholder={placeholder} />
      </span>
      <RadixSelect.Icon>
        <ChevronDown className="h-3.5 w-3.5 text-mute" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
    <RadixSelect.Portal>
      <RadixSelect.Content
        position="popper"
        sideOffset={4}
        className="geist-card-elevated z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden animate-in"
      >
        <RadixSelect.Viewport className="p-1">
          {options.map((option) => (
            <RadixSelect.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="relative flex h-8 cursor-pointer select-none items-center rounded-[4px] pl-7 pr-3 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-3 data-[disabled]:opacity-40"
            >
              <RadixSelect.ItemIndicator className="absolute left-2">
                <Check className="h-3.5 w-3.5 text-accent-fg" />
              </RadixSelect.ItemIndicator>
              <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
            </RadixSelect.Item>
          ))}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  </RadixSelect.Root>
);
