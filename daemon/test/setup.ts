import { driverRegistry } from '../src/core/drivers/GameDriverRegistry';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BUNDLED_GAMES_DIR } from './helpers/packs';

// The app-wide registry starts empty: give every test file the bundled games, as the daemon does at startup.
driverRegistry.loadPacks(fs.mkdtempSync(path.join(os.tmpdir(), 'hosty-games-')), BUNDLED_GAMES_DIR);
