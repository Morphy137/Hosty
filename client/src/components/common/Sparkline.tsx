import React from 'react';
import { cn } from '../../utils/cn';

interface SparklineProps {
  values: number[];
  /** Fixed upper bound (e.g. 100 for percentages); defaults to the series maximum. */
  max?: number;
  className?: string;
  strokeClassName?: string;
}

const WIDTH = 120;
const HEIGHT = 28;

/** Tiny dependency-free trend line used on the metric cards. */
export const Sparkline: React.FC<SparklineProps> = ({ values, max, className, strokeClassName = 'stroke-ink' }) => {
  if (values.length < 2) {
    return <div className={cn('h-7', className)} aria-hidden="true" />;
  }

  const upper = Math.max(max ?? Math.max(...values), 1);
  const step = WIDTH / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = HEIGHT - 2 - (Math.min(value, upper) / upper) * (HEIGHT - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full overflow-visible', className)}
      aria-hidden="true"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={strokeClassName}
      />
    </svg>
  );
};
