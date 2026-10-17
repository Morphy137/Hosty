import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Package, Trash2, Sliders, CheckCircle2, XCircle, Download } from 'lucide-react';
import type { ModFileInfo } from '../../types/daemon';
import { DEFAULT_MOD_SORT, isModSort, MOD_SORTS, sortModFiles, type ModSort } from '../../utils/modSort';
import { Select } from '../ui/Select';

const SORT_STORAGE_KEY = 'hosty.modSort';

const readStoredSort = (): ModSort => {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return isModSort(stored) ? stored : DEFAULT_MOD_SORT;
  } catch {
    return DEFAULT_MOD_SORT;
  }
};

interface ModFilesTabProps {
  files: ModFileInfo[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onToggleMod: (filename: string) => Promise<void>;
  onDeleteMod: (filename: string) => Promise<void>;
  onOpenConfigTab: (configFile: string) => void;
  /** Present only when the game declares a mod catalog. */
  onBrowseCatalog?: () => void;
}

export const ModFilesTab: React.FC<ModFilesTabProps> = ({
  files,
  filter,
  onFilterChange,
  onToggleMod,
  onDeleteMod,
  onOpenConfigTab,
  onBrowseCatalog
}) => {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<ModSort>(readStoredSort);

  const changeSort = (value: string) => {
    if (!isModSort(value)) return;
    setSort(value);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, value);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };

  const filteredFiles = useMemo(
    () =>
      sortModFiles(
        files.filter(
          (f) =>
            f.originalName.toLowerCase().includes(filter.toLowerCase()) ||
            f.filename.toLowerCase().includes(filter.toLowerCase())
        ),
        sort
      ),
    [files, filter, sort]
  );
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }), [i18n.language]);

  const activeCount = files.filter((f) => f.enabled).length;
  const disabledCount = files.length - activeCount;

  const handleDelete = (filename: string) => {
    if (window.confirm(t('mod_files.delete_confirm', { filename }))) {
      onDeleteMod(filename);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden gap-4 max-w-[1200px] w-full mx-auto">
      {onBrowseCatalog && (
        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[6px] bg-ink px-4 text-[13px] font-medium text-on-ink transition hover:bg-ink-hover"
          >
            <Download className="h-3.5 w-3.5" />
            {t('mod_catalog.browse')}
          </button>
        </div>
      )}

      {/* Metric Counters Strip */}
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <div className="geist-card p-4 flex items-center justify-between bg-surface border border-hairline">
          <div>
            <span className="font-mono text-[11px] uppercase text-mute">
              {t('mod_files.total_mods')}
            </span>
            <div className="text-[22px] font-semibold text-ink mt-1">
              {files.length}
            </div>
          </div>
          <Package className="w-5 h-5 text-mute" />
        </div>

        <div className="geist-card p-4 flex items-center justify-between bg-surface border border-hairline">
          <div>
            <span className="font-mono text-[11px] uppercase text-mute">
              {t('mod_files.active_mods')}
            </span>
            <div className="text-[22px] font-semibold text-accent-fg mt-1">
              {activeCount}
            </div>
          </div>
          <CheckCircle2 className="w-5 h-5 text-accent-fg" />
        </div>

        <div className="geist-card p-4 flex items-center justify-between bg-surface border border-hairline">
          <div>
            <span className="font-mono text-[11px] uppercase text-mute">
              {t('mod_files.disabled_mods')}
            </span>
            <div className="text-[22px] font-semibold text-mute mt-1">
              {disabledCount}
            </div>
          </div>
          <XCircle className="w-5 h-5 text-mute" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="relative w-80">
          <Search className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={t('mod_files.search_placeholder')}
            className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-surface border border-hairline text-[14px] text-ink placeholder-mute focus:outline-none focus:border-ink"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-mute">{t('mod_files.directory_hint')}</span>
          <Select
            value={sort}
            onValueChange={changeSort}
            ariaLabel={t('mod_files.sort.label')}
            className="w-48"
            options={MOD_SORTS.map((option) => ({ value: option, label: t(`mod_files.sort.${option}`) }))}
          />
        </div>
      </div>

      {/* Mods Table */}
      <div className="geist-card bg-surface border border-hairline flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 bg-surface-2 border-b border-hairline font-mono text-[11px] uppercase text-mute select-none shrink-0">
          <div className="col-span-1">{t('mod_files.headers.index')}</div>
          <div className="col-span-5">{t('mod_files.headers.name')}</div>
          <div className="col-span-2">{t('mod_files.headers.size')}</div>
          <div className="col-span-2 text-center">{t('mod_files.headers.status')}</div>
          <div className="col-span-2 text-right">{t('mod_files.headers.actions')}</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-hairline">
          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-mute">
              {t('mod_files.empty')}
            </div>
          ) : (
            filteredFiles.map((mod, index) => (
              <div
                key={mod.filename}
                className="grid grid-cols-12 items-center px-4 py-3 hover:bg-surface-2 transition"
              >
                <div className="col-span-1 font-mono text-[12px] text-mute">
                  {String(index + 1).padStart(2, '0')}
                </div>

                <div className="col-span-5 pr-2">
                  <div className="font-medium text-[14px] text-ink truncate">
                    {mod.originalName}
                  </div>
                  <div className="font-mono text-[11px] text-mute truncate mt-0.5">
                    {mod.filename}
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="font-mono text-[12px] text-body">{mod.sizeFormatted}</div>
                  <div className="mt-0.5 text-[11px] text-mute">{dateFormat.format(new Date(mod.modifiedAt))}</div>
                </div>

                <div className="col-span-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => onToggleMod(mod.filename)}
                    className={`h-6 px-2.5 rounded-full text-[11px] font-mono uppercase font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      mod.enabled
                        ? 'bg-accent/10 dark:bg-accent/20 text-accent-fg hover:bg-accent/20 dark:hover:bg-accent/30'
                        : 'bg-surface-3 text-mute hover:bg-hairline'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        mod.enabled ? 'bg-accent' : 'bg-mute'
                      }`}
                    />
                    {mod.enabled ? t('mod_files.active') : t('mod_files.disabled')}
                  </button>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2">
                  {mod.configFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenConfigTab(mod.configFiles[0])}
                      className="p-1.5 rounded hover:bg-surface-3 text-body transition cursor-pointer"
                      title={t('mod_files.open_config')}
                    >
                      <Sliders className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(mod.filename)}
                    className="p-1.5 rounded hover:bg-danger-soft/40 dark:hover:bg-danger-soft/50 text-danger-fg transition cursor-pointer"
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
