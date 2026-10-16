import { fetchNetworkInfo } from '../api/daemonApi';
import type { NetworkInfo } from '../types/daemon';
import { useCachedResource } from './useCachedResource';

const LOOPBACK_HOST = '127.0.0.1';

/** Host people should share to join a server: the public IP, or loopback while it is unknown (offline). */
export function useShareableHost(): string {
  const network = useCachedResource<NetworkInfo>('network', fetchNetworkInfo);
  return network.data?.publicIp ?? LOOPBACK_HOST;
}
