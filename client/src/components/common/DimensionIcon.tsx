import React from 'react';
import grassBlockIcon from '../../assets/minecraft/Grass_Block.png';
import obsidianIcon from '../../assets/minecraft/Obsidian.png';
import endPortalFrameIcon from '../../assets/minecraft/End_Portal_Frame.png';
import bedrockIcon from '../../assets/minecraft/Bedrock.png';
import glowstoneIcon from '../../assets/minecraft/Glowstone.png';

interface DimensionIconProps {
  dimension: string;
  className?: string;
  size?: number;
}

/**
 * Renders the official Minecraft item/block icon for dimensions:
 * - Overworld: Grass Block
 * - Nether: Obsidian
 * - The End: End Portal Frame
 * - Fallback / Unknown / Modded: Bedrock
 * - The Aether: Glowstone
 */
export const DimensionIcon: React.FC<DimensionIconProps> = ({
  dimension,
  className = 'w-3.5 h-3.5',
  size
}) => {
  const norm = (dimension || '').toLowerCase().trim();

  let iconSrc = bedrockIcon;
  let label = 'Dimension';

  if (norm.includes('nether')) {
    iconSrc = obsidianIcon;
    label = 'The Nether';
  } else if (norm.includes('end')) {
    iconSrc = endPortalFrameIcon;
    label = 'The End';
  } else if (norm.includes('overworld') || norm === 'minecraft:overworld') {
    iconSrc = grassBlockIcon;
    label = 'Overworld';
  } else if (norm.includes('aether')) {
    iconSrc = glowstoneIcon;
    label = 'The Aether';
  } else {
    // Fallback for any unrecognized dimension
    iconSrc = bedrockIcon;
    label = dimension || 'Unknown Dimension';
  }

  return (
    <img
      src={iconSrc}
      alt={label}
      width={size || 16}
      height={size || 16}
      className={`shrink-0 object-contain select-none pointer-events-none inline-block align-middle ${className}`}
      style={size ? { width: size, height: size } : undefined}
    />
  );
};
