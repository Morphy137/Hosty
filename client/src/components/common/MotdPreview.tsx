import React, { useMemo } from 'react';
import { parseMotd, type MotdSegment } from '../../utils/motd';
import { cn } from '../../utils/cn';

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
  const segments = useMemo<MotdSegment[]>(
    () =>
      colorCodes
        ? parseMotd(motd)
        : [{ text: motd, bold: false, italic: false, underline: false, strikethrough: false }].filter((segment) => segment.text),
    [motd, colorCodes]
  );

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
          {segments.length === 0 ? <span>&nbsp;</span> : null}
          {segments.map((segment, index) => (
            <span
              key={index}
              style={{
                color: segment.color,
                fontWeight: segment.bold ? 700 : undefined,
                fontStyle: segment.italic ? 'italic' : undefined,
                textDecoration:
                  [segment.underline ? 'underline' : '', segment.strikethrough ? 'line-through' : '']
                    .filter(Boolean)
                    .join(' ') || undefined
              }}
            >
              {segment.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
