import React, { useState } from 'react';
import type { PlayerView } from '../../types/daemon';

interface ItemSlotIconProps {
  id: string;
  fallbackText: string;
  playerView?: PlayerView;
  className?: string;
}

/** Item image from the game's declared URL templates (tried in order), else the item's initials. */
export const ItemSlotIcon: React.FC<ItemSlotIconProps> = ({ id, fallbackText, playerView, className = '' }) => {
  const [attempt, setAttempt] = useState(0);
  const namespace = id.includes(':') ? id.slice(0, id.indexOf(':')).toLowerCase() : '';
  const item = id.replace(/^.*:/, '').toLowerCase();
  const templates = playerView?.itemIconUrls ?? [];
  const namespaceKnown = !namespace || (playerView?.itemNamespaces ?? []).includes(namespace);
  const template = namespaceKnown ? templates[attempt] : undefined;

  if (!template) {
    return (
      <span className={`max-w-[36px] truncate font-mono text-[10px] font-bold leading-tight text-ink ${className}`}>
        {fallbackText.slice(0, 3).toUpperCase()}
      </span>
    );
  }

  const src = template
    .replace(/\{\{\s*item\s*\}\}/g, encodeURIComponent(item))
    .replace(/\{\{\s*namespace\s*\}\}/g, encodeURIComponent(namespace));
  return (
    <img
      src={src}
      alt={item}
      className={`pointer-events-none h-7 w-7 object-contain drop-shadow-xs [image-rendering:pixelated] ${className}`}
      loading="lazy"
      onError={() => setAttempt((current) => current + 1)}
    />
  );
};
