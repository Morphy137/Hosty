import React from 'react';
import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react';
import type { ServerStatus } from '../../types/daemon';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { StatusDot } from './StatusDot';

const STATUS_TONE: Record<ServerStatus, string> = {
  OFFLINE: 'text-mute',
  STARTING: 'text-warning-fg',
  ONLINE: 'text-success-fg',
  STOPPING: 'text-warning-fg'
};

const STATUS_KEY: Record<ServerStatus, string> = {
  OFFLINE: 'overview.controls.status_offline',
  STARTING: 'overview.controls.status_starting',
  ONLINE: 'overview.controls.status_online',
  STOPPING: 'overview.controls.status_stopping'
};

/** Server state as shown everywhere in the app (header, overview): a status dot and its label, no frame. */
export const ServerStatusBadge: React.FC<{ status: ServerStatus }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <span role="status" className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium', STATUS_TONE[status])}>
      <StatusDot status={status} />
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
