import React from 'react';

interface GameIconProps {
  className?: string;
  size?: number;
}

/**
 * Official isometric Minecraft Grass Block SVG.
 */
export const MinecraftIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    {/* Isometric Cube Geometry */}
    {/* Top Face: Lush Grass */}
    <path
      d="M16 2L30 10V11L16 19L2 11V10L16 2Z"
      fill="#5b8731"
    />
    <path
      d="M16 2L23 6L16 10L9 6L16 2Z"
      fill="#70a43a"
    />
    <path
      d="M11 7L16 10L14 11.2L9 8.2L11 7Z"
      fill="#476b24"
    />
    <path
      d="M21 7L23 8.2L18 11.2L16 10L21 7Z"
      fill="#7bb540"
    />
    <path
      d="M16 10L20 12.3L16 14.6L12 12.3L16 10Z"
      fill="#50792a"
    />

    {/* Left Face: Dirt with Grass Overhang */}
    <path
      d="M2 11L16 19V30L2 22V11Z"
      fill="#705036"
    />
    {/* Dirt Texture Pixels (Left) */}
    <path d="M4 14H7V16H4V14Z" fill="#543c29" />
    <path d="M8 17H11V19H8V17Z" fill="#543c29" />
    <path d="M5 20H8V22H5V20Z" fill="#8b6545" />
    <path d="M12 21H14V23H12V21Z" fill="#543c29" />
    <path d="M7 24H10V26H7V24Z" fill="#8b6545" />
    <path d="M11 26H14V28H11V26Z" fill="#543c29" />
    <path d="M3 18H5V20H3V18Z" fill="#8b6545" />
    {/* Left Grass Hang */}
    <path
      d="M2 11L16 19V22L14 20.8V22.5L11 20.8V23L8 21.2V22.5L5 20.8V22L2 20.2V11Z"
      fill="#5b8731"
    />

    {/* Right Face: Darker Dirt with Grass Overhang */}
    <path
      d="M16 19L30 11V22L16 30V19Z"
      fill="#5a402b"
    />
    {/* Dirt Texture Pixels (Right) */}
    <path d="M25 14H28V16H25V14Z" fill="#432f1f" />
    <path d="M21 17H24V19H21V17Z" fill="#705036" />
    <path d="M24 20H27V22H24V20Z" fill="#432f1f" />
    <path d="M18 21H20V23H18V21Z" fill="#705036" />
    <path d="M22 24H25V26H22V24Z" fill="#432f1f" />
    <path d="M18 26H21V28H18V26Z" fill="#705036" />
    <path d="M27 18H29V20H27V18Z" fill="#705036" />
    {/* Right Grass Hang */}
    <path
      d="M16 19L30 11V20.2L27 22V20.8L24 22.5V21.2L21 23V20.8L18 22.5V20.8L16 22V19Z"
      fill="#476b24"
    />
  </svg>
);

/**
 * Official Spiffo Raccoon Mascot Icon for Project Zomboid.
 */
export const ProjectZomboidIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    {/* Crimson Background Circle */}
    <rect width="32" height="32" rx="7" fill="#881337" />
    <circle cx="16" cy="16" r="14" fill="#9f1239" stroke="#be123c" strokeWidth="1" />

    {/* Spiffo Raccoon Silhouette / Head */}
    {/* Ears */}
    <path d="M6 8L11 14L8 16L6 8Z" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1" />
    <path d="M26 8L21 14L24 16L26 8Z" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1" />
    <path d="M7.5 10L10.5 13.5L8.5 14.5L7.5 10Z" fill="#f43f5e" />
    <path d="M24.5 10L21.5 13.5L23.5 14.5L24.5 10Z" fill="#f43f5e" />

    {/* Face Base (Orange Fur) */}
    <path
      d="M8 15C8 12 11 10 16 10C21 10 24 12 24 15C24 21 21 25 16 25C11 25 8 21 8 15Z"
      fill="#ea580c"
    />

    {/* Dark Mask */}
    <path
      d="M9 14.5C10 13.5 13 13 14.5 15C13.5 17 11 17.5 9 16.5V14.5ZM23 14.5C22 13.5 19 13 17.5 15C18.5 17 21 17.5 23 16.5V14.5Z"
      fill="#0f172a"
    />

    {/* Eyes */}
    <circle cx="12" cy="15" r="1.5" fill="#ffffff" />
    <circle cx="20" cy="15" r="1.5" fill="#ffffff" />
    <circle cx="12.2" cy="15" r="0.8" fill="#0f172a" />
    <circle cx="19.8" cy="15" r="0.8" fill="#0f172a" />

    {/* White Muzzle */}
    <path
      d="M13 17.5C13 16.5 14.5 16 16 16C17.5 16 19 16.5 19 17.5C19 20 18 21.5 16 21.5C14 21.5 13 20 13 17.5Z"
      fill="#f8fafc"
    />

    {/* Black Nose */}
    <path d="M15 17.5H17L16 18.5L15 17.5Z" fill="#0f172a" />

    {/* Smile & Whiskers */}
    <path
      d="M14.5 19.5C15 20.2 17 20.2 17.5 19.5"
      stroke="#0f172a"
      strokeWidth="0.8"
      strokeLinecap="round"
    />
    <path d="M6 17H9M6 19H9" stroke="#f8fafc" strokeWidth="0.75" strokeLinecap="round" />
    <path d="M23 17H26M23 19H26" stroke="#f8fafc" strokeWidth="0.75" strokeLinecap="round" />
  </svg>
);

/**
 * Official Hytale Ornate Crest & Portal Crystal Icon.
 */
export const HytaleIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    {/* Dark Blue Mystic Background */}
    <rect width="32" height="32" rx="7" fill="#0c1726" />
    <circle cx="16" cy="16" r="14" fill="#071b2e" stroke="#0284c7" strokeWidth="1" strokeOpacity="0.4" />

    {/* Golden Heraldic Shield Border */}
    <path
      d="M16 3L25 7V17C25 22.5 21 26.5 16 29C11 26.5 7 22.5 7 17V7L16 3Z"
      fill="#0f263d"
      stroke="#d97706"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    {/* Inner Glowing Crystal Emblem */}
    <path
      d="M16 6L22 9.5V16C22 20.5 19 23.5 16 25.5C13 23.5 10 20.5 10 16V9.5L16 6Z"
      fill="#0284c7"
      fillOpacity="0.25"
    />

    {/* Central Stylized "H" / Sword Portal Glyph */}
    <path
      d="M13 11V21M19 11V21M13 16H19"
      stroke="#38bdf8"
      strokeWidth="2"
      strokeLinecap="round"
    />

    {/* Brilliant Crystal Diamond Center */}
    <path
      d="M16 13.5L18.5 16L16 18.5L13.5 16L16 13.5Z"
      fill="#e0f2fe"
      stroke="#0284c7"
      strokeWidth="0.8"
    />

    {/* Golden Corner Accents */}
    <circle cx="16" cy="4.5" r="1" fill="#f59e0b" />
    <circle cx="16" cy="27.5" r="1" fill="#f59e0b" />
  </svg>
);

export const GameLogo: React.FC<{ gameId: string; className?: string; size?: number }> = ({
  gameId,
  className = '',
  size = 28
}) => {
  switch (gameId) {
    case 'minecraft':
      return <MinecraftIcon className={className} size={size} />;
    case 'project-zomboid':
      return <ProjectZomboidIcon className={className} size={size} />;
    case 'hytale':
      return <HytaleIcon className={className} size={size} />;
    default:
      return <MinecraftIcon className={className} size={size} />;
  }
};
