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
      <div className="col-span-3 geist-card flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#ebebeb] bg-[#fafafa]/50">
          <span className="font-mono text-[11px] uppercase text-[#888888]">
            /config directory
          </span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
          {files.length === 0 ? (
            <div className="p-4 text-[13px] text-[#888888] text-center">
              {t('mods.no_files')}
            </div>
          ) : (
            files.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onSelectFile(file)}
                className={`w-full px-4 py-3 text-left font-mono text-[13px] flex items-center justify-between transition cursor-pointer ${
                  selectedFile === file
                    ? 'bg-[#171717] text-white font-medium'
                    : 'text-[#171717] hover:bg-[#fafafa]'
                }`}
              >
                <span className="truncate">{file}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Data-Table Editor (9 cols) */}
      <div className="col-span-9 flex flex-col overflow-hidden gap-4">
        <div className="flex items-center justify-between shrink-0">
          <div className="relative w-80">
            <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={`Filter ${selectedFile || 'config'}...`}
              className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white border border-[#ebebeb] text-[14px] text-[#171717] placeholder-[#888888] focus:outline-none focus:border-[#171717]"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedFile}
            className="h-9 px-4 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-50 text-white font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer"
          >
            {isSavedFeedback ? (
              <>
                <Check className="w-4 h-4 text-[#50e3c2]" />
                {t('mods.saved')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {selectedFile ? `Save ${selectedFile}` : t('mods.save')}
              </>
            )}
          </button>
        </div>

        <div className="geist-card flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] border-b border-[#ebebeb] font-mono text-[11px] uppercase text-[#888888] select-none shrink-0">
            <div className="col-span-1">#</div>
            <div className="col-span-6">Config Node Path</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-3 text-right">Value</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#888888]">
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
