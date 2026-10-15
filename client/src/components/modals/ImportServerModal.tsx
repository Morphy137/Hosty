import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, FolderOpen } from 'lucide-react';
import { isTauriRuntime } from '../../config/daemon';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';

interface ImportServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (folderPath: string, name?: string) => Promise<void>;
}

/** Opens the native folder picker (desktop shell only). Returns null when cancelled or unavailable. */
async function pickFolder(title: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

export const ImportServerModal: React.FC<ImportServerModalProps> = ({ isOpen, onClose, onImport }) => {
  const { t } = useTranslation();
  const [folderPath, setFolderPath] = useState('');
  const [serverName, setServerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBrowse = async () => {
    try {
      const selected = await pickFolder(t('import_server.picker_title'));
      if (selected) setFolderPath(selected);
    } catch {
      // The picker is a convenience; the path can still be typed.
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) return;

    setIsSubmitting(true);
    try {
      await onImport(trimmedPath, serverName.trim() || undefined);
      setFolderPath('');
      setServerName('');
      onClose();
    } catch {
      // The error is surfaced by the caller; keep the form open for another try.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={t('import_server.modal_title')}
      dismissible={!isSubmitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="font-mono text-[11px] uppercase text-mute" htmlFor="import-folder">
            {t('import_server.path_label')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="import-folder"
              type="text"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="C:\Servers\MyMinecraftServer"
              required
              className="font-mono text-[12px]"
            />
            {isTauriRuntime() && (
              <Button
                variant="secondary"
                onClick={handleBrowse}
                leadingIcon={<FolderOpen className="h-3.5 w-3.5" />}
              >
                {t('import_server.browse')}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-mute">{t('import_server.path_hint')}</p>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[11px] uppercase text-mute" htmlFor="import-name">
            {t('import_server.name_label')}
          </label>
          <Input
            id="import-name"
            type="text"
            value={serverName}
            onChange={(event) => setServerName(event.target.value)}
            placeholder={t('import_server.display_name_placeholder')}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={isSubmitting}
          disabled={!folderPath.trim()}
          leadingIcon={<FolderInput className="h-4 w-4" />}
        >
          {isSubmitting ? t('import_server.submitting') : t('import_server.submit_button')}
        </Button>
      </form>
    </Dialog>
  );
};
