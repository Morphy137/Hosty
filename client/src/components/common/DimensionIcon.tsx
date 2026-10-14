import React from 'react';

interface DimensionIconProps {
  dimension: string;
  className?: string;
}

export const DimensionIcon: React.FC<DimensionIconProps> = ({ dimension, className = 'w-3.5 h-3.5' }) => {
  const norm = dimension.toLowerCase();

  // The Nether: Obsidian frame with mystical violet portal center
  if (norm.includes('nether')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The Nether"
      >
        <rect width="16" height="16" rx="2" fill="#120c1d" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#25163b" />
        <rect x="2" y="2" width="12" height="12" fill="#1c0f2f" />
        <rect x="2" y="2" width="2" height="2" fill="#3b235d" />
        <rect x="12" y="12" width="2" height="2" fill="#3b235d" />
        <rect x="12" y="2" width="2" height="2" fill="#3b235d" />
        <rect x="2" y="12" width="2" height="2" fill="#3b235d" />
        <rect x="4" y="3" width="8" height="10" fill="#7e22ce" />
        <rect x="5" y="4" width="6" height="8" fill="#a855f7" />
        <rect x="6" y="5" width="4" height="4" fill="#c084fc" />
        <rect x="7" y="6" width="2" height="3" fill="#f3e8ff" />
        <rect x="5" y="9" width="3" height="2" fill="#9333ea" />
      </svg>
    );
  }

  // The End: End Portal / Eye of Ender with End Stone frame & Teal Void Eye
  if (norm.includes('end')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The End"
      >
        <rect width="16" height="16" rx="2" fill="#7a7e4b" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#cbd18f" />
        <rect x="2" y="2" width="12" height="12" fill="#e2e6ab" />
        <rect x="3" y="3" width="2" height="2" fill="#b1b86c" />
        <rect x="11" y="11" width="2" height="2" fill="#b1b86c" />
        <rect x="4" y="4" width="8" height="8" fill="#042f2e" />
        <rect x="5" y="5" width="6" height="6" fill="#0f766e" />
        <rect x="6" y="6" width="4" height="4" fill="#14b8a6" />
        <rect x="7" y="7" width="2" height="2" fill="#5eead4" />
        <rect x="7" y="8" width="2" height="1" fill="#042f2e" />
      </svg>
    );
  }

  // The Aether: Glowstone golden frame with swirling sky-blue portal center
  if (norm.includes('aether')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The Aether"
      >
        <rect width="16" height="16" rx="2" fill="#78350f" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#d97706" />
        <rect x="2" y="2" width="12" height="12" fill="#f59e0b" />
        <rect x="2" y="2" width="2" height="2" fill="#fef3c7" />
        <rect x="12" y="12" width="2" height="2" fill="#fef3c7" />
        <rect x="4" y="3" width="8" height="10" fill="#0284c7" />
        <rect x="5" y="4" width="6" height="8" fill="#38bdf8" />
        <rect x="6" y="5" width="4" height="4" fill="#bae6fd" />
        <rect x="7" y="6" width="2" height="3" fill="#ffffff" />
      </svg>
    );
  }

  // The Twilight Forest: Foliage green frame with mystical indigo portal center
  if (norm.includes('twilight')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="The Twilight Forest"
      >
        <rect width="16" height="16" rx="2" fill="#064e3b" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#047857" />
        <rect x="2" y="2" width="12" height="12" fill="#059669" />
        <rect x="2" y="2" width="2" height="2" fill="#6ee7b7" />
        <rect x="12" y="12" width="2" height="2" fill="#fde047" />
        <rect x="4" y="3" width="8" height="10" fill="#1e1b4b" />
        <rect x="5" y="4" width="6" height="8" fill="#312e81" />
        <rect x="6" y="5" width="4" height="4" fill="#6366f1" />
        <rect x="7" y="6" width="2" height="3" fill="#a5b4fc" />
      </svg>
    );
  }

  // Deep Dark / The Otherside / Undergarden: Sculk dark teal frame & catalyst center
  if (norm.includes('darker') || norm.includes('undergarden') || norm.includes('otherside') || norm.includes('sculk')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label="Deep Dark Dimension"
      >
        <rect width="16" height="16" rx="2" fill="#020617" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#0f172a" />
        <rect x="2" y="2" width="12" height="12" fill="#082f49" />
        <rect x="3" y="3" width="2" height="2" fill="#0284c7" />
        <rect x="4" y="3" width="8" height="10" fill="#0369a1" />
        <rect x="5" y="4" width="6" height="8" fill="#0ea5e9" />
        <rect x="6" y="5" width="4" height="4" fill="#38bdf8" />
        <rect x="7" y="6" width="2" height="3" fill="#e0f2fe" />
      </svg>
    );
  }

  // Generic modded dimension: Crystalline Amethyst portal
  if (norm.includes(':')) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} shrink-0 inline-block align-middle`}
        shapeRendering="crispEdges"
        aria-label={dimension}
      >
        <rect width="16" height="16" rx="2" fill="#2e1065" />
        <rect x="1" y="1" width="14" height="14" rx="1" fill="#581c87" />
        <rect x="2" y="2" width="12" height="12" fill="#7e22ce" />
        <rect x="4" y="3" width="8" height="10" fill="#9333ea" />
        <rect x="5" y="4" width="6" height="8" fill="#c084fc" />
        <rect x="6" y="5" width="4" height="4" fill="#e9d5ff" />
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
