import React from 'react';
import type { ConfigEntry, ConfigValue } from '../../types/daemon';

interface ConfigEntryRowProps {
  entry: ConfigEntry;
  index: number;
  onUpdate: (key: string, value: ConfigValue) => void;
}

export const ConfigEntryRow: React.FC<ConfigEntryRowProps> = ({ entry, index, onUpdate }) => {
  return (
    <div className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-surface-2 transition">
      <div className="col-span-1 font-mono text-[12px] text-mute">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="col-span-6 font-mono text-[13px] text-ink font-medium truncate pr-2">
        {entry.key}
      </div>

      <div className="col-span-2">
        <span className="px-2 py-0.5 rounded-[4px] bg-surface-3 border border-hairline font-mono text-[11px] uppercase text-body">
          {entry.type}
        </span>
      </div>

      <div className="col-span-3 flex justify-end">
        {entry.type === 'boolean' ? (
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[12px] text-mute">
              {entry.value ? 'true' : 'false'}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(entry.key, !entry.value)}
              className={`w-9 h-5 rounded-full transition p-0.5 cursor-pointer ${
                entry.value ? 'bg-ink' : 'bg-hairline'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform ${
                  entry.value ? 'bg-surface translate-x-4' : 'bg-surface translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : (
          <input
            type={entry.type === 'number' ? 'number' : 'text'}
            value={String(entry.value)}
            onChange={(e) =>
              onUpdate(entry.key, entry.type === 'number' ? Number(e.target.value) : e.target.value)
            }
            className="w-48 h-8 px-2.5 rounded-[6px] bg-surface border border-hairline font-mono text-[13px] text-right text-ink focus:outline-none focus:border-ink"
          />
        )}
      </div>
    </div>
  );
};
