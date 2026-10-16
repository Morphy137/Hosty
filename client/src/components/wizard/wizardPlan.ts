import type { GameDriverSummary, InstanceSettings } from '../../types/daemon';
import { defaultMinRamMb } from '../../utils/ram';
import type { WizardDraft } from './wizardTypes';

export type CreationPlan =
  | { kind: 'import'; path: string; name: string; gameId: string }
  | {
      kind: 'install';
      variant: string;
      version: string;
      build: string;
      instanceId: string;
      name: string;
      settings: Partial<InstanceSettings>;
    }
  | {
      kind: 'upload';
      file: File;
      variant?: string;
      gameVersion?: string;
      instanceId: string;
      name: string;
      settings: Partial<InstanceSettings>;
    }
  | { kind: 'create'; instanceId: string; name: string; settings: Partial<InstanceSettings> };

/** The game's extension installs its server software (variant / version / own file). */
export const usesInstaller = (game: GameDriverSummary | undefined): boolean => Boolean(game?.installer?.variants.length);

/** Variant the draft resolves to: the chosen one, else the game's default, else its first. */
export const selectedVariant = (draft: WizardDraft, game: GameDriverSummary | undefined) => {
  const variants = game?.installer?.variants ?? [];
  return (
    variants.find((variant) => variant.id === draft.install.variant) ??
    variants.find((variant) => variant.id === game?.installer?.defaultVariant) ??
    variants[0]
  );
};

/** The game has a message of the day (its config sync maps one). */
export const hasMotd = (game: GameDriverSummary | undefined): boolean => Boolean(game?.configSync?.map.motd);

/** Derives the instance settings shared by every creation path from the wizard draft. */
export function buildInstanceSettings(draft: WizardDraft, game: GameDriverSummary | undefined): Partial<InstanceSettings> {
  const gameConfig = Object.keys(draft.setupValues).length > 0 ? { ...draft.setupValues } : undefined;

  return {
    gameId: draft.gameId,
    port: draft.port,
    maxPlayers: draft.maxPlayers,
    minRamMb: defaultMinRamMb(draft.ramMb),
    maxRamMb: draft.ramMb,
    ...(hasMotd(game) && draft.motd.trim() ? { motd: draft.motd.trim() } : {}),
    ...(gameConfig ? { gameConfig } : {})
  };
}

/** Decides which daemon operation creates the server described by the draft. */
export function buildCreationPlan(draft: WizardDraft, game: GameDriverSummary | undefined): CreationPlan {
  const name = draft.name.trim();

  if (draft.origin === 'import') {
    return { kind: 'import', path: draft.importPath.trim(), name, gameId: draft.gameId };
  }

  const settings = buildInstanceSettings(draft, game);

  const variant = selectedVariant(draft, game);
  if (usesInstaller(game) && variant) {
    const { install } = draft;
    const usesFile = !variant.automatic || install.useOwnFile;

    if (usesFile && install.file) {
      return {
        kind: 'upload',
        file: install.file,
        variant: install.fileInfo?.variant ?? variant.id,
        gameVersion: install.fileInfo?.gameVersion ?? undefined,
        instanceId: draft.instanceId,
        name,
        settings
      };
    }
    return {
      kind: 'install',
      variant: variant.id,
      version: install.version,
      build: install.build,
      instanceId: draft.instanceId,
      name,
      settings
    };
  }

  return { kind: 'create', instanceId: draft.instanceId, name, settings };
}

/** True when a Telemetry Bridge exists (`bridgeLoaders`) for what this wizard run will produce. */
export const bridgeEligible = (draft: WizardDraft, game: GameDriverSummary | undefined): boolean => {
  if (!game?.capabilities.bridge) return false;
  const variant =
    draft.origin === 'import'
      ? draft.importInfo?.variant
      : usesInstaller(game)
        ? (draft.install.fileInfo?.variant ?? selectedVariant(draft, game)?.id)
        : null;
  return Boolean(variant && game.bridgeLoaders?.includes(variant));
};
