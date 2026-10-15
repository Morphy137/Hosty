#!/usr/bin/env node
// Scaffolds a game pack folder from ./template:  npm create hosty-game my-game
const fs = require('node:fs');
const path = require('node:path');

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const name = process.argv[2];

if (!name || !ID_PATTERN.test(name)) {
  console.error('Usage: npm create hosty-game <pack-id>');
  console.error('The id must be 2-40 characters: lowercase letters, digits and dashes.');
  process.exit(1);
}

const target = path.resolve(process.cwd(), name);
if (fs.existsSync(target)) {
  console.error(`Folder "${name}" already exists.`);
  process.exit(1);
}

const templateDir = path.join(__dirname, '..', 'template');
const title = name
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

fs.mkdirSync(target, { recursive: true });
for (const entry of fs.readdirSync(templateDir)) {
  const content = fs
    .readFileSync(path.join(templateDir, entry), 'utf8')
    .replaceAll('__ID__', name)
    .replaceAll('__NAME__', title);
  fs.writeFileSync(path.join(target, entry), content);
}

console.log(`Created game pack "${name}" in ${target}`);
console.log('Next steps:');
console.log(`  1. Edit ${name}/hosty-game.json (launch, logs, config files).`);
console.log('  2. Copy the folder into your Hosty games directory (Sidebar > Game packs shows its path).');
console.log('  3. Open Game packs in Hosty and press "Reload packs".');
