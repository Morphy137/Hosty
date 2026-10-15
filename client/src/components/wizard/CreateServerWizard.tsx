import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, FolderInput, Play, PanelRight } from 'lucide-react';
import type {
  GameDriverSummary,
  InstanceInfo,
  InstanceSettings,
  ProvisionJobState,
  ServerLoader
} from '../../types/daemon';
import { fetchSystemEnvironment, saveServerProperties, uploadInstanceIcon } from '../../api/daemonApi';
import { recommendedRamMb } from '../../utils/ram';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Stepper } from '../ui/Stepper';
import { useToast } from '../ui/toastContext';
import { OriginStep } from './steps/OriginStep';
import { GameStep } from './steps/GameStep';
import { SetupStep } from './steps/SetupStep';
import { CustomizeStep } from './steps/CustomizeStep';
import { ReviewStep } from './steps/ReviewStep';
import { DoneStep } from './steps/DoneStep';
import { buildCreationPlan } from './wizardPlan';
import {
  CREATE_STEPS,
  IMPORT_STEPS,
  INITIAL_DRAFT,
  slugifyInstanceId,
  type WizardDraft,
  type WizardOrigin,
  type WizardStepId
} from './wizardTypes';

export interface WizardActions {
  install: (params: {
    loader: ServerLoader;
    version: string;
    instanceId: string;
    instanceName: string;
    settings?: Partial<InstanceSettings>;
  }) => Promise<void>;
  uploadJar: (params: {
    file: File;
    instanceId: string;
    instanceName: string;
    settings?: Partial<InstanceSettings>;
    loader?: ServerLoader;
    loaderVersion?: string;
  }) => Promise<void>;
  createInstance: (id: string, name: string, settings: Partial<InstanceSettings>) => Promise<string>;
  importInstance: (path: string, name?: string, gameId?: string) => Promise<string>;
}

interface CreateServerWizardProps {
  isOpen: boolean;
  initialOrigin: WizardOrigin;
  onClose: () => void;
  games: GameDriverSummary[];
  instances: InstanceInfo[];
  actions: WizardActions;
  provisionLogs: string[];
  provisionJob: ProvisionJobState | null;
  onCancelInstall: () => void;
  /** Called from the final step; `start` requests an immediate server start. */
  onFinish: (instanceId: string, start: boolean) => void;
}

const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -28 })
};

