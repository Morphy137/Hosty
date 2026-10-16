import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ShieldCheck } from 'lucide-react';
import { fetchNetworkInfo, openFirewall } from '../../api/daemonApi';
import type { NetworkInfo } from '../../types/daemon';
import { useCachedResource } from '../../hooks/useCachedResource';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';

const PLACEHOLDER_ROWS = 2;
const EMPTY_NETWORK: NetworkInfo = { lanAddresses: [], publicIp: null };

interface NetworkTabProps {
  instanceId: string;
  port: number;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({ instanceId, port }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Machine-wide and slow to resolve (public IP lookup): cached so the tab renders at once on every visit.
  const network = useCachedResource<NetworkInfo>('network', fetchNetworkInfo);
  const info = network.data ?? (network.error ? EMPTY_NETWORK : null);
  const [isBusy, setIsBusy] = useState(false);

  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(() => undefined);

  const addressRow = (label: string, host: string) => (
    <li
      key={`${label}:${host}`}
      className="flex items-center justify-between gap-3 rounded-[8px] border border-hairline bg-surface-2 p-3"
    >
      <div className="min-w-0">
        <div className="text-[11px] text-mute">{label}</div>
        <div className="truncate font-mono text-[13px] text-ink">
          {host}:{port}
        </div>
      </div>
      <button
        type="button"
        aria-label={t('network.copy')}
        title={t('network.copy')}
        className="cursor-pointer rounded-[4px] p-1 text-mute hover:bg-surface-3 hover:text-ink"
        onClick={() => copy(`${host}:${port}`)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </li>
  );

  const openPort = async () => {
    setIsBusy(true);
    try {
      await openFirewall(instanceId);
      toast({ title: t('network.firewall_done', { port }), variant: 'success' });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : String(error), variant: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t('network.title')}</h2>
        <p className="text-[12px] text-soft">{t('network.description')}</p>
      </div>

      <ul className="space-y-2" aria-busy={network.isLoading || network.isRefreshing}>
        {!info && Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => <Skeleton key={index} className="h-[58px] w-full rounded-[8px]" />)}
        {(info?.lanAddresses ?? []).map((address) => addressRow(t('network.lan'), address))}
        {info?.publicIp ? addressRow(t('network.public'), info.publicIp) : null}
      </ul>
      {info && !info.publicIp && <p className="text-[12px] text-mute">{t('network.public_unknown')}</p>}

      <div className="space-y-2 rounded-[8px] border border-hairline bg-surface-2 p-3.5">
        <h3 className="text-[13px] font-semibold text-ink">{t('network.forwarding_title')}</h3>
        <p className="text-[12px] leading-relaxed text-soft">{t('network.forwarding_hint', { port })}</p>
        <Button
          variant="secondary"
          loading={isBusy}
          leadingIcon={<ShieldCheck className="h-3.5 w-3.5" />}
          onClick={() => window.confirm(t('network.firewall_confirm', { port })) && void openPort()}
        >
          {t('network.firewall_button', { port })}
        </Button>
      </div>
    </div>
  );
};
