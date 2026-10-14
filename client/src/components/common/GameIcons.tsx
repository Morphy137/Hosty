import React from 'react';
import minecraftLogo from '../../assets/minecraft/Grass_Block.png';
import zomboidLogo from '../../assets/logos/project-zomboid.webp';
import hytaleLogo from '../../assets/logos/hytale.png';

interface GameIconProps {
  className?: string;
  size?: number;
}

/**
 * Official Minecraft Logo Icon from downloaded assets.
 */
export const MinecraftIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <img
    src={minecraftLogo}
    alt="Minecraft"
    width={size}
    height={size}
    className={`shrink-0 object-contain select-none pointer-events-none ${className}`}
    style={{ width: size, height: size }}
  />
);

/**
 * Official Project Zomboid Logo Icon from downloaded assets.
 */
export const ProjectZomboidIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <img
    src={zomboidLogo}
    alt="Project Zomboid"
    width={size}
    height={size}
    className={`shrink-0 object-contain select-none pointer-events-none ${className}`}
    style={{ width: size, height: size }}
  />
);

/**
 * Official Hytale Logo Icon from downloaded assets.
 */
export const HytaleIcon: React.FC<GameIconProps> = ({ className = '', size = 28 }) => (
  <img
    src={hytaleLogo}
    alt="Hytale"
    width={size}
    height={size}
    className={`shrink-0 object-contain select-none pointer-events-none ${className}`}
    style={{ width: size, height: size }}
  />
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
