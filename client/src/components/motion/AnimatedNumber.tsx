import React, { useEffect, useRef } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  fractionDigits?: number;
  suffix?: string;
  className?: string;
}

/** Counts towards the new value instead of jumping; renders instantly with reduced motion. */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, fractionDigits = 0, suffix = '', className }) => {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const render = (latest: number) => {
      if (nodeRef.current) nodeRef.current.textContent = `${latest.toFixed(fractionDigits)}${suffix}`;
    };
    if (reduceMotion) {
      motionValue.set(value);
      render(value);
      return;
    }
    const unsubscribe = motionValue.on('change', render);
    const controls = animate(motionValue, value, { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] });
    return () => {
      unsubscribe();
      controls.stop();
    };
  }, [value, fractionDigits, suffix, reduceMotion, motionValue]);

  return (
    <span ref={nodeRef} className={className}>
      {value.toFixed(fractionDigits)}
      {suffix}
    </span>
  );
};
