import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FolderInput, FolderOpen, Loader2, PlusCircle, AlertCircle } from 'lucide-react';
import { isTauriRuntime } from '../../../config/daemon';
import { inspectFolder } from '../../../api/daemonApi';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { cn } from '../../../utils/cn';
import { slugifyInstanceId, type StepProps, type WizardOrigin } from '../wizardTypes';

interface OriginStepProps extends StepProps {
  isInspecting: boolean;
  setIsInspecting: (value: boolean) => void;
  inspectError: string | null;
  setInspectError: (value: string | null) => void;
}

const OPTIONS: Array<{ id: WizardOrigin; icon: React.ReactNode; titleKey: string; descKey: string }> = [
  {
    id: 'create',
    icon: <PlusCircle className="h-5 w-5" />,
    titleKey: 'wizard.origin_create_title',
    descKey: 'wizard.origin_create_desc'
  },
  {
    id: 'import',
    icon: <FolderInput className="h-5 w-5" />,
    titleKey: 'wizard.origin_import_title',
    descKey: 'wizard.origin_import_desc'
  }
];

async function pickFolder(title: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

export const OriginStep: React.FC<OriginStepProps> = ({
  draft,
  update,
  disabled,
  isInspecting,
  setIsInspecting,
  inspectError,
  setInspectError
}) => {
  const { t } = useTranslation();

  const runInspection = async (folder: string) => {
    const trimmed = folder.trim();
    update({ importPath: folder, importInfo: null });
    setInspectError(null);
    if (!trimmed) return;

    setIsInspecting(true);
    try {
      const info = await inspectFolder(trimmed);
      update({
        importPath: folder,
        importInfo: info,
        gameId: info.gameId ?? draft.gameId,
        name: draft.name || info.suggestedName,
        instanceId: draft.idTouched ? draft.instanceId : slugifyInstanceId(info.suggestedName),
        motd: info.motd ?? draft.motd,
        port: info.port ?? draft.port,
        maxPlayers: info.maxPlayers ?? draft.maxPlayers
      });
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInspecting(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await pickFolder(t('import_server.picker_title'));
      if (selected) await runInspection(selected);
    } catch {
      // The picker is a convenience; the path can still be typed.
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const isSelected = draft.origin === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => update({ origin: option.id })}
              className={cn(
                'flex items-start gap-3 rounded-[8px] border p-4 text-left transition-colors cursor-pointer',
                isSelected ? 'border-accent bg-info-soft' : 'border-hairline bg-surface hover:border-hairline-strong'
              )}
            >
              <span className={cn('mt-0.5', isSelected ? 'text-accent-fg' : 'text-mute')}>{option.icon}</span>
              <span>
                <span className="block text-[14px] font-semibold text-ink">{t(option.titleKey)}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-soft">{t(option.descKey)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {draft.origin === 'import' && (
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-mute" htmlFor="wizard-import-path">
            {t('import_server.path_label')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="wizard-import-path"
              value={draft.importPath}
              disabled={disabled}
              placeholder="C:\Servers\MyMinecraftServer"
              className="font-mono text-[12px]"
              onChange={(event) => update({ importPath: event.target.value, importInfo: null })}
              onBlur={() => draft.importPath.trim() && !draft.importInfo && void runInspection(draft.importPath)}
            />
            {isTauriRuntime() && (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={handleBrowse}
                leadingIcon={<FolderOpen className="h-3.5 w-3.5" />}
              >
                {t('import_server.browse')}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-mute">{t('import_server.path_hint')}</p>

          <div className="min-h-5 text-[12px]">
            {isInspecting && (
              <span className="flex items-center gap-2 text-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('wizard.import_detecting')}
              </span>
            )}
            {!isInspecting && inspectError && (
              <span className="flex items-center gap-2 text-danger-fg">
                <AlertCircle className="h-3.5 w-3.5" />
                {inspectError}
              </span>
            )}
            {!isInspecting && draft.importInfo && (
              <span className="flex items-center gap-2 text-ink">
                <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" />
                {draft.importInfo.gameId
                  ? t('wizard.import_detected', {
                      game: draft.importInfo.gameId,
                      loader: draft.importInfo.loader ?? '—',
                      version: draft.importInfo.mcVersion ?? '—'
                    })
                  : t('wizard.import_unknown')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
