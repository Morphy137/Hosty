import React from 'react';

export type SliderVariant = 'default' | 'danger' | 'success' | 'warning';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  variant?: SliderVariant;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

const VARIANT_STYLES: Record<SliderVariant, { fill: string; thumbBorder: string }> = {
  default: {
    fill: 'bg-[#171717] dark:bg-[#ededed]',
    thumbBorder: 'border-[#171717] dark:border-[#ededed]'
  },
  danger: {
    fill: 'bg-[#ee0000] dark:bg-[#ff4d4d]',
    thumbBorder: 'border-[#ee0000] dark:border-[#ff4d4d]'
  },
  success: {
    fill: 'bg-[#0070f3] dark:bg-[#50e3c2]',
    thumbBorder: 'border-[#0070f3] dark:border-[#50e3c2]'
  },
  warning: {
    fill: 'bg-[#f5a623]',
    thumbBorder: 'border-[#f5a623]'
  }
};

/**
 * Shadcn / Vercel Geist-styled Slider component.
 * Combines an accessible native range input overlay with a custom rendered track,
 * filled progress bar, and floating circular thumb.
 */
export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  variant = 'default',
  disabled = false,
  className = '',
  ariaLabel
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const styles = VARIANT_STYLES[variant];

  return (
    <div className={`relative flex w-full items-center select-none py-2 group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      {/* Background Track */}
      <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#f0f0f0] dark:bg-[#262626]">
        {/* Filled Progress Bar */}
        <div
          className={`h-full rounded-full transition-all duration-75 ${styles.fill}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Thumb */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white dark:bg-[#111111] border-2 shadow-xs transition-transform group-hover:scale-115 group-active:scale-95 pointer-events-none ${styles.thumbBorder}`}
        style={{ left: `${percentage}%` }}
      />

      {/* Accessible Interactive Range Input */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
      />
    </div>
  );
};
