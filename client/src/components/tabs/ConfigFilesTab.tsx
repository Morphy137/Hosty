import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileWarning } from 'lucide-react';
import type { ConfigFilesState } from '../../hooks/useConfigFiles';
import { resolveLocalized } from '../../utils/localized';
import { Select } from '../ui/Select';
import { PropertiesTab } from './PropertiesTab';

/** Config editor for whichever files the game's driver declares (server.properties, servertest.ini, ...). */
export const ConfigFilesTab: React.FC<{ config: ConfigFilesState }> = ({ config }) => {
  const { t, i18n } = useTranslation();

  if (config.files.length === 0) {
    return <p className="p-6 text-[13px] text-mute">{t('config.no_files')}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {config.files.length > 1 && (
        <div className="w-72 shrink-0">
          <Select
            ariaLabel={t('config.file_label')}
            value={config.selectedPath}
            onValueChange={config.selectFile}
            options={config.files.map((file) => ({
              value: file.path,
              label: resolveLocalized(file.label, i18n.language) ?? file.path
            }))}
          />
        </div>
      )}

      {config.isMissing ? (
        <div className="flex items-start gap-3 rounded-[8px] border border-hairline bg-surface p-5 text-[13px] text-soft">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{t('config.file_missing', { file: config.selectedPath })}</p>
        </div>
      ) : (
        <PropertiesTab
          entries={config.entries}
          filter={config.filter}
          onFilterChange={config.setFilter}
          onUpdateEntry={config.updateEntry}
          onSave={config.save}
        />
      )}
    </div>
  );
};
