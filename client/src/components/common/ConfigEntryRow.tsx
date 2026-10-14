import React from 'react';
import type { ConfigEntry, ConfigValue } from '../../types/daemon';

interface ConfigEntryRowProps {
  entry: ConfigEntry;
  index: number;
  onUpdate: (key: string, value: ConfigValue) => void;
}

export const ConfigEntryRow: React.FC<ConfigEntryRowProps> = ({ entry, index, onUpdate }) => {
  return (
    <div className="grid grid-cols-12 items-center px-4 py-2.5 hover:bg-[#fafafa] dark:hover:bg-[#141414] transition">
      <div className="col-span-1 font-mono text-[12px] text-[#a1a1a1] dark:text-[#666666]">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div className="col-span-6 font-mono text-[13px] text-[#171717] dark:text-[#ededed] font-medium truncate pr-2">
        {entry.key}
      </div>

      <div className="col-span-2">
        <span className="px-2 py-0.5 rounded-[4px] bg-[#f5f5f5] dark:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] uppercase text-[#4d4d4d] dark:text-[#a1a1a1]">
          {entry.type}
        </span>
      </div>

      <div className="col-span-3 flex justify-end">
        {entry.type === 'boolean' ? (
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[12px] text-[#888888] dark:text-[#a1a1a1]">
              {entry.value ? 'true' : 'false'}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(entry.key, !entry.value)}
              className={`w-9 h-5 rounded-full transition p-0.5 cursor-pointer ${
                entry.value ? 'bg-[#171717] dark:bg-[#ededed]' : 'bg-[#ebebeb] dark:bg-[#262626]'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform ${
                  entry.value ? 'bg-white dark:bg-[#171717] translate-x-4' : 'bg-white dark:bg-[#888888] translate-x-0'
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
            className="w-48 h-8 px-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[13px] text-right text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
          />
        )}
      </div>
    </div>
  );
};
