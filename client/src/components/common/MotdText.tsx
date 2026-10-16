import React, { useMemo } from 'react';
import { motdSegments } from '../../utils/motd';

interface MotdTextProps {
  motd: string;
  /** Interpret the game's formatting codes (manifest `motd.colorCodes`). */
  colorCodes?: boolean;
}

/** A message of the day as styled spans; the caller provides the surrounding element and its text colour. */
export const MotdText: React.FC<MotdTextProps> = ({ motd, colorCodes = false }) => {
  const segments = useMemo(() => motdSegments(motd, colorCodes), [motd, colorCodes]);

  if (segments.length === 0) return <span>&nbsp;</span>;
  return (
    <>
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
    </>
  );
};
