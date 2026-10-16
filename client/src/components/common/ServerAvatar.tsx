import React, { useState } from 'react';
import { getInstanceIconUrl } from '../../api/daemonApi';
import type { InstanceInfo } from '../../types/daemon';
import { cn } from '../../utils/cn';
import { GameLogo } from './GameIcons';

interface ServerAvatarProps {
  instance: Pick<InstanceInfo, 'id' | 'name' | 'gameId' | 'hasIcon' | 'iconVersion'>;
  size: number;
  className?: string;
}

/** The server's own icon when it has one (refreshed whenever it changes), otherwise its game's logo. */
export const ServerAvatar: React.FC<ServerAvatarProps> = ({ instance, size, className }) => {
  const url = instance.hasIcon ? getInstanceIconUrl(instance.id, instance.iconVersion) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return <GameLogo gameId={instance.gameId ?? ''} size={size} className={className} />;
  }
  return (
    <img
      src={url}
      alt={instance.name}
      width={size}
      height={size}
      onError={() => setFailedUrl(url)}
      className={cn('shrink-0 rounded-[4px] object-contain select-none pointer-events-none [image-rendering:pixelated]', className)}
    />
  );
};
