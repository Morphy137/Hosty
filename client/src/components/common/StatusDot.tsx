import React from 'react';
import type { ServerStatus } from '../../types/daemon';
import { cn } from '../../utils/cn';

const COLORS: Record<ServerStatus, string> = {
  OFFLINE: 'bg-hairline-strong',
  STARTING: 'bg-warning',
  ONLINE: 'bg-success',
  STOPPING: 'bg-warning'
};

/** Status indicator; pulses while the server is transitioning. */
export const StatusDot: React.FC<{ status: ServerStatus; className?: string }> = ({ status, className }) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-block h-2 w-2 shrink-0 rounded-full',
      COLORS[status],
      (status === 'STARTING' || status === 'STOPPING') && 'animate-pulse',
      className
    )}
  />
);
