import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import type { MenuItem } from './DropdownMenu';

interface ContextMenuProps {
  /** Viewport position of the pointer that opened the menu. */
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

/** Lightweight right-click menu (no extra dependency), styled like DropdownMenu. */
export const ContextMenu: React.FC<ContextMenuProps> = ({ position, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState(position);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      x: Math.max(4, Math.min(position.x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(position.y, window.innerHeight - rect.height - 4))
    });
  }, [position]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: coords.x, top: coords.y }}
      // Presses inside the menu must not reach the window listener that closes it.
      onPointerDown={(event) => event.stopPropagation()}
      className="geist-card-elevated fixed z-[80] min-w-[200px] select-none p-1"
    >
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.separatorBefore && <div className="my-1 h-px bg-hairline" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2.5 text-left text-[13px] outline-none',
              'hover:bg-surface-3 focus-visible:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40',
              item.danger ? 'text-danger-fg' : 'text-ink'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
};
