import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { GameDriverSummary, ProvisionJobState, ProvisionPhase } from '../../../types/daemon';
import { LOADER_METADATA } from '../../../types/daemon';
import { GameLogo } from '../../common/GameIcons';
import { Button } from '../../ui/Button';
import { bridgeEligible, usesLoaderInstall } from '../wizardPlan';
import { cn } from '../../../utils/cn';
import type { WizardDraft } from '../wizardTypes';
import { Activity } from 'lucide-react';

interface ReviewStepProps {
  draft: WizardDraft;
  game: GameDriverSummary | undefined;
  isBusy: boolean;
  job: ProvisionJobState | null;
  logs: string[];
  error: string | null;
  onCancel: () => void;
  update: (patch: Partial<WizardDraft>) => void;
}

/** Short description of how a provisioned game is installed (e.g. "SteamCMD (unstable)"). */
const provisionLabel = (game: GameDriverSummary | undefined, draft: WizardDraft): string | null => {
  const provision = game?.provision;
  if (!provision || provision.type === 'none') return null;
  if (provision.type === 'download') return 'Download';
  const branch = provision.branchField ? draft.setupValues[provision.branchField] : undefined;
  return branch ? `SteamCMD (${String(branch)})` : 'SteamCMD';
};

const PHASES: ProvisionPhase[] = ['resolve', 'download', 'install', 'configure'];

export const ReviewStep: React.FC<ReviewStepProps> = ({ draft, game, isBusy, job, logs, error, onCancel, update }) => {
  const { t } = useTranslation();
  const isImport = draft.origin === 'import';
  const install = draft.minecraft;
  const usesJar = !LOADER_METADATA[install.loader].isAutomatic || install.useCustomJar;

  const engine = isImport
    ? draft.importInfo?.loader ?? draft.importInfo?.gameId ?? '—'
    : usesLoaderInstall(game)
      ? usesJar
        ? install.jarFile?.name ?? t('create_server.engine_custom_jar')
        : `${LOADER_METADATA[install.loader].name} ${install.version}`
      : provisionLabel(game, draft) ?? t('create_server.engine_native');

  const rows: Array<[string, string]> = [
    [t('create_server.summary_game'), game?.name ?? draft.gameId],
    [t('create_server.summary_engine'), engine],
    ...(isImport
      ? ([[t('wizard.summary_source'), draft.importPath]] as Array<[string, string]>)
      : ([
          [t('create_server.summary_resources'), `${(draft.ramMb / 1024).toFixed(1)} GB`],
          [t('create_server.summary_network'), t('create_server.network_summary', { port: draft.port, max: draft.maxPlayers })]
        ] as Array<[string, string]>))
  ];

  const currentIndex = job ? PHASES.indexOf(job.phase as ProvisionPhase) : -1;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-[8px] border border-hairline bg-surface-2 p-4">
        <div className="flex items-center gap-3 border-b border-hairline pb-3">
          {draft.iconBase64 ? (
            <img src={draft.iconBase64} alt="" className="h-9 w-9 rounded-[4px] [image-rendering:pixelated]" />
          ) : (
            <GameLogo gameId={draft.gameId} size={32} />
          )}
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink">{draft.name}</div>
            <div className="truncate font-mono text-[11px] text-mute">{draft.instanceId}</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-mono text-[11px] uppercase text-mute">{label}</dt>
              <dd className="truncate font-medium text-ink" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {!isBusy && bridgeEligible(draft, game) && (
        <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-hairline bg-surface p-4 hover:border-hairline-strong">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.installBridge}
            onChange={(event) => update({ installBridge: event.target.checked })}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Activity className="h-3.5 w-3.5 text-accent-fg" />
              {t('wizard.bridge_title')}
              <span className="rounded-[4px] bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success-fg">
                {t('wizard.bridge_recommended')}
              </span>
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed text-soft">{t('wizard.bridge_desc')}</span>
            <span className="mt-1 block text-[11px] text-mute">{t('wizard.bridge_later')}</span>
          </span>
        </label>
      )}

      {isBusy && (
        <div className="space-y-3 rounded-[8px] border border-hairline p-4">
          <ol className="space-y-1.5">
            {PHASES.map((phase, index) => {
              const state = !job ? 'pending' : index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
              return (
                <li
                  key={phase}
                  className={cn(
                    'flex items-center gap-2 text-[12px]',
                    state === 'pending' ? 'text-mute' : 'text-ink'
                  )}
                >
                  {state === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" />
                  ) : state === 'active' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-fg" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                  {t(`provisioning.phase.${phase}`)}
                  {state === 'active' && job?.percent != null && phase === 'download' && (
                    <span className="ml-auto font-mono text-mute">{job.percent}%</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn(
                'h-full rounded-full bg-accent transition-all duration-200',
                job?.percent == null && 'w-1/3 animate-pulse'
              )}
              style={job?.percent != null ? { width: `${job.percent}%` } : undefined}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={onCancel}>
              {t('provisioning.cancel_install')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-[6px] border border-danger bg-danger-soft p-3 text-[12px] text-danger-fg">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {logs.length > 0 && (
        <details className="group rounded-[6px] border border-hairline">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] font-medium text-body">
            {t('provisioning.logs_title')}
            <span className="font-mono text-[11px] text-mute">{logs.length}</span>
          </summary>
          <div className="max-h-40 space-y-0.5 overflow-y-auto bg-console p-3 font-mono text-[11px] text-on-dark">
            {logs.map((line, index) => (
              <div key={index} className="break-all">
                {line}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
