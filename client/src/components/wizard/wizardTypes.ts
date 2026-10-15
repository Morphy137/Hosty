import type { FolderInspection, GameDriverSummary, JarInspection, ServerLoader } from '../../types/daemon';

export type WizardOrigin = 'create' | 'import';
export type WizardStepId = 'origin' | 'game' | 'setup' | 'customize' | 'review' | 'done';

export const CREATE_STEPS: WizardStepId[] = ['game', 'origin', 'setup', 'customize', 'review'];
export const IMPORT_STEPS: WizardStepId[] = ['game', 'origin', 'customize', 'review'];

export type SetupValue = string | number | boolean;

export interface MinecraftInstallDraft {
  loader: ServerLoader;
  version: string;
  /** User chose "use my own .jar" instead of downloading. */
  useCustomJar: boolean;
  jarFile: File | null;
  jarInspection: JarInspection | null;
}

export interface WizardDraft {
  origin: WizardOrigin;
  gameId: string;
  importPath: string;
  importInfo: FolderInspection | null;
  setupValues: Record<string, SetupValue>;
  minecraft: MinecraftInstallDraft;
  name: string;
  instanceId: string;
  idTouched: boolean;
  motd: string;
  maxPlayers: number;
  port: number;
  ramMb: number;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  iconBase64: string | null;
  /** Install the Telemetry Bridge right after creation (when the loader supports it). */
  installBridge: boolean;
}

export const INITIAL_DRAFT: WizardDraft = {
  origin: 'create',
  gameId: 'minecraft',
  importPath: '',
  importInfo: null,
  setupValues: {},
  minecraft: { loader: 'paper', version: '', useCustomJar: false, jarFile: null, jarInspection: null },
  name: '',
  instanceId: '',
  idTouched: false,
  motd: '',
  maxPlayers: 20,
  port: 25565,
  ramMb: 4096,
  gamemode: 'survival',
  difficulty: 'normal',
  iconBase64: null,
  installBridge: true
};

export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

/** Everything a custom setup component (registered by key) needs to render and validate itself. */
export interface CustomSetupProps extends StepProps {
  game: GameDriverSummary;
  javaMajor: number | null | undefined;
  /** Reported by the component so the wizard can enable/disable "Continue". */
  onValidityChange: (valid: boolean) => void;
}

export const slugifyInstanceId = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
