import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DAEMON_HTTP_URL,
  resolveDaemonHttpUrl,
  toWebSocketUrl
} from '../src/config/daemon';

describe('Daemon URL config', () => {
  it('falls back to default URL when unset', () => {
    expect(resolveDaemonHttpUrl(undefined)).toBe(DEFAULT_DAEMON_HTTP_URL);
    expect(resolveDaemonHttpUrl('')).toBe(DEFAULT_DAEMON_HTTP_URL);
    expect(resolveDaemonHttpUrl('   ')).toBe(DEFAULT_DAEMON_HTTP_URL);
  });

  it('strips trailing slashes from configured URL', () => {
    expect(resolveDaemonHttpUrl('http://192.168.1.100:4000///')).toBe('http://192.168.1.100:4000');
  });

  it('converts HTTP to WS and HTTPS to WSS', () => {
    expect(toWebSocketUrl('http://localhost:4000')).toBe('ws://localhost:4000');
    expect(toWebSocketUrl('https://nexus.example.com')).toBe('wss://nexus.example.com');
  });
});

describe('Runtime daemon URL', () => {
  it('keeps the configured URL when not running inside the desktop shell', async () => {
    const { resolveRuntimeDaemonUrl, getDaemonHttpUrl, getDaemonWsUrl } = await import('../src/config/daemon');
    expect(await resolveRuntimeDaemonUrl()).toBe(getDaemonHttpUrl());
    expect(getDaemonWsUrl()).toBe(toWebSocketUrl(getDaemonHttpUrl()));
  });
});
