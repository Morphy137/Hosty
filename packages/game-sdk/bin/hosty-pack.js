#!/usr/bin/env node
// hosty-pack validate [dir]  - checks a game pack with the same rules the Hosty daemon applies.
const fs = require('node:fs');
const path = require('node:path');
const { validateManifest } = require('../dist/index.js');

const [command, dirArgument = '.'] = process.argv.slice(2);
if (command !== 'validate') {
  console.error('Usage: hosty-pack validate [pack-dir]');
  process.exit(command ? 1 : 0);
}

const dir = path.resolve(dirArgument);
const manifestPath = path.join(dir, 'hosty-game.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`No hosty-game.json in ${dir}`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`hosty-game.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const result = validateManifest(raw);
const problems = [...result.errors];
const manifest = result.manifest ?? raw;

const referencedFiles = [
  manifest.logo,
  manifest.serverIcon?.file,
  manifest.devMock,
  ...(manifest.dimensions ?? []).map((dimension) => dimension.icon)
].filter((file) => typeof file === 'string');
for (const file of referencedFiles) {
  if (!fs.existsSync(path.join(dir, file))) problems.push(`Referenced file is missing: ${file}`);
}

if (problems.length > 0) {
  console.error(`${manifestPath}\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
const hasDriver = fs.existsSync(path.join(dir, 'driver.js'));
console.log(`OK: ${raw.id} v${raw.version}${hasDriver ? ' (driver.js present: the user must trust it)' : ''}`);
