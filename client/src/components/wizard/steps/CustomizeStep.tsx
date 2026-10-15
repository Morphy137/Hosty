import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, ImagePlus, Trash2 } from 'lucide-react';
import type { GameDriverSummary, InstanceInfo } from '../../../types/daemon';
import { isPortInUse } from '../../../api/daemonApi';
import { resizeToServerIcon } from '../../../utils/serverIcon';
import { defaultMinRamMb, maxAllocatableRamMb, recommendedRamMb } from '../../../utils/ram';
import { MotdPreview } from '../../common/MotdPreview';
import { Button } from '../../ui/Button';
import { Input, NumberInput } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { cn } from '../../../utils/cn';
import { slugifyInstanceId, type StepProps } from '../wizardTypes';

interface CustomizeStepProps extends StepProps {
  game: GameDriverSummary | undefined;
  instances: InstanceInfo[];
  systemRamMb: number | undefined;
}

const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;
const PORT_DEBOUNCE_MS = 400;

export const CustomizeStep: React.FC<CustomizeStepProps> = ({ draft, update, disabled, game, instances, systemRamMb }) => {
  const { t } = useTranslation();
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [portInUse, setPortInUse] = useState(false);

  const isImport = draft.origin === 'import';
  const isMinecraftLike = Boolean(game?.configSync);
  const takenByInstance = instances.some((instance) => instance.port === draft.port);
  const ramLimit = maxAllocatableRamMb(systemRamMb);
  // The game's declared default wins; otherwise fall back to a size derived from system memory.
  const defaultRamMb = Math.min(game?.launchDefaults?.memoryMb ?? recommendedRamMb(systemRamMb), ramLimit);

  useEffect(() => {
    if (isImport || draft.port < 1 || draft.port > 65535) return;
    let ignore = false;
    const timer = window.setTimeout(() => {
      isPortInUse(draft.port)
        .then((inUse) => {
          if (!ignore) setPortInUse(inUse);
        })
        .catch(() => {
          if (!ignore) setPortInUse(false);
        });
    }, PORT_DEBOUNCE_MS);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [draft.port, isImport]);

  const handleIcon = async (file: File | undefined) => {
    if (!file) return;
    setIconError(null);
    try {
      update({ iconBase64: await resizeToServerIcon(file) });
    } catch (error) {
      setIconError(error instanceof Error ? error.message : String(error));
    }
  };

  const changeName = (value: string) => {
    update({ name: value, ...(draft.idTouched ? {} : { instanceId: slugifyInstanceId(value) }) });
  };

  const field = (labelKey: string, htmlFor: string, children: React.ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase text-mute">
        {t(labelKey)}
      </label>
      {children}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="space-y-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => iconInputRef.current?.click()}
            className={cn(
              'flex h-20 w-20 items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-hairline-strong',
              'bg-surface-2 text-mute transition-colors hover:border-ink cursor-pointer'
            )}
            aria-label={t('wizard.icon_choose')}
          >
            {draft.iconBase64 ? (
              <img src={draft.iconBase64} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
            ) : (
              <ImagePlus className="h-6 w-6" />
            )}
          </button>
          <input
            ref={iconInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleIcon(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {draft.iconBase64 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => update({ iconBase64: null })}
              leadingIcon={<Trash2 className="h-3 w-3" />}
            >
              {t('edit_server.remove_icon')}
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {field('create_server.name_label', 'wizard-name',
            <Input id="wizard-name" value={draft.name} disabled={disabled} onChange={(e) => changeName(e.target.value)} />
          )}
          {iconError && <p className="text-[12px] text-danger-fg">{iconError}</p>}
          <p className="text-[11px] text-mute">{t('wizard.icon_hint')}</p>
        </div>
      </div>

      {!isImport && isMinecraftLike && (
        <div className="space-y-2">
          {field('edit_server.motd_label', 'wizard-motd',
            <Input
              id="wizard-motd"
              value={draft.motd}
              disabled={disabled}
              placeholder={t('create_server.motd_placeholder')}
              onChange={(e) => update({ motd: e.target.value })}
            />
          )}
          <p className="text-[11px] text-mute">{t('wizard.motd_hint')}</p>
          <MotdPreview motd={draft.motd} name={draft.name} iconSrc={draft.iconBase64} />
        </div>
      )}

      {!isImport && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] uppercase text-mute">{t('edit_server.ram_label')}</label>
              <span className="font-mono text-[12px] text-ink">
                {(draft.ramMb / 1024).toFixed(draft.ramMb % 1024 === 0 ? 0 : 1)} GB
              </span>
            </div>
            <Slider
              min={1024}
              max={ramLimit}
              step={256}
              value={Math.min(draft.ramMb, ramLimit)}
              disabled={disabled}
              onChange={(value) => update({ ramMb: value })}
              ariaLabel={t('edit_server.ram_label')}
            />
            <div className="flex items-center justify-between text-[11px] text-mute">
              <span>
                {systemRamMb
                  ? t('wizard.ram_system', { total: Math.round(systemRamMb / 1024) })
                  : t('wizard.ram_system_unknown')}
              </span>
              <button
                type="button"
                className="cursor-pointer text-accent-fg hover:underline"
                onClick={() => update({ ramMb: defaultRamMb })}
              >
                {t('wizard.ram_default', { value: Math.round(defaultRamMb / 1024) })}
              </button>
            </div>
            <p className="text-[11px] text-mute">
              {t('wizard.ram_min_hint', { min: defaultMinRamMb(draft.ramMb) })}
            </p>
          </div>

          <div className={cn('grid gap-3', isMinecraftLike ? 'grid-cols-3' : 'grid-cols-1')}>
            {field('edit_server.max_players_label', 'wizard-max-players',
              <NumberInput
                id="wizard-max-players"
                min={1}
                max={9999}
                value={draft.maxPlayers}
                disabled={disabled}
                onValueChange={(value) => update({ maxPlayers: value })}
              />
            )}
            {isMinecraftLike && (
              <>
                {field('wizard.gamemode', 'wizard-gamemode',
                  <Select
                    ariaLabel={t('wizard.gamemode')}
                    value={draft.gamemode}
                    disabled={disabled}
                    onValueChange={(value) => update({ gamemode: value as typeof draft.gamemode })}
                    options={GAMEMODES.map((mode) => ({ value: mode, label: t(`wizard.gamemodes.${mode}`) }))}
                  />
                )}
                {field('wizard.difficulty', 'wizard-difficulty',
                  <Select
                    ariaLabel={t('wizard.difficulty')}
                    value={draft.difficulty}
                    disabled={disabled}
                    onValueChange={(value) => update({ difficulty: value as typeof draft.difficulty })}
                    options={DIFFICULTIES.map((level) => ({ value: level, label: t(`wizard.difficulties.${level}`) }))}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}

      <div className="rounded-[6px] border border-hairline">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-[12px] font-medium text-body cursor-pointer"
          aria-expanded={showAdvanced}
        >
          {t('wizard.advanced')}
          <ChevronDown className={cn('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')} />
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 border-t border-hairline p-3">
            {field('create_server.id_label', 'wizard-id',
              <Input
                id="wizard-id"
                value={draft.instanceId}
                disabled={disabled}
                className="font-mono text-[12px]"
                onChange={(e) => update({ instanceId: slugifyInstanceId(e.target.value), idTouched: true })}
              />
            )}
            {!isImport &&
              field('edit_server.port_label', 'wizard-port',
                <div className="space-y-1.5">
                  <NumberInput
                    id="wizard-port"
                    min={1}
                    max={65535}
                    value={draft.port}
                    disabled={disabled}
                    onValueChange={(value) => update({ port: value })}
                  />
                  {(takenByInstance || portInUse) && (
                    <p className="flex items-center gap-1.5 text-[11px] text-warning-fg">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {takenByInstance ? t('wizard.port_taken_instance') : t('wizard.port_in_use')}
                    </p>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};
