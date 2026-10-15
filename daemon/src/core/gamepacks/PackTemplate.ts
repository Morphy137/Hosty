import fs from 'fs';
import path from 'path';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MANIFEST_FILE = 'hosty-game.json';

export const isValidPackId = (id: string): boolean => ID_PATTERN.test(id);

const titleFromId = (id: string): string =>
  id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** Copies the starter pack into `<gamesDir>/<id>` replacing the __ID__ / __NAME__ placeholders. */
export function createPackFromTemplate(gamesDir: string, templateDir: string, id: string, name?: string): string {
  if (!isValidPackId(id)) throw new Error('The id must be 2-40 characters: lowercase letters, digits and dashes.');
  if (!fs.existsSync(path.join(templateDir, MANIFEST_FILE))) throw new Error('The pack template is not installed.');
  const target = path.join(gamesDir, id);
  if (fs.existsSync(target)) throw new Error(`A folder named "${id}" already exists in the games folder.`);

  const title = name?.trim() || titleFromId(id);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(templateDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const content = fs
      .readFileSync(path.join(templateDir, entry.name), 'utf-8')
      .replaceAll('__ID__', id)
      .replaceAll('__NAME__', title);
    fs.writeFileSync(path.join(target, entry.name), content);
  }
  return target;
}
