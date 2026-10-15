import { describe, it, expect } from 'vitest';
import { bridgeEligible, buildCreationPlan, buildInstanceSettings } from '../src/components/wizard/wizardPlan';
import { INITIAL_DRAFT, slugifyInstanceId, type WizardDraft } from '../src/components/wizard/wizardTypes';
import type { GameDriverSummary } from '../src/types/daemon';

const minecraft: GameDriverSummary = {
  id: 'minecraft',
  name: 'Minecraft',
  category: 'voxel',
  defaultPort: 25565,
  defaultMaxPlayers: 20,
  executableName: 'server.jar',
  supportsMods: true,
  modFormat: 'JAR',
  supportsCustomJava: true,
  configFileName: 'server.properties',
  badge: 'MC',
  description: '',
  status: 'available',
  setupSchema: [{ id: 'install', type: 'custom', labelKey: 'x', component: 'installer' }],
  installer: {
    variants: [
      { id: 'fabric', name: 'Fabric', automatic: true },
      { id: 'neoforge', name: 'NeoForge', automatic: true },
      { id: 'spigot', name: 'SpigotMC', automatic: false }
    ],
    defaultVariant: 'fabric'
  },
  bridgeLoaders: ['fabric'],
  capabilities: { players: true, mods: true, configEditor: true, bridge: true },
  configFiles: [{ path: 'server.properties', format: 'properties' }],
  configSync: { file: 'server.properties', format: 'properties', map: { port: 'server-port', motd: 'motd', maxPlayers: 'max-players' } },
  source: 'builtin',
  hasLogo: false
};

const baseDraft: WizardDraft = {
  ...INITIAL_DRAFT,
  gameId: 'minecraft',
  name: 'My Server',
  instanceId: 'my-server',
  motd: '§aHello',
  ramMb: 8192,
  install: { variant: 'fabric', version: '1.21.1', useOwnFile: false, file: null, fileInfo: null }
};

describe('buildCreationPlan', () => {
  it('installs automatic variants from a version', () => {
    const plan = buildCreationPlan(baseDraft, minecraft);
    expect(plan).toMatchObject({ kind: 'install', variant: 'fabric', version: '1.21.1', instanceId: 'my-server' });
    if (plan.kind === 'install') {
      expect(plan.settings).toMatchObject({ maxRamMb: 8192, minRamMb: 2048, motd: '§aHello', gameId: 'minecraft' });
    }
  });

  it('uploads when the user brings their own file, keeping the detected version', () => {
    const file = new File(['x'], 'neoforge-installer.jar');
    const plan = buildCreationPlan(
      {
        ...baseDraft,
        install: {
          variant: 'neoforge',
          version: '',
          useOwnFile: true,
          file,
          fileInfo: { variant: 'neoforge', gameVersion: '1.21.1', variantVersion: '21.1.172', kind: 'installer' }
        }
      },
      minecraft
    );
    expect(plan).toMatchObject({ kind: 'upload', variant: 'neoforge', gameVersion: '1.21.1' });
  });

  it('falls back to the default variant and requires a file for manual ones', () => {
    const empty = { ...baseDraft, install: { ...baseDraft.install, variant: '' } };
    expect(buildCreationPlan(empty, minecraft)).toMatchObject({ kind: 'install', variant: 'fabric' });
    const file = new File(['x'], 'spigot.jar');
    const manual = { ...baseDraft, install: { ...baseDraft.install, variant: 'spigot', file } };
    expect(buildCreationPlan(manual, minecraft)).toMatchObject({ kind: 'upload', variant: 'spigot' });
  });

  it('imports an existing folder', () => {
    const plan = buildCreationPlan({ ...baseDraft, origin: 'import', importPath: ' C:\\Servers\\old ' }, minecraft);
    expect(plan).toEqual({ kind: 'import', path: 'C:\\Servers\\old', name: 'My Server', gameId: 'minecraft' });
  });

  it('creates non-Minecraft instances directly and forwards the schema values', () => {
    const zomboid: GameDriverSummary = {
      ...minecraft,
      id: 'project-zomboid',
      configFileName: 'servertest.ini',
      configSync: undefined,
      installer: undefined,
      setupSchema: [],
      provision: { type: 'steamcmd', appId: 380870 }
    };
    const plan = buildCreationPlan(
      { ...baseDraft, gameId: 'project-zomboid', setupValues: { pzBranch: 'unstable' } },
      zomboid
    );
    expect(plan.kind).toBe('create');
    if (plan.kind === 'create') {
      expect(plan.settings).toMatchObject({ gameConfig: { pzBranch: 'unstable' } });
      expect(plan.settings.motd).toBeUndefined();
    }
  });
});

describe('wizard helpers', () => {
  it('slugifies instance ids', () => {
    expect(slugifyInstanceId('  My Cool Server!! ')).toBe('my-cool-server');
    expect(slugifyInstanceId('Ñandú__World')).toBe('nandu__world');
  });

  it('omits empty game config', () => {
    expect(buildInstanceSettings(baseDraft, minecraft).gameConfig).toBeUndefined();
  });

  it('offers the bridge only for variants the game has one for', () => {
    expect(bridgeEligible(baseDraft, minecraft)).toBe(true);
    expect(bridgeEligible({ ...baseDraft, install: { ...baseDraft.install, variant: 'neoforge' } }, minecraft)).toBe(false);
  });
});
