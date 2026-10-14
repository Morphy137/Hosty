import React from 'react';

interface DimensionIconProps {
  dimension: string;
  className?: string;
}

export const DimensionIcon: React.FC<DimensionIconProps> = ({ dimension, className = 'w-3.5 h-3.5' }) => {
  const norm = dimension.toLowerCase();

  if (norm.includes('nether')) {
    // Nether Portal icon: Obsidian frame with mystical violet portal center
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The Nether"
      >
        {/* Obsidian Frame */}
        <rect width="16" height="16" rx="2" fill="#120c1d" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#25163b" />
        <rect x="2" y="2" width="12" height="12" fill="#1c0f2f" />
        {/* Obsidian Texture flecks */}
        <rect x="2" y="2" width="2" height="2" fill="#3b235d" />
        <rect x="12" y="12" width="2" height="2" fill="#3b235d" />
        <rect x="12" y="2" width="2" height="2" fill="#3b235d" />
        <rect x="2" y="12" width="2" height="2" fill="#3b235d" />
        {/* Swirling Portal Interior */}
        <rect x="4" y="3" width="8" height="10" fill="#7e22ce" />
        <rect x="5" y="4" width="6" height="8" fill="#a855f7" />
        <rect x="6" y="5" width="4" height="4" fill="#c084fc" />
        <rect x="7" y="6" width="2" height="3" fill="#f3e8ff" />
        <rect x="5" y="9" width="3" height="2" fill="#9333ea" />
      </svg>
    );
  }

  if (norm.includes('end')) {
    // The End: End Portal / Eye of Ender with End Stone frame & Teal Void Eye
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The End"
      >
        {/* End Stone Frame */}
        <rect width="16" height="16" rx="2" fill="#7a7e4b" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#cbd18f" />
        <rect x="2" y="2" width="12" height="12" fill="#e2e6ab" />
        <rect x="3" y="3" width="2" height="2" fill="#b1b86c" />
        <rect x="11" y="11" width="2" height="2" fill="#b1b86c" />
        {/* Ender Eye / Void Portal Core */}
        <rect x="4" y="4" width="8" height="8" fill="#042f2e" />
        <rect x="5" y="5" width="6" height="6" fill="#0f766e" />
        <rect x="6" y="6" width="4" height="4" fill="#14b8a6" />
        <rect x="7" y="7" width="2" height="2" fill="#5eead4" />
        <rect x="7" y="8" width="2" height="1" fill="#042f2e" />
      </svg>
    );
  }

  // Default: Overworld Grass Block
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 inline-block align-middle`}
      shapeRendering="crispEdges"
      aria-label="Overworld"
    >
      {/* Dirt Base */}
      <rect width="16" height="16" rx="2" fill="#4a3319" />
      <rect x="1" y="1" width="14" height="14" rx="1" fill="#6b4a24" />
      <rect x="2" y="2" width="12" height="12" fill="#865d30" />
      {/* Dirt flecks */}
      <rect x="3" y="10" width="2" height="2" fill="#543818" />
      <rect x="11" y="11" width="2" height="2" fill="#543818" />
      <rect x="7" y="12" width="3" height="2" fill="#a4723c" />
      {/* Grass Top Layer with pixel drips */}
      <rect x="1" y="1" width="14" height="5" fill="#4d7c0f" />
      <rect x="2" y="2" width="12" height="4" fill="#65a30d" />
      <rect x="2" y="2" width="12" height="2" fill="#84cc16" />
      {/* Pixel grass drips hanging down */}
      <rect x="3" y="6" width="2" height="2" fill="#4d7c0f" />
      <rect x="7" y="6" width="2" height="3" fill="#4d7c0f" />
      <rect x="11" y="6" width="2" height="2" fill="#4d7c0f" />
    </svg>
  );
};
