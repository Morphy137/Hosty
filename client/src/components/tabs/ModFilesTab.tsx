import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Package, Trash2, Sliders, CheckCircle2, XCircle } from 'lucide-react';
import type { ModFileInfo } from '../../types/daemon';

interface ModFilesTabProps {
  files: ModFileInfo[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onToggleMod: (filename: string) => Promise<void>;
  onDeleteMod: (filename: string) => Promise<void>;
  onOpenConfigTab: () => void;
}

export const ModFilesTab: React.FC<ModFilesTabProps> = ({
  files,
  filter,
  onFilterChange,
  onToggleMod,
  onDeleteMod,
  onOpenConfigTab
}) => {
  const { t } = useTranslation();

  const filteredFiles = files.filter(
    (f) =>
      f.originalName.toLowerCase().includes(filter.toLowerCase()) ||
      f.filename.toLowerCase().includes(filter.toLowerCase())
  );

  const activeCount = files.filter((f) => f.enabled).length;
  const disabledCount = files.length - activeCount;

  const handleDelete = (filename: string) => {
    if (window.confirm(t('mod_files.delete_confirm', { filename }))) {
      onDeleteMod(filename);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1200px] w-full mx-auto">
      {/* Metric Counters Strip */}
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <div className="geist-card p-4 flex items-center justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div>
            <span className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('mod_files.total_mods')}
            </span>
            <div className="text-[22px] font-semibold text-[#171717] dark:text-[#ededed] mt-1">
              {files.length}
            </div>
          </div>
          <Package className="w-5 h-5 text-[#888888] dark:text-[#a1a1a1]" />
        </div>

        <div className="geist-card p-4 flex items-center justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div>
            <span className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('mod_files.active_mods')}
            </span>
            <div className="text-[22px] font-semibold text-[#0070f3] dark:text-[#3291ff] mt-1">
              {activeCount}
            </div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-[#0070f3] dark:text-[#3291ff]" />
        </div>

        <div className="geist-card p-4 flex items-center justify-between bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626]">
          <div>
            <span className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('mod_files.disabled_mods')}
            </span>
            <div className="text-[22px] font-semibold text-[#888888] dark:text-[#a1a1a1] mt-1">
              {disabledCount}
            </div>
          </div>
          <XCircle className="w-5 h-5 text-[#888888] dark:text-[#a1a1a1]" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-[#888888] dark:text-[#a1a1a1] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t('mod_files.search_placeholder')}
            className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[14px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
          />
        </div>

        <span className="font-mono text-[12px] text-[#888888] dark:text-[#a1a1a1]">
          {t('mod_files.directory_hint')}
        </span>
      </div>

      {/* Mods Table */}
      <div className="geist-card bg-white dark:bg-[#0d0d0d] border border-[#ebebeb] dark:border-[#262626] flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 bg-[#fafafa] dark:bg-[#141414] border-b border-[#ebebeb] dark:border-[#262626] font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1] select-none shrink-0">
          <div className="col-span-1">{t('mod_files.headers.index')}</div>
          <div className="col-span-5">{t('mod_files.headers.name')}</div>
          <div className="col-span-2">{t('mod_files.headers.size')}</div>
          <div className="col-span-2 text-center">{t('mod_files.headers.status')}</div>
          <div className="col-span-2 text-right">{t('mod_files.headers.actions')}</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb] dark:divide-[#262626]">
          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#888888] dark:text-[#a1a1a1]">
              {t('mod_files.empty')}
            </div>
          ) : (
            filteredFiles.map((mod, index) => (
              <div
                key={mod.filename}
                className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[#fafafa] dark:hover:bg-[#141414] transition"
              >
                <div className="col-span-1 font-mono text-[12px] text-[#a1a1a1] dark:text-[#666666]">
                  {String(index + 1).padStart(2, '0')}
                </div>

                <div className="col-span-5 pr-2">
                  <div className="font-medium text-[14px] text-[#171717] dark:text-[#ededed] truncate">
                    {mod.originalName}
                  </div>
                  <div className="font-mono text-[11px] text-[#888888] dark:text-[#a1a1a1] truncate mt-0.5">
                    {mod.filename}
                  </div>
                </div>

                <div className="col-span-2 font-mono text-[12px] text-[#4d4d4d] dark:text-[#a1a1a1]">
                  {mod.sizeFormatted}
                </div>

                <div className="col-span-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => onToggleMod(mod.filename)}
                    className={`h-6 px-2.5 rounded-full text-[11px] font-mono uppercase font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      mod.enabled
                        ? 'bg-[#0070f3]/10 dark:bg-[#0070f3]/20 text-[#0070f3] dark:text-[#3291ff] hover:bg-[#0070f3]/20 dark:hover:bg-[#0070f3]/30'
                        : 'bg-[#f5f5f5] dark:bg-[#1f1f1f] text-[#888888] dark:text-[#a1a1a1] hover:bg-[#ebebeb] dark:hover:bg-[#262626]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        mod.enabled ? 'bg-[#0070f3] dark:bg-[#3291ff]' : 'bg-[#888888] dark:bg-[#666666]'
                      }`}
                    />
                    {mod.enabled ? t('mod_files.active') : t('mod_files.disabled')}
                  </button>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2">
                  {mod.hasConfig && (
                    <button
                      type="button"
                      onClick={onOpenConfigTab}
                      className="p-1.5 rounded hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] text-[#4d4d4d] dark:text-[#a1a1a1] transition cursor-pointer"
                      title={t('mod_files.open_config')}
                    >
                      <Sliders className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(mod.filename)}
                    className="p-1.5 rounded hover:bg-[#f7d4d6]/40 dark:hover:bg-[#381215]/50 text-[#ee0000] dark:text-[#ff6b6b] transition cursor-pointer"
                    title={t('mod_files.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