function nextFreePort(base: number, instances: InstanceInfo[]): number {
  const used = new Set(instances.map((instance) => instance.port));
  let candidate = base;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export const CreateServerWizard: React.FC<CreateServerWizardProps> = ({
  isOpen,
  initialOrigin,
  onClose,
  games,
  instances,
  actions,
  provisionLogs,
  provisionJob,
  onCancelInstall,
  onFinish
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [draft, setDraft] = useState<WizardDraft>(INITIAL_DRAFT);
  const [step, setStep] = useState<WizardStepId>('game');
  const [direction, setDirection] = useState(1);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [setupValid, setSetupValid] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [javaMajor, setJavaMajor] = useState<number | null | undefined>(undefined);
  const [systemRamMb, setSystemRamMb] = useState<number | undefined>(undefined);
  const wasOpen = useRef(false);

  const game = useMemo(() => games.find((candidate) => candidate.id === draft.gameId), [games, draft.gameId]);
  const steps = draft.origin === 'import' ? IMPORT_STEPS : CREATE_STEPS;
  const stepIndex = Math.max(0, steps.indexOf(step));

  const update = useCallback((patch: Partial<WizardDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  // Reset to a fresh draft every time the wizard opens.
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      const minecraft = games.find((candidate) => candidate.status === 'available') ?? games[0];
      setDraft({
        ...INITIAL_DRAFT,
        origin: initialOrigin,
        port: nextFreePort(minecraft?.defaultPort ?? INITIAL_DRAFT.port, instances),
        maxPlayers: minecraft?.defaultMaxPlayers ?? INITIAL_DRAFT.maxPlayers
      });
      setStep('game');
      setDirection(1);
      setIsBusy(false);
      setError(null);
      setWarning(null);
      setCreatedId(null);
      setInspectError(null);
    }
    wasOpen.current = isOpen;
  }, [isOpen, initialOrigin, games, instances]);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    fetchSystemEnvironment()
      .then((env) => {
        if (ignore) return;
        setJavaMajor(env.java.detected ? env.java.majorVersion : null);
        if (env.totalMemMb) {
          setSystemRamMb(env.totalMemMb);
          setDraft((current) => ({ ...current, ramMb: recommendedRamMb(env.totalMemMb) }));
        }
      })
      .catch(() => {
        // Environment details only refine suggestions.
      });
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  const handleSelectGame = (selected: GameDriverSummary) => {
    const defaults: Record<string, string | number | boolean> = {};
    for (const field of selected.setupSchema) {
      if (field.default !== undefined) defaults[field.id] = field.default;
    }
    const shortName = selected.name.split(':')[0].trim();
    const name = t('wizard.default_name', { game: shortName });
    update({
      gameId: selected.id,
      setupValues: defaults,
      name,
      instanceId: slugifyInstanceId(name),
      idTouched: false,
      motd: t('wizard.default_motd', { game: shortName }),
      port: nextFreePort(selected.defaultPort, instances),
      maxPlayers: selected.defaultMaxPlayers
    });
  };

  const goTo = (target: WizardStepId, dir: number) => {
    setDirection(dir);
    setError(null);
    setStep(target);
  };

  const canContinue = (() => {
    switch (step) {
      case 'origin':
        return draft.origin === 'create' || (draft.importInfo?.gameId === draft.gameId && !isInspecting);
      case 'game':
        return game !== undefined && game.status !== 'coming_soon';
      case 'setup':
        return setupValid;
      case 'customize':
        return Boolean(draft.name.trim() && draft.instanceId && draft.port > 0 && draft.maxPlayers > 0);
      default:
        return true;
    }
  })();

  const handleNext = () => {
    const next = steps[stepIndex + 1];
    if (next) goTo(next, 1);
  };

  const handleBack = () => {
    const previous = steps[stepIndex - 1];
    if (previous) goTo(previous, -1);
  };

  const handleCreate = async () => {
    setIsBusy(true);
    setError(null);
    setWarning(null);

    try {
      const plan = buildCreationPlan(draft, game);
      let instanceId: string;

      switch (plan.kind) {
        case 'import':
          instanceId = await actions.importInstance(plan.path, plan.name, plan.gameId);
          break;
        case 'install':
          await actions.install({
            loader: plan.loader,
            version: plan.version,
            instanceId: plan.instanceId,
            instanceName: plan.name,
            settings: plan.settings
          });
          instanceId = plan.instanceId;
          break;
        case 'upload':
          await actions.uploadJar({
            file: plan.file,
            instanceId: plan.instanceId,
            instanceName: plan.name,
            settings: plan.settings,
            loader: plan.loader,
            loaderVersion: plan.loaderVersion
          });
          instanceId = plan.instanceId;
          break;
        default:
          instanceId = await actions.createInstance(plan.instanceId, plan.name, plan.settings);
      }

      // Cosmetic extras never fail the whole creation.
      const problems: string[] = [];
      if (draft.iconBase64) {
        try {
          await uploadInstanceIcon(instanceId, draft.iconBase64);
        } catch {
          problems.push(t('wizard.warn_icon'));
        }
      }
      if (draft.origin === 'create' && game?.configFileName === 'server.properties' && plan.kind !== 'create') {
        try {
          await saveServerProperties([
            { key: 'gamemode', value: draft.gamemode, type: 'string' },
            { key: 'difficulty', value: draft.difficulty, type: 'string' }
          ]);
        } catch {
          problems.push(t('wizard.warn_properties'));
        }
      }

      setCreatedId(instanceId);
      setWarning(problems.length > 0 ? problems.join(' ') : null);
      goTo('done', 1);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'INSTALL_CANCELLED') {
        setError(err instanceof Error ? err.message : String(err));
      } else {
        toast({ title: t('wizard.cancelled'), variant: 'info' });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinish = (start: boolean) => {
    if (createdId) onFinish(createdId, start);
    onClose();
  };

  const stepLabels = steps.map((id) => ({ id, label: t(`wizard.steps.${id}`) }));
  const isDone = step === 'done';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      dismissible={!isBusy}
      title={draft.origin === 'import' ? t('import_server.modal_title') : t('create_server.modal_title')}
      description={isDone ? undefined : t(`wizard.step_desc.${step}`)}
      footer={
        isDone ? (
          <>
            <Button variant="secondary" onClick={() => handleFinish(false)} leadingIcon={<PanelRight className="h-3.5 w-3.5" />}>
              {t('wizard.open_panel')}
            </Button>
            <Button variant="primary" onClick={() => handleFinish(true)} leadingIcon={<Play className="h-3 w-3 fill-current" />}>
              {t('wizard.start_now')}
            </Button>
          </>
        ) : (
          <>
            {stepIndex > 0 ? (
              <Button variant="secondary" disabled={isBusy} onClick={handleBack} leadingIcon={<ChevronLeft className="h-4 w-4" />}>
                {t('create_server.back_button')}
              </Button>
            ) : (
              <Button variant="secondary" disabled={isBusy} onClick={onClose}>
                {t('common.cancel')}
              </Button>
            )}
            {step === 'review' ? (
              <Button
                variant="primary"
                loading={isBusy}
                onClick={handleCreate}
                leadingIcon={
                  isBusy ? undefined : draft.origin === 'import' ? (
                    <FolderInput className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )
                }
              >
                {isBusy
                  ? t('provisioning.installing')
                  : draft.origin === 'import'
                    ? t('import_server.submit_button')
                    : t('create_server.submit_button')}
              </Button>
            ) : (
              <Button variant="primary" disabled={!canContinue} onClick={handleNext}>
                {t('create_server.continue_button')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-5">
        {!isDone && (
          <Stepper
            steps={stepLabels}
            current={stepIndex}
            disabled={isBusy}
            onSelect={(index) => goTo(steps[index], -1)}
          />
        )}

        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {step === 'origin' && (
                <OriginStep
                  draft={draft}
                  update={update}
                  disabled={isBusy}
                  isInspecting={isInspecting}
                  setIsInspecting={setIsInspecting}
                  inspectError={inspectError}
                  setInspectError={setInspectError}
                />
              )}
              {step === 'game' && (
                <GameStep draft={draft} update={update} disabled={isBusy} games={games} onSelectGame={handleSelectGame} />
              )}
              {step === 'setup' && game && (
                <SetupStep
                  game={game}
                  draft={draft}
                  update={update}
                  disabled={isBusy}
                  javaMajor={javaMajor}
                  onValidityChange={setSetupValid}
                />
              )}
              {step === 'customize' && (
                <CustomizeStep
                  draft={draft}
                  update={update}
                  disabled={isBusy}
                  game={game}
                  instances={instances}
                  systemRamMb={systemRamMb}
                />
              )}
              {step === 'review' && (
                <ReviewStep
                  draft={draft}
                  game={game}
                  isBusy={isBusy}
                  job={provisionJob}
                  logs={provisionLogs}
                  error={error}
                  onCancel={onCancelInstall}
                />
              )}
              {isDone && <DoneStep name={draft.name} warning={warning} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Dialog>
  );
};
