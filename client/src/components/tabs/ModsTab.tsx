import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, Save, Check } from 'lucide-react';
import type { ConfigEntry, ConfigValue } from '../../types/daemon';
import { ConfigEntryRow } from '../common/ConfigEntryRow';

interface ModsTabProps {
  files: string[];
  selectedFile: string;
  entries: ConfigEntry[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onSelectFile: (filename: string) => void;
  onUpdateEntry: (key: string, value: ConfigValue) => void;
  onSave: () => Promise<void>;
}

export const ModsTab: React.FC<ModsTabProps> = ({
  files,
  selectedFile,
  entries,
  filter,
  onFilterChange,
  onSelectFile,
  onUpdateEntry,
  onSave
}) => {
  const { t } = useTranslation();
  const [isSavedFeedback, setIsSavedFeedback] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
      setIsSavedFeedback(true);
      setTimeout(() => setIsSavedFeedback(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEntries = entries.filter((entry) =>
    entry.key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
      {/* Left File Selector (3 cols) */}
      <div className="col-span-3 geist-card bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#ebebeb] dark:border-[#262626] bg-[#fafafa]/50 dark:bg-[#141414]/50">
          <span className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
            {t('mods.directory_hint')}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb] dark:divide-[#262626]">
          {files.length === 0 ? (
            <div className="p-4 text-[13px] text-[#888888] dark:text-[#a1a1a1] text-center">
              {t('mods.no_files')}
            </div>
          ) : (
            files.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onSelectFile(file)}
                className={`w-full px-4 py-3 text-left font-mono text-[13px] flex items-center justify-between transition cursor-pointer border-l-2 ${
                  selectedFile === file
                    ? 'border-[#171717] dark:border-[#ededed] bg-[#f4f4f5] dark:bg-[#1f1f1f] text-[#171717] dark:text-[#ededed] font-medium'
                    : 'border-transparent text-[#666666] dark:text-[#a1a1a1] hover:text-[#171717] dark:hover:text-[#ededed] hover:bg-[#fafafa] dark:hover:bg-[#141414]'
                }`}
              >
                <span className="truncate">{file}</span>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                    selectedFile === file ? 'opacity-100 text-[#171717] dark:text-[#ededed]' : 'opacity-40'
                  }`}
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Data-Table Editor (9 cols) */}
      <div className="col-span-9 flex flex-col overflow-hidden gap-4">
        <div className="flex items-center justify-between shrink-0">
          <div className="relative w-80">
            <Search className="w-4 h-4 text-[#888888] dark:text-[#a1a1a1] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t('mods.search_placeholder')}
              className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[14px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedFile}
            className="h-9 px-4 rounded-[6px] bg-[#171717] hover:bg-[#333333] dark:bg-[#ededed] dark:hover:bg-[#ffffff] disabled:opacity-50 text-white dark:text-[#171717] font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer shadow-2xs"
          >
            {isSavedFeedback ? (
              <>
                <Check className="w-4 h-4 text-[#50e3c2]" />
                {t('mods.saved')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('mods.save')}
              </>
            )}
          </button>
        </div>

        <div className="geist-card bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] dark:bg-[#141414] border-b border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1] select-none shrink-0">
            <div className="col-span-1">{t('mods.headers.index')}</div>
            <div className="col-span-6">{t('mods.headers.path')}</div>
            <div className="col-span-2">{t('mods.headers.type')}</div>
            <div className="col-span-3 text-right">{t('mods.headers.value')}</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb] dark:divide-[#262626]">
            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#888888] dark:text-[#a1a1a1]">
                {t('mods.empty')}
              </div>
            ) : (
              filteredEntries.map((entry, idx) => (
                <ConfigEntryRow
                  key={entry.key}
                  entry={entry}
                  index={idx}
                  onUpdate={onUpdateEntry}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
