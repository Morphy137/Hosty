import type { GameDriverSummary, InstanceSettings, ServerLoader } from '../../types/daemon';
import { LOADER_METADATA } from '../../types/daemon';
import { defaultMinRamMb } from '../../utils/ram';
import type { WizardDraft } from './wizardTypes';

export type CreationPlan =
  | { kind: 'import'; path: string; name: string }
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

/** Derives the instance settings shared by every creation path from the wizard draft. */
export function buildInstanceSettings(draft: WizardDraft, game: GameDriverSummary | undefined): Partial<InstanceSettings> {
  const isMinecraftLike = game?.configFileName === 'server.properties';
  const gameConfig = Object.keys(draft.setupValues).length > 0 ? { ...draft.setupValues } : undefined;
  const branch = draft.setupValues.pzBranch;

  return {
    gameId: draft.gameId,
    port: draft.port,
    maxPlayers: draft.maxPlayers,
    minRamMb: defaultMinRamMb(draft.ramMb),
    maxRamMb: draft.ramMb,
    ...(isMinecraftLike && draft.motd.trim() ? { motd: draft.motd.trim() } : {}),
    ...(gameConfig ? { gameConfig } : {}),
    ...(branch === 'stable' || branch === 'unstable' ? { pzBranch: branch } : {})
  };
}

/** Decides which daemon operation creates the server described by the draft. */
export function buildCreationPlan(draft: WizardDraft, game: GameDriverSummary | undefined): CreationPlan {
  const name = draft.name.trim();

  if (draft.origin === 'import') {
    return { kind: 'import', path: draft.importPath.trim(), name };
  }

  const settings = buildInstanceSettings(draft, game);

  if (draft.gameId === 'minecraft') {
    const { minecraft } = draft;
    const usesJar = !LOADER_METADATA[minecraft.loader].isAutomatic || minecraft.useCustomJar;

    if (usesJar && minecraft.jarFile) {
      return {
        kind: 'upload',
        file: minecraft.jarFile,
        loader: minecraft.loader,
        loaderVersion: minecraft.jarInspection?.mcVersion ?? undefined,
        instanceId: draft.instanceId,
        name,
        settings
      };
    }
    return {
      kind: 'install',
      loader: minecraft.loader,
      version: minecraft.version,
      instanceId: draft.instanceId,
      name,
      settings
    };
  }

  return { kind: 'create', instanceId: draft.instanceId, name, settings };
}
