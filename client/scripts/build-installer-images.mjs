// Renders the NSIS installer images (sidebar 164x314, header 150x57) from docs/brand/hosty-icon.svg.
// Usage: node client/scripts/build-installer-images.mjs   (needs the Playwright Chromium the E2E tests use)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'client', 'src-tauri', 'installer');
const iconSvg = readFileSync(join(root, 'docs', 'brand', 'hosty-icon.svg'), 'utf-8');
const iconDataUrl = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

const IMAGES = {
  sidebar: {
    width: 164,
    height: 314,
    html: `<div style="width:164px;height:314px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:linear-gradient(180deg,#34202b 0%,#1a1419 55%,#0e0c11 100%)">
      <img src="${iconDataUrl}" width="92" height="92" />
      <div style="font:700 30px 'Segoe UI',Inter,sans-serif;color:#fff;letter-spacing:-0.5px">Hosty</div>
    </div>`
  },
  header: {
    width: 150,
    height: 57,
    html: `<div style="width:150px;height:57px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;box-sizing:border-box;background:#fff">
      <img src="${iconDataUrl}" width="44" height="44" />
    </div>`
  }
};

/** 24-bit BMP (bottom-up rows padded to 4 bytes), the format NSIS expects. */
function encodeBmp(width, height, rgba) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < height; y += 1) {
    const rowStart = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      buffer[rowStart + x * 3] = rgba[source + 2];
      buffer[rowStart + x * 3 + 1] = rgba[source + 1];
      buffer[rowStart + x * 3 + 2] = rgba[source];
    }
  }
  return buffer;
}

const browser = await chromium.launch();
try {
  for (const [name, { width, height, html }] of Object.entries(IMAGES)) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0">${html}</body>`);
    await page.waitForLoadState('load');
    const png = await page.screenshot({ type: 'png' });
    const pixels = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(0, 0, image.width, image.height).data);
    }, png.toString('base64'));
    if (process.env.HOSTY_INSTALLER_PREVIEW) writeFileSync(join(process.env.HOSTY_INSTALLER_PREVIEW, `${name}.png`), png);
    writeFileSync(join(outDir, `${name}.bmp`), encodeBmp(width, height, Uint8Array.from(pixels)));
    console.log(`[installer] ${name}.bmp ${width}x${height}`);
    await page.close();
  }
} finally {
  await browser.close();
}
