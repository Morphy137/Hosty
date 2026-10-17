import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FileText, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/toastContext';
import { ImportDialog } from '../ImportDialog';
import { usePreferences } from '../../../settings/preferencesContext';
import { parsePreferencesExport, serializePreferences } from '../../../settings/storage';
import { downloadTextFile } from '../../../settings/transfer';
import { clearAllCommandHistory } from '../../../settings/commandHistory';
import { openDaemonLogs } from '../../../config/daemon';
import type { SettingControlProps } from '../settingsEnvironment';

const PREFERENCES_FILE_NAME = 'hosty-preferences.json';

const PreferencesTransfer: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { preferences, replace, reset } = usePreferences();
  const [importing, setImporting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializePreferences(preferences));
      toast({ title: t('settings.transfer.copied'), variant: 'success' });
    } catch {
      toast({ title: t('settings.transfer.copy_failed'), variant: 'error' });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void copy()}>
        <Copy className="h-3.5 w-3.5" />
        {t('settings.transfer.copy')}
      </Button>
      <Button size="sm" onClick={() => downloadTextFile(PREFERENCES_FILE_NAME, serializePreferences(preferences))}>
        <Download className="h-3.5 w-3.5" />
        {t('settings.transfer.save_file')}
      </Button>
      <Button size="sm" onClick={() => setImporting(true)}>
        <Upload className="h-3.5 w-3.5" />
        {t('settings.transfer.import')}
      </Button>
      <Button size="sm" variant="danger" onClick={() => setConfirmingReset(true)}>
        <RotateCcw className="h-3.5 w-3.5" />
        {t('settings.advanced.transfer.reset_all')}
      </Button>

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        title={t('settings.advanced.transfer.import_title')}
        description={t('settings.advanced.transfer.import_description')}
        onImport={(text) => {
          replace(parsePreferencesExport(text));
          toast({ title: t('settings.transfer.imported'), variant: 'success' });
        }}
      />

      <Dialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        size="sm"
        title={t('settings.advanced.transfer.reset_title')}
        description={t('settings.advanced.transfer.reset_description')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingReset(false)}>
              {t('settings.transfer.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmingReset(false);
                toast({ title: t('settings.advanced.transfer.reset_done'), variant: 'success' });
              }}
            >
              {t('settings.advanced.transfer.reset_all')}
            </Button>
          </>
        }
      />
    </div>
  );
};

/** Controls of Settings > Advanced. */
export const AdvancedSettings: React.FC<SettingControlProps> = ({ id, env }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  switch (id) {
    case 'transfer':
      return <PreferencesTransfer />;
    case 'daemon':
      return (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[12px] text-ink">{env.daemonUrl}</span>
          {env.isDesktop && (
            <Button size="sm" onClick={() => void openDaemonLogs()}>
              <FileText className="h-3.5 w-3.5" />
              {t('settings.advanced.daemon.open_logs')}
            </Button>
          )}
        </div>
      );
    case 'clear_history':
      return (
        <Button
          size="sm"
          onClick={() => {
            clearAllCommandHistory();
            toast({ title: t('settings.advanced.clear_history.done'), variant: 'success' });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('settings.advanced.clear_history.action')}
        </Button>
      );
    case 'mock':
      return env.onMock ? (
        <Button size="sm" onClick={env.onMock}>
          <Sparkles className="h-3.5 w-3.5" />
          {t('header.mock_button')}
        </Button>
      ) : (
        <span className="text-[12px] text-mute">{t('settings.advanced.mock.disabled')}</span>
      );
    default:
      return null;
  }
};
