import React, { useEffect, useMemo, useRef } from 'react';
import { usePreferences } from '../../settings/preferencesContext';
import { compileHighlightRules, getConsoleLineClass, stripTimestamp } from '../../utils/console';
import { cn } from '../../utils/cn';

/** Distance from the bottom (px) under which the `bottom` autoscroll mode keeps following new lines. */
const CONSOLE_FOLLOW_THRESHOLD_PX = 120;

interface ConsoleOutputProps {
  lines: string[];
  /** Shown while there are no lines. */
  emptyText: string;
  className?: string;
}

/** Scrolling console text styled by the terminal preferences (theme, font, highlighting, autoscroll). */
export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ lines, emptyText, className }) => {
  const { terminal } = usePreferences().preferences;
  const endRef = useRef<HTMLDivElement>(null);
  const rules = useMemo(() => compileHighlightRules(terminal.rules), [terminal.rules]);
  const highlight = useMemo(
    () => ({ highlightLevels: terminal.highlightLevels, rules }),
    [rules, terminal.highlightLevels]
  );

  // Jump straight to the end when the console opens (no animation through the whole history), then
  // follow new lines as the autoscroll preference says.
  const hasPositioned = useRef(false);
  const previousCount = useRef(0);
  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    // A shorter list means another server's console was loaded: position it like a fresh open.
    if (lines.length < previousCount.current) hasPositioned.current = false;
    previousCount.current = lines.length;
    if (!hasPositioned.current) {
      hasPositioned.current = true;
      end.scrollIntoView({ behavior: 'auto', block: 'end' });
      return;
    }
    if (terminal.autoscroll === 'never') return;
    const container = end.parentElement;
    const distanceFromBottom = container ? container.scrollHeight - container.scrollTop - container.clientHeight : 0;
    if (terminal.autoscroll === 'always' || distanceFromBottom <= CONSOLE_FOLLOW_THRESHOLD_PX) {
      end.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [lines, terminal.autoscroll]);

  return (
    <div
      className={cn(
        'console-output flex flex-1 select-text flex-col gap-[var(--console-line-gap)] overflow-y-auto p-4 cursor-text',
        !terminal.wrapLines && 'overflow-x-auto',
        className
      )}
      onContextMenu={() => {
        // Right click copies the current selection (the native menu is suppressed globally).
        const selected = window.getSelection()?.toString();
        if (selected) void navigator.clipboard?.writeText(selected).catch(() => undefined);
      }}
    >
      {lines.length === 0 ? (
        <div className="text-console-mute">{emptyText}</div>
      ) : (
        lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              terminal.wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
              getConsoleLineClass(line, highlight)
            )}
          >
            {terminal.showTimestamps ? line : stripTimestamp(line)}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
};
