import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </RadixTooltip.Provider>
);

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'bottom' }) => (
  <RadixTooltip.Root>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        side={side}
        sideOffset={6}
        className="z-[80] rounded-[6px] bg-ink px-2 py-1 text-[11px] font-medium text-on-ink shadow-pop animate-in"
      >
        {content}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);
