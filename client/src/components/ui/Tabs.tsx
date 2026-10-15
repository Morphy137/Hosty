import React, { useId } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
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

/** Tab strip only; the active panel is rendered by the caller. The underline slides between tabs. */
export function Tabs<T extends string>({ value, onValueChange, items, className }: TabsProps<T>) {
  const indicatorId = useId();

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
              'data-[state=active]:font-medium data-[state=active]:text-ink'
            )}
          >
            {item.icon}
            {item.label}
            {item.id === value && (
              <motion.span
                layoutId={`tabs-indicator-${indicatorId}`}
                className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
