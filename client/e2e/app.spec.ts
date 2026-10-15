import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('shows the empty state and switches theme and language', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Welcome to Hosty' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Cambiar a español' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenido a Hosty' })).toBeVisible();
});

test('walks the creation wizard up to the review step', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New server', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: /Create a new server/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Game step: Hytale is announced but not selectable yet.
  await expect(dialog.getByRole('button', { name: /Minecraft: Java Edition/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Hytale/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Setup step: loader grid and a selected version enable Continue.
  await expect(dialog.getByRole('button', { name: /PaperMC/ })).toBeVisible();
  const next = dialog.getByRole('button', { name: 'Continue' });
  await expect(next).toBeEnabled();
  await next.click();

  // Customize step
  await expect(dialog.getByLabel('Server Name')).toBeVisible();
  await dialog.getByLabel('Server Name').fill('E2E Server');
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Review step
  await expect(dialog.getByText('E2E Server').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Create & Install Server/ })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('imports an existing server folder and detects its game', async ({ page }) => {
  const folder = path.join(os.tmpdir(), 'hosty-e2e-import', 'My Old Server');
  fs.rmSync(path.dirname(folder), { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'server.properties'), 'server-port=25577\nmotd=Imported\nmax-players=8\n');

  await page.goto('/');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Server Folder Path').fill(folder);
  await dialog.getByLabel('Server Folder Path').blur();
  await expect(dialog.getByText(/Detected: minecraft/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByLabel('Server Name')).toHaveValue('My Old Server');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog.getByRole('button', { name: 'Import Server' }).click();

  await expect(dialog.getByText('My Old Server is ready')).toBeVisible();
  await dialog.getByRole('button', { name: 'Open panel' }).click();

  await expect(page.getByRole('navigation', { name: 'Servers' }).getByText('My Old Server')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('heading', { name: 'My Old Server' })).toBeVisible();
});
