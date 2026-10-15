import type { GameDriverSummary, InstanceSettings, ServerLoader } from '../../types/daemon';
import { LOADER_METADATA } from '../../types/daemon';
import { defaultMinRamMb } from '../../utils/ram';
import type { WizardDraft } from './wizardTypes';

export type CreationPlan =
  | { kind: 'import'; path: string; name: string; gameId: string }
  | {
      kind: 'install';
      loader: ServerLoader;
      version: string;
      instanceId: string;
      name: string;
      settings: Partial<InstanceSettings>;
    }
  | {
      kind: 'upload';
      file: File;
      loader: ServerLoader;
      loaderVersion?: string;
      instanceId: string;
      name: string;
      settings: Partial<InstanceSettings>;
    }
  | { kind: 'create'; instanceId: string; name: string; settings: Partial<InstanceSettings> };

/** The game installs through the loader/version/own-jar flow (a driver-requested custom setup component). */
export const usesLoaderInstall = (game: GameDriverSummary | undefined): boolean =>
  game?.setupSchema.some((field) => field.component === 'minecraft-install') ?? false;

/** Derives the instance settings shared by every creation path from the wizard draft. */
export function buildInstanceSettings(draft: WizardDraft, game: GameDriverSummary | undefined): Partial<InstanceSettings> {
  const isMinecraftLike = Boolean(game?.configSync);
  const gameConfig = Object.keys(draft.setupValues).length > 0 ? { ...draft.setupValues } : undefined;

  return {
    gameId: draft.gameId,
    port: draft.port,
    maxPlayers: draft.maxPlayers,
    minRamMb: defaultMinRamMb(draft.ramMb),
    maxRamMb: draft.ramMb,
    ...(isMinecraftLike && draft.motd.trim() ? { motd: draft.motd.trim() } : {}),
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

  if (usesLoaderInstall(game)) {
    const { loaderInstall } = draft;
    const usesJar = !LOADER_METADATA[loaderInstall.loader].isAutomatic || loaderInstall.useCustomJar;

    if (usesJar && loaderInstall.jarFile) {
      return {
        kind: 'upload',
        file: loaderInstall.jarFile,
        loader: loaderInstall.loader,
        loaderVersion: loaderInstall.jarInspection?.mcVersion ?? undefined,
        instanceId: draft.instanceId,
        name,
        settings
      };
    }
    return {
      kind: 'install',
      loader: loaderInstall.loader,
      version: loaderInstall.version,
      instanceId: draft.instanceId,
      name,
      settings
    };
  }

  return { kind: 'create', instanceId: draft.instanceId, name, settings };
}

const BRIDGE_LOADERS = ['paper', 'purpur', 'spigot', 'fabric'];

/** True when a Telemetry Bridge can be installed for what this wizard run will produce. */
export const bridgeEligible = (draft: WizardDraft, game: GameDriverSummary | undefined): boolean => {
  if (!game?.capabilities.bridge) return false;
  const loader = draft.origin === 'import' ? draft.importInfo?.loader : usesLoaderInstall(game) ? draft.loaderInstall.loader : null;
  return Boolean(loader && BRIDGE_LOADERS.includes(loader));
};
