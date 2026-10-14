import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Save, Check } from 'lucide-react';
import type { ConfigEntry, ConfigValue } from '../../types/daemon';
import { ConfigEntryRow } from '../common/ConfigEntryRow';

interface PropertiesTabProps {
  entries: ConfigEntry[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onUpdateEntry: (key: string, value: ConfigValue) => void;
  onSave: () => Promise<void>;
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
  entries,
  filter,
  onFilterChange,
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

  const filteredEntries = entries.filter((item) =>
    item.key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1000px] w-full mx-auto">
      <div className="flex items-center justify-between shrink-0">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-[#888888] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t('properties.search_placeholder')}
            className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white border border-[#ebebeb] text-[14px] text-[#171717] placeholder-[#888888] focus:outline-none focus:border-[#171717]"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-9 px-4 rounded-[6px] bg-[#171717] hover:bg-[#333333] disabled:opacity-50 text-white font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer"
        >
          {isSavedFeedback ? (
            <>
              <Check className="w-4 h-4 text-[#50e3c2]" />
              {t('properties.saved')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t('properties.save')}
            </>
          )}
        </button>
      </div>

      <div className="geist-card flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] border-b border-[#ebebeb] font-mono text-[11px] uppercase text-[#888888] select-none shrink-0">
          <div className="col-span-1">#</div>
          <div className="col-span-6">{t('properties.headers.key')}</div>
          <div className="col-span-2">{t('properties.headers.type')}</div>
          <div className="col-span-3 text-right">{t('properties.headers.value')}</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#888888]">
              {t('properties.empty')}
            </div>
          ) : (
            filteredEntries.map((prop, index) => (
              <ConfigEntryRow
                key={prop.key}
                entry={prop}
                index={index}
                onUpdate={onUpdateEntry}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
