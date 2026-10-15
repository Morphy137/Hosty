# @hosty/game-sdk

Types, helpers and a test harness for [Hosty](../../README.md) game packs.

```ts
import { defineGame, createPackHarness } from '@hosty/game-sdk';

const manifest = defineGame({ /* ... */ });
const pack = createPackHarness(manifest);
pack.parseLog('Player Bob joined the game'); // { playerJoin: { username: 'Bob' } }
```

- `hosty-game.schema.json` — JSON Schema for editor validation (`"$schema"` in your manifest).
- `defineDriver()` — typed `driver.js` extension (see `docs/game-packs.md`).

Reference: [docs/game-packs.md](../../docs/game-packs.md).
