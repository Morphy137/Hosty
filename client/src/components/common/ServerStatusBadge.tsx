import React from 'react';
import { useTranslation } from 'react-i18next';
import { Radio } from 'lucide-react';
import type { ServerStatus } from '../../types/daemon';
import { Badge, type BadgeVariant } from '../ui/Badge';
import { StatusDot } from './StatusDot';

const STATUS_BADGE: Record<ServerStatus, BadgeVariant> = {
  OFFLINE: 'neutral',
  STARTING: 'warning',
  ONLINE: 'success',
  STOPPING: 'warning'
};

const STATUS_KEY: Record<ServerStatus, string> = {
  OFFLINE: 'overview.controls.status_offline',
  STARTING: 'overview.controls.status_starting',
  ONLINE: 'overview.controls.status_online',
  STOPPING: 'overview.controls.status_stopping'
};

/** Server state as shown everywhere in the app (header, overview): one pill style, one dot. */
export const ServerStatusBadge: React.FC<{ status: ServerStatus }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_BADGE[status]}>
      <StatusDot status={status} className="h-1.5 w-1.5" />
      {t(STATUS_KEY[status])}
    </Badge>
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
