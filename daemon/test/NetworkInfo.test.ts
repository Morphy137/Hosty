import { describe, expect, it } from 'vitest';
import { buildFirewallRuleArgs, fetchPublicIp, firewallRuleName, getPublicIp, isValidPort, listLanAddresses } from '../src/core/NetworkInfo';

describe('NetworkInfo', () => {
  it('remembers the public IP for a while instead of looking it up on every visit', async () => {
    let calls = 0;
    const lookup = (async () => {
      calls += 1;
      return new Response('198.51.100.4');
    }) as unknown as typeof fetch;
    const start = 1_000_000;
    expect(await getPublicIp(start, lookup)).toBe('198.51.100.4');
    expect(await getPublicIp(start + 60_000, lookup)).toBe('198.51.100.4');
    expect(calls).toBe(1);
    await getPublicIp(start + 11 * 60_000, lookup);
    expect(calls).toBe(2);
  });

  it('lists only external IPv4 addresses', () => {
    const interfaces = {
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      eth0: [
        { family: 'IPv4', address: '192.168.1.20', internal: false },
        { family: 'IPv6', address: 'fe80::1', internal: false }
      ]
    } as never;
    expect(listLanAddresses(interfaces)).toEqual(['192.168.1.20']);
  });

  it('accepts only a plain IPv4 as public address', async () => {
    const reply = (text: string) => (async () => new Response(text)) as unknown as typeof fetch;
    expect(await fetchPublicIp(reply('203.0.113.7\n'))).toBe('203.0.113.7');
    expect(await fetchPublicIp(reply('<html>'))).toBeNull();
    expect(await fetchPublicIp((async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBeNull();
  });

  it('validates ports and builds shell-free firewall arguments', () => {
    expect(isValidPort(25565)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort('25565')).toBe(false);
    expect(buildFirewallRuleArgs('Hosty A 25565', 25565, 'TCP')).toContain('localport=25565');
    expect(firewallRuleName('A&b "x"', 25565)).toBe('Hosty Ab x 25565');
  });
});
