import { describe, it, expect } from 'vitest';
import { buildCreationPlan, buildInstanceSettings } from '../src/components/wizard/wizardPlan';
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
  setupSchema: [{ id: 'install', type: 'custom', labelKey: 'x', component: 'minecraft-install' }],
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
  loaderInstall: { loader: 'fabric', version: '1.21.1', useCustomJar: false, jarFile: null, jarInspection: null }
};

describe('buildCreationPlan', () => {
  it('installs automatic loaders from a version', () => {
    const plan = buildCreationPlan(baseDraft, minecraft);
    expect(plan).toMatchObject({ kind: 'install', loader: 'fabric', version: '1.21.1', instanceId: 'my-server' });
    if (plan.kind === 'install') {
      expect(plan.settings).toMatchObject({ maxRamMb: 8192, minRamMb: 2048, motd: '§aHello', gameId: 'minecraft' });
    }
  });

  it('uploads when the user brings their own jar, keeping the detected version', () => {
    const file = new File(['x'], 'neoforge-installer.jar');
    const plan = buildCreationPlan(
      {
        ...baseDraft,
        loaderInstall: {
          loader: 'neoforge',
          version: '',
          useCustomJar: true,
          jarFile: file,
          jarInspection: { loader: 'neoforge', mcVersion: '1.21.1', loaderVersion: '21.1.172', kind: 'installer' }
        }
      },
      minecraft
    );
    expect(plan).toMatchObject({ kind: 'upload', loader: 'neoforge', loaderVersion: '1.21.1' });
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
});
