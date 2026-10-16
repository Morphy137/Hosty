/**
 * Public half of the Ed25519 key that signs the pack catalog (`catalog/scripts/keygen.mjs`). The app only trusts
 * catalog indexes whose `index.json.sig` verifies against it. Rotating the key means shipping a new app version.
 */
export const CATALOG_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZqbY+0pHjxF/STE1ouURP4CfzW/rn20EU6RdCp72x7s=
-----END PUBLIC KEY-----`;

/** Where the signed catalog is published (`index.json`, `index.json.sig`, `packs/<id>/...`). */
export const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/Morphy137/Hosty-Games/main';
