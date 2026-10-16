import type { FolderInspection, GameDriverSummary, InstallFileInfo } from '../../types/daemon';

export type WizardOrigin = 'create' | 'import';
export type WizardStepId = 'origin' | 'game' | 'setup' | 'customize' | 'review' | 'done';

export const CREATE_STEPS: WizardStepId[] = ['game', 'origin', 'setup', 'customize', 'review'];
export const IMPORT_STEPS: WizardStepId[] = ['game', 'origin', 'customize', 'review'];

export type SetupValue = string | number | boolean;

/** Choices of the installer step (games whose extension declares an `installer`). */
export interface InstallDraft {
  /** Installer variant id (e.g. a mod loader); empty until the step picks the game's default. */
  variant: string;
  version: string;
  /** Loader build chosen for `version`; empty = the latest one. */
  build: string;
  /** User chose to bring their own server file instead of downloading. */
  useOwnFile: boolean;
  file: File | null;
  fileInfo: InstallFileInfo | null;
}

export interface WizardDraft {
  origin: WizardOrigin;
  gameId: string;
  importPath: string;
  importInfo: FolderInspection | null;
  setupValues: Record<string, SetupValue>;
  install: InstallDraft;
  name: string;
  instanceId: string;
  idTouched: boolean;
  motd: string;
  maxPlayers: number;
  port: number;
  ramMb: number;
  /** Values of the game's `creationSettings`, written to its config files after creation. */
  creationValues: Record<string, string>;
  iconBase64: string | null;
  /** Install the Telemetry Bridge right after creation (when the variant supports it). */
  installBridge: boolean;
}

export const INITIAL_DRAFT: WizardDraft = {
  origin: 'create',
  gameId: '',
  importPath: '',
  importInfo: null,
  setupValues: {},
  install: { variant: '', version: '', build: '', useOwnFile: false, file: null, fileInfo: null },
  name: '',
  instanceId: '',
  idTouched: false,
  motd: '',
  maxPlayers: 1,
  port: 0,
  ramMb: 4096,
  creationValues: {},
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
