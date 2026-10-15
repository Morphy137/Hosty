// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../src/i18n';
import { CreateServerWizard, type WizardActions } from '../src/components/wizard/CreateServerWizard';
import { TooltipProvider } from '../src/components/ui/Tooltip';
import { ToastProvider } from '../src/components/ui/Toast';
import type { GameDriverSummary } from '../src/types/daemon';

vi.mock('../src/api/daemonApi', async () => {
  const actual = await vi.importActual<typeof import('../src/api/daemonApi')>('../src/api/daemonApi');
  return {
    ...actual,
    fetchSystemEnvironment: vi.fn().mockResolvedValue({
      java: { detected: true, majorVersion: 21, versionString: 'openjdk 21', path: 'java', recommended: true, downloadUrl: '' },
      platform: 'win32',
      arch: 'x64',
      nodeVersion: 'v22',
      totalMemMb: 16384
    }),
    fetchLoaderVersions: vi.fn().mockResolvedValue(['1.21.1', '1.20.4']),
    inspectServerJar: vi.fn(),
    inspectFolder: vi.fn().mockResolvedValue({
      path: 'C:/servers/old',
      suggestedName: 'old',
      gameId: 'minecraft',
      loader: 'paper',
      mcVersion: '1.21.1',
      port: 25570,
      motd: 'Old server',
      maxPlayers: 8
    }),
    isPortInUse: vi.fn().mockResolvedValue(false),
    uploadInstanceIcon: vi.fn().mockResolvedValue({ ok: true }),
    saveConfigEntries: vi.fn().mockResolvedValue(undefined)
  };
});

const baseGame: GameDriverSummary = {
  id: 'minecraft',
  name: 'Minecraft: Java Edition',
  category: 'voxel',
  defaultPort: 25565,
  defaultMaxPlayers: 20,
  executableName: 'server.jar',
  supportsMods: true,
  modFormat: 'JAR',
  supportsCustomJava: true,
  configFileName: 'server.properties',
  badge: 'MC',
  description: 'Mojang, Fabric, Paper',
  status: 'available',
  setupSchema: [{ id: 'install', type: 'custom', labelKey: 'x', component: 'minecraft-install' }],
  capabilities: { players: true, mods: true, configEditor: true, bridge: true },
  configFiles: [{ path: 'server.properties', format: 'properties' }],
  configSync: { file: 'server.properties', format: 'properties', map: { port: 'server-port', motd: 'motd', maxPlayers: 'max-players' } },
  source: 'builtin',
  hasLogo: false
};

const zomboid: GameDriverSummary = {
  ...baseGame,
  id: 'project-zomboid',
  name: 'Project Zomboid',
  status: 'beta',
  configFileName: 'servertest.ini',
  configSync: undefined,
  setupSchema: [
    {
      id: 'pzBranch',
      type: 'select',
      label: { en: 'SteamCMD branch' },
      default: 'stable',
      options: [{ value: 'stable', label: { en: 'Public release' } }]
    }
  ],
  provision: { type: 'steamcmd', appId: 380870 }
};

const hytale: GameDriverSummary = { ...baseGame, id: 'hytale', name: 'Hytale', status: 'coming_soon', setupSchema: [] };

function makeActions(): WizardActions {
  return {
    install: vi.fn().mockResolvedValue(undefined),
    uploadJar: vi.fn().mockResolvedValue(undefined),
    createInstance: vi.fn().mockResolvedValue('zomboid-server'),
    importInstance: vi.fn().mockResolvedValue('old')
  };
}

function renderWizard(actions: WizardActions, origin: 'create' | 'import' = 'create') {
  const onFinish = vi.fn();
  render(
    <TooltipProvider>
      <ToastProvider>
        <CreateServerWizard
          isOpen
          initialOrigin={origin}
          onClose={vi.fn()}
          games={[baseGame, zomboid, hytale]}
          instances={[]}
          actions={actions}
          provisionLogs={[]}
          provisionJob={null}
          onCancelInstall={vi.fn()}
          onFinish={onFinish}
        />
      </ToastProvider>
    </TooltipProvider>
  );
  return { onFinish };
}

describe('CreateServerWizard', () => {
  beforeEach(() => {
    // Radix primitives expect these browser APIs.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => cleanup());

  it('keeps Continue disabled on a game that is not available yet', async () => {
    const user = userEvent.setup();
    renderWizard(makeActions());

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    const hytaleButton = await screen.findByRole('button', { name: /Hytale/ });
    expect(hytaleButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /Minecraft: Java Edition/ })).toBeEnabled();
  });

  it('creates a Steam-provisioned game from its schema without Minecraft-specific code', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    renderWizard(actions);

    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Project Zomboid/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Setup step comes straight from the driver's setupSchema.
    expect(await screen.findByText('SteamCMD branch')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const name = await screen.findByLabelText('Server Name');
    await user.clear(name);
    await user.type(name, 'Knox Survivors');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(await screen.findByRole('button', { name: /Create & Install Server/ }));

    await waitFor(() => expect(actions.createInstance).toHaveBeenCalledTimes(1));
    const [id, displayName, settings] = (actions.createInstance as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('knox-survivors');
    expect(displayName).toBe('Knox Survivors');
    expect(settings).toMatchObject({ gameId: 'project-zomboid', gameConfig: { pzBranch: 'stable' } });
    expect(await screen.findByText(/Knox Survivors is ready/)).toBeInTheDocument();
  });

  it('imports a folder after detecting its game', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    renderWizard(actions, 'import');

    const dialog = await screen.findByRole('dialog');
    // The wizard starts at the game step; the folder is then checked against the chosen game.
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const input = await within(dialog).findByLabelText('Server Folder Path');
    await user.type(input, 'C:/servers/old');
    await user.tab();

    expect(await within(dialog).findByText(/Detected: minecraft/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await user.click(within(dialog).getByRole('button', { name: 'Import Server' }));

    await waitFor(() => expect(actions.importInstance).toHaveBeenCalledWith('C:/servers/old', 'old', 'minecraft'));
  });
});
