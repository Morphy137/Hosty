// Creates the Ed25519 key pair that signs the catalog. Usage: node catalog/scripts/keygen.mjs <private-key-file>
// The private key stays with the maintainer (never commit it); the public key goes into
// daemon/src/core/catalog/catalogKey.ts so the app can verify signatures.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node catalog/scripts/keygen.mjs <private-key-file>');
  process.exit(1);
}
const keyFile = resolve(target);
if (existsSync(keyFile)) {
  console.error(`${keyFile} already exists; refusing to overwrite a signing key.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
mkdirSync(dirname(keyFile), { recursive: true });
writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log(`Private key written to ${keyFile}. Back it up and keep it secret.`);
console.log('Public key (paste into daemon/src/core/catalog/catalogKey.ts):\n');
console.log(publicKey.export({ type: 'spki', format: 'pem' }));
