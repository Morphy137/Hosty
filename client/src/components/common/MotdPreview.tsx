import React from 'react';
import { cn } from '../../utils/cn';
import { MotdText } from './MotdText';

interface MotdPreviewProps {
  motd: string;
  name?: string;
  iconSrc?: string | null;
  /** Interpret § / & formatting codes (manifest `motd.colorCodes`). */
  colorCodes?: boolean;
  className?: string;
}

/** A server-list style row (icon, name, message of the day) for games that declare `motd.preview`. */
export const MotdPreview: React.FC<MotdPreviewProps> = ({ motd, name, iconSrc, colorCodes = false, className }) => {
  return (
    <div className={cn('flex items-center gap-3 rounded-[6px] bg-console p-2.5 text-white', className)}>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[2px] bg-white/10">
        {iconSrc ? (
          <img src={iconSrc} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 font-mono text-[13px] leading-[18px]">
        {name && <div className="truncate text-white">{name}</div>}
        <div className="whitespace-pre-wrap break-words text-white/70">
          <MotdText motd={motd} colorCodes={colorCodes} />
        </div>
      </div>
    </div>
  );
};
