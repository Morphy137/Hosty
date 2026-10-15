import React from 'react';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../utils/cn';

export interface MenuItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactElement;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, items, align = 'end' }) => (
  <RadixMenu.Root>
    <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={6}
        className="geist-card-elevated z-[70] min-w-[180px] p-1 animate-in"
      >
        {items.map((item) => (
          <React.Fragment key={item.id}>
            {item.separatorBefore && <RadixMenu.Separator className="my-1 h-px bg-hairline" />}
            <RadixMenu.Item
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-8 cursor-pointer select-none items-center gap-2 rounded-[4px] px-2.5 text-[13px] outline-none',
                'data-[highlighted]:bg-surface-3 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
                item.danger ? 'text-danger-fg' : 'text-ink'
              )}
            >
              {item.icon}
              {item.label}
            </RadixMenu.Item>
          </React.Fragment>
        ))}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  </RadixMenu.Root>
);
