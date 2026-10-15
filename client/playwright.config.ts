import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { defineConfig, devices } from '@playwright/test';

const DAEMON_PORT = 4110;
const CLIENT_PORT = 5190;
const STATE_DIR = path.resolve(here, 'e2e', '.tmp');

// Fresh daemon state for every run (the config is also evaluated inside workers: only wipe in the runner).
if (!process.env.TEST_WORKER_INDEX) {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: 'npm --prefix ../daemon run dev',
      url: `http://127.0.0.1:${DAEMON_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        MC_NEXUS_PORT: String(DAEMON_PORT),
        MC_NEXUS_INSTANCE_DIR: path.join(STATE_DIR, 'instances', 'default'),
        MC_NEXUS_GAMES_DIR: path.join(STATE_DIR, 'games'),
        MC_NEXUS_ENABLE_MOCK: 'true'
      }
    },
    {
      command: `npx vite --port ${CLIENT_PORT} --strictPort`,
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_DAEMON_URL: `http://localhost:${DAEMON_PORT}` }
    }
  ]
});
