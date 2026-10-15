import React from 'react';
import { Globe2 } from 'lucide-react';
import type { ResolvedDimension } from '../../utils/dimensions';
import { cn } from '../../utils/cn';

interface DimensionIconProps {
  dimension: ResolvedDimension;
  className?: string;
}

/** The icon a game pack declares for a dimension, or a neutral globe. */
export const DimensionIcon: React.FC<DimensionIconProps> = ({ dimension, className = 'h-3.5 w-3.5' }) =>
  dimension.iconUrl ? (
    <img
      src={dimension.iconUrl}
      alt=""
      className={cn(
        'pointer-events-none inline-block shrink-0 select-none object-contain align-middle [image-rendering:pixelated]',
        className
      )}
    />
  ) : (
    <Globe2 className={cn('shrink-0 text-mute', className)} />
  );
