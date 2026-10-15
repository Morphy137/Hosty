# __NAME__ (Hosty game pack)

This folder is a Hosty game pack. See `docs/game-packs.md` in the Hosty repository for the full manifest reference.

- `hosty-game.json` — declarative description of the game (launch command, log patterns, config files, setup fields).
- `driver.js` (optional) — override individual driver methods when the manifest is not enough. Packs with code must be trusted by the user before they run.
- `logo.png` (optional) — reference it from the manifest with `"logo": "logo.png"`.
