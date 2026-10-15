import React, { useState } from 'react';

interface ItemSlotIconProps {
  id: string;
  fallbackText: string;
  className?: string;
}

/**
 * Renders direct Minecraft item or block pixel textures using mcasset CDN.
 * Automatically tries item texture, then block texture, and falls back to a clean text badge for mods.
 */
export const ItemSlotIcon: React.FC<ItemSlotIconProps> = ({ id, fallbackText, className = '' }) => {
  const [stage, setStage] = useState<'item' | 'block' | 'fallback'>('item');

  const rawName = id.replace(/^.*:/, '').toLowerCase();
  const isMinecraft = id.startsWith('minecraft:') || !id.includes(':');

  if (!isMinecraft || stage === 'fallback') {
    return (
      <span className={`font-mono text-[10px] font-bold text-ink leading-tight truncate max-w-[36px] ${className}`}>
        {fallbackText.slice(0, 3).toUpperCase()}
      </span>
    );
  }

  const src =
    stage === 'item'
      ? `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${rawName}.png`
      : `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/block/${rawName}.png`;

  return (
    <img
      src={src}
      alt={rawName}
      className={`w-7 h-7 object-contain image-rendering-pixelated pointer-events-none drop-shadow-xs ${className}`}
      loading="lazy"
      onError={() => {
        if (stage === 'item') {
          setStage('block');
        } else {
          setStage('fallback');
        }
      }}
    />
  );
};
