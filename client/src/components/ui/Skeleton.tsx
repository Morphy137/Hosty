import React from 'react';
import { cn } from '../../utils/cn';

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div aria-hidden="true" className={cn('animate-pulse rounded-[6px] bg-surface-3', className)} {...rest} />
);
