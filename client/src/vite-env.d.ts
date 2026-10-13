/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base HTTP URL of the MC-Nexus daemon, e.g. http://localhost:4000 */
  readonly VITE_DAEMON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
