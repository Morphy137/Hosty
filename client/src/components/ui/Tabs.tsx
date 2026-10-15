import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
}

/** Tab strip only; the active panel is rendered by the caller. */
export function Tabs<T extends string>({ value, onValueChange, items, className }: TabsProps<T>) {
  return (
    <RadixTabs.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <RadixTabs.List className={cn('flex items-center gap-1 overflow-x-auto overflow-y-hidden', className)}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.id}
            value={item.id}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-[13px] tracking-[-0.28px] cursor-pointer',
              'text-mute transition-colors duration-[var(--duration-fast)] hover:text-ink',
              'data-[state=active]:font-medium data-[state=active]:text-ink',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink',
              'after:scale-x-0 after:transition-transform after:duration-[var(--duration-base)] after:ease-[var(--ease-soft)]',
              'data-[state=active]:after:scale-x-100'
            )}
          >
            {item.icon}
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
