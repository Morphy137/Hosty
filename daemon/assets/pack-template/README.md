# __NAME__ (Hosty game pack)

Reference: `docs/game-packs.md` in the Hosty repository. Types and a test harness: `@hosty/game-sdk`.

## Files

- `hosty-game.json`: declarative description (launch, logs, config files, player actions, dimensions).
- `logo.svg`: referenced by `"logo"`; replace it with the game's logo (png / webp / svg).
- `driver.js.example`: optional code override. Rename to `driver.js` to use it; the user must trust it in Hosty.

## Workflow

1. Edit `hosty-game.json`: executable, args, log patterns, config files and `playerActions`.
2. Validate: `npx hosty-pack validate .` (same rules as the daemon).
3. Install: Hosty > Game packs > pick this folder > Install (or copy it into the games folder).
4. Press **Reload packs** after each change; the game shows up in the creation wizard.

Fields you do not need can simply be deleted (`playerActions`, `dimensions`, `performance`, `configSync`, ...).
