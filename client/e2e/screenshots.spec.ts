import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { expect, test, type Page } from '@playwright/test';

// Regenerates docs/screenshots. Run with `npm run screenshots` (sets HOSTY_SCREENSHOTS=1).
test.skip(!process.env.HOSTY_SCREENSHOTS, 'Only runs when regenerating documentation screenshots');
test.describe.configure({ mode: 'serial' });

const OUTPUT = path.resolve(here, '../../docs/screenshots');

/** Screenshots must not catch the app's own images (game logos, icons) halfway through loading; external avatars are ignored. */
const allImagesLoaded = (page: Page) =>
  page.waitForFunction(
    () => [...document.images].filter((image) => image.src.includes('localhost')).every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout: 10_000 }
  );

test('captures the documentation screenshots', async ({ page }) => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  // The header shows the machine's public IP: use a reserved documentation address instead of the real one.
  await page.route('**/api/system/network', (route) =>
    route.fulfill({ json: { lanAddresses: [], publicIp: '203.0.113.10' }, headers: { 'access-control-allow-origin': '*' } })
  );
  await page.goto('/');

  // 1. Welcome / empty state
  await expect(page.getByRole('heading', { name: 'Welcome to Hosty' })).toBeVisible();
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'welcome.png') });

  // 2. Creation wizard (customize step)
  await page.getByRole('button', { name: 'New server', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('button', { name: /PaperMC/ })).toBeVisible();
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'create-server-setup.png') });
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByLabel('Server Name')).toBeVisible();
  await dialog.getByLabel('Server Name').fill('Survival Realm');
  await dialog.getByLabel('Description (MOTD)').fill('§aWelcome to §lSurvival Realm');
  await page.waitForTimeout(400);
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'create-server.png') });
  await dialog.getByRole('button', { name: 'Close' }).click();

  // 3. Import a folder so the dashboard has a server
  const folder = path.join(os.tmpdir(), 'hosty-shots', 'Survival Realm');
  fs.rmSync(path.dirname(folder), { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'server.properties'), 'server-port=25565\nmotd=Survival Realm\nmax-players=20\n');
  fs.writeFileSync(path.join(folder, 'server.jar'), 'placeholder');

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click(); // game step
  await dialog.getByLabel('Server File Path').fill(folder);
  await dialog.getByLabel('Server File Path').blur();
  await expect(dialog.getByText(/Detected: minecraft/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Import Server' }).click();
  await dialog.getByRole('button', { name: 'Open panel' }).click();

  // 4. Dashboard with simulated telemetry (mock mode)
  await page.getByRole('button', { name: 'Simulate Telemetry' }).click();
  await expect(page.getByText(/MorphyCD/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'overview.png') });

  await page.getByRole('tab', { name: 'Players' }).click();
  await page.waitForTimeout(600);
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'players.png') });

  // 5. Dark theme overview
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await page.waitForTimeout(600);
  await allImagesLoaded(page);
  await page.screenshot({ path: path.join(OUTPUT, 'overview-dark.png') });
});
