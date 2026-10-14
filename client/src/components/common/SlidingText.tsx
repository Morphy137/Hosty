import React, { useRef, useState, useEffect } from 'react';

interface SlidingTextProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Ensures text stays strictly on 1 line. When the content overflows its container,
 * it smoothly slides horizontally on hover to reveal the full text.
 */
export const SlidingText: React.FC<SlidingTextProps> = ({ children, className = '' }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const checkOverflow = () => {
    if (containerRef.current && textRef.current) {
      const diff = textRef.current.scrollWidth - containerRef.current.clientWidth;
      setOverflowDistance(diff > 1 ? diff : 0);
    }
  };

  useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [children]);

  return (
    <span
      ref={containerRef}
      onMouseEnter={() => {
        checkOverflow();
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative inline-flex items-center overflow-hidden whitespace-nowrap max-w-full leading-none ${className}`}
    >
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap will-change-transform leading-none"
        style={{
          transform: isHovered && overflowDistance > 0 ? `translateX(-${overflowDistance + 4}px)` : 'translateX(0)',
          transition:
            isHovered && overflowDistance > 0
              ? `transform ${Math.max(1.2, overflowDistance * 0.035)}s cubic-bezier(0.25, 1, 0.5, 1)`
              : 'transform 0.3s ease-out'
        }}
      >
        {children}
      </span>
    </span>
  );
};
