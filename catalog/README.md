# Hosty game catalog

Tooling to publish game packs as a **signed catalog** that the app can browse and install from. Intended to live in its
own repository (`Hosty-Games`); the app reads it from `MC_NEXUS_CATALOG_URL` (default in
`daemon/src/core/catalog/catalogKey.ts`).

## What gets published

```
index.json        every pack: id, name, version, author, description, files[{ path, sha256, size }]
index.json.sig    base64 Ed25519 signature over the exact bytes of index.json
packs/<id>/...    the pack files as they are installed
```

The app downloads `index.json` and `index.json.sig`, verifies the signature with the public key built into the app,
then downloads each file and compares its size and SHA-256 with the signed index. Anything that does not match is
discarded. Because the signature covers the hashes, a pack's `driver.js` from the catalog is approved automatically.

## One-time setup

```bash
node catalog/scripts/keygen.mjs ~/.hosty/catalog-signing.pem
```

Keep the private key outside the repository and back it up. Paste the printed public key into
`daemon/src/core/catalog/catalogKey.ts`. Losing the key means shipping a new app with a new public key; a leaked key
means the same, so store it as a CI secret (`HOSTY_CATALOG_KEY`) rather than on shared machines.

## Publishing

```bash
npm --prefix daemon run build:games      # generates driver.js of the bundled games
node catalog/scripts/build-catalog.mjs --packs daemon/assets/games --out catalog/dist --key ~/.hosty/catalog-signing.pem
```

Commit the contents of `catalog/dist` to the catalog repository. Bump a pack's `version` in its `hosty-game.json` to
make the app offer it as an update.
