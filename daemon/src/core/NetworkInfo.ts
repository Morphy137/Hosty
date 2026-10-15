import { spawn } from 'child_process';
import os from 'os';

export interface NetworkInfo {
  lanAddresses: string[];
  publicIp: string | null;
}

const PUBLIC_IP_URL = 'https://api.ipify.org';
const PUBLIC_IP_TIMEOUT_MS = 4000;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const FIREWALL_PROTOCOLS = ['TCP', 'UDP'] as const;
const MIN_PORT = 1;
const MAX_PORT = 65535;

/** Non-internal IPv4 addresses other devices on the local network can use. */
export function listLanAddresses(interfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces()): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

/** Public address as seen from the internet; null when offline or the lookup fails. */
export async function fetchPublicIp(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(PUBLIC_IP_URL, { signal: AbortSignal.timeout(PUBLIC_IP_TIMEOUT_MS) });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return IPV4_PATTERN.test(text) ? text : null;
  } catch {
    return null;
  }
}

export const isValidPort = (port: unknown): port is number =>
  typeof port === 'number' && Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;

/** `netsh` arguments that allow inbound traffic for one rule; args are passed without a shell. */
export function buildFirewallRuleArgs(ruleName: string, port: number, protocol: (typeof FIREWALL_PROTOCOLS)[number]): string[] {
  return [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${ruleName}`,
    'dir=in',
    'action=allow',
    `protocol=${protocol}`,
    `localport=${port}`
  ];
}

export const firewallRuleName = (instanceName: string, port: number): string =>
  `Hosty ${instanceName.replace(/[^\w .-]/g, '')} ${port}`.trim();

/** Adds TCP and UDP inbound rules (Windows only; needs administrator rights). */
export async function openFirewallPort(ruleName: string, port: number): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Firewall rules can only be created on Windows.');
  for (const protocol of FIREWALL_PROTOCOLS) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('netsh', buildFirewallRuleArgs(ruleName, port, protocol), { windowsHide: true });
      let output = '';
      child.stdout.on('data', (data: Buffer) => (output += data.toString()));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(output.trim() || 'Could not add the firewall rule. Run Hosty as administrator.'))
      );
    });
  }
}
