import React from 'react';
import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react';
import type { ServerStatus } from '../../types/daemon';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { StatusDot } from './StatusDot';

const STATUS_TONE: Record<ServerStatus, string> = {
  OFFLINE: 'border-hairline bg-surface-2 text-mute',
  STARTING: 'border-warning/30 bg-warning-soft text-warning-fg',
  ONLINE: 'border-success/30 bg-success-soft text-success-fg',
  STOPPING: 'border-warning/30 bg-warning-soft text-warning-fg'
};

const STATUS_KEY: Record<ServerStatus, string> = {
  OFFLINE: 'overview.controls.status_offline',
  STARTING: 'overview.controls.status_starting',
  ONLINE: 'overview.controls.status_online',
  STOPPING: 'overview.controls.status_stopping'
};

/** Server state as shown everywhere in the app (header, overview): a compact tag with a status dot. */
export const ServerStatusBadge: React.FC<{ status: ServerStatus }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-[5px] border px-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.06em]',
        STATUS_TONE[status]
      )}
    >
      <StatusDot status={status} className="h-1.5 w-1.5" />
      {t(STATUS_KEY[status])}
    </span>
  );
};

/** Telemetry Bridge connection, in the same pill style as the server state. */
export const BridgeBadge: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Badge variant="accent" title={t('overview.bridge_badge_hint')}>
      <Radio className="h-3 w-3" aria-hidden="true" />
      {t('overview.metrics.bridge_connected')}
    </Badge>
  );
};
