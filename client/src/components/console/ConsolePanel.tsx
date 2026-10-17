import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Eraser, Terminal } from 'lucide-react';
import { ConsoleOutput } from './ConsoleOutput';
import { usePreferences } from '../../settings/preferencesContext';
import { loadCommandHistory, saveCommandHistory } from '../../settings/commandHistory';
import type { QuickCommand } from '../../settings/schema';
import { pushHistory } from '../../utils/console';
import { cn } from '../../utils/cn';

interface ConsolePanelProps {
  logs: string[];
  /** Server whose command history the arrow keys browse. */
  instanceId: string;
  quickCommands: QuickCommand[];
  onSendCommand: (command: string) => void;
  onClear?: () => void;
  className?: string;
}

/** Server console: output, quick commands and a command line with history (remount it per server with `key`). */
export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  instanceId,
  quickCommands,
  onSendCommand,
  onClear,
  className
}) => {
  const { t } = useTranslation();
  const { historySize } = usePreferences().preferences.terminal;
  const [commandInput, setCommandInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => loadCommandHistory(instanceId));
  // Position while browsing the history with the arrow keys; `null` means typing a new command.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    onSendCommand(trimmed);
    const next = pushHistory(history, trimmed, historySize);
    setHistory(next);
    saveCommandHistory(instanceId, next);
    setHistoryIndex(null);
    setCommandInput('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (history.length === 0 || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    if (event.key === 'ArrowUp') {
      const index = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setCommandInput(history[index]);
      return;
    }
    if (historyIndex === null) return;
    const index = historyIndex + 1;
    if (index >= history.length) {
      setHistoryIndex(null);
      setCommandInput('');
      return;
    }
    setHistoryIndex(index);
    setCommandInput(history[index]);
  };

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[8px] border border-console-border bg-console text-console-fg shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-console-border px-4 py-3">
        <div className="flex shrink-0 items-center gap-2">
          <Terminal className="h-4 w-4 text-console-mute" />
          <span className="font-mono text-[12px]">{t('overview.console_source')}</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {quickCommands.map((item) => (
            <button
              key={`${item.label}:${item.command}`}
              type="button"
              title={item.command}
              onClick={() => onSendCommand(item.command)}
              className="cursor-pointer rounded-[4px] bg-console-chip px-2 py-0.5 font-mono text-[11px] text-console-mute transition hover:bg-console-chip-hover hover:text-console-fg"
            >
              {item.label}
            </button>
          ))}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t('overview.console.clear')}
              title={t('overview.console.clear')}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[4px] text-console-mute transition hover:bg-console-chip-hover hover:text-console-fg"
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <ConsoleOutput lines={logs} emptyText={t('overview.console_ready')} />

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-console-border p-2.5">
        <ChevronRight className="ml-1 h-4 w-4 text-console-mute" />
        <input
          type="text"
          value={commandInput}
          onChange={(event) => {
            setCommandInput(event.target.value);
            setHistoryIndex(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('overview.console.placeholder')}
          aria-label={t('overview.console.placeholder')}
          className="flex-1 bg-transparent font-mono text-[13px] text-console-fg placeholder:text-console-mute focus:outline-none"
        />
        <button
          type="submit"
          className="h-7 cursor-pointer rounded-[6px] bg-console-fg px-3 text-[12px] font-medium text-console transition hover:opacity-80"
        >
          {t('overview.console.send')}
        </button>
      </form>
    </div>
  );
};
