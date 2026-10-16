import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { togglePlayerList, toErrorPayload, updatePlayerList } from '../../api/daemonApi';
import type { PlayerListEntry, PlayerListSpec, PlayerListState } from '../../types/daemon';
import { ActionIcon } from '../common/ActionIcon';
import { resolveLocalized } from '../../utils/localized';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/toastContext';

const PLACEHOLDER_ROWS = 3;
/** Values some games store when an entry has no expiry or reason (shown as nothing). */
const EMPTY_DETAIL_VALUES = new Set(['forever', 'banned by an operator.', '']);

interface PlayerListPanelProps {
  instanceId: string;
  spec: PlayerListSpec;
  state: PlayerListState | undefined;
  /** Adding uses the game's own commands, so it needs the server running; removing works either way. */
  isOnline: boolean;
  filter: string;
  onChanged: () => Promise<void>;
}

/** One declared list (whitelist, operators, bans...) with add, remove and its on/off switch. */
export const PlayerListPanel: React.FC<PlayerListPanelProps> = ({ instanceId, spec, state, isOnline, filter, onChanged }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busyValue, setBusyValue] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const isIp = spec.valueType === 'ip';
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  );

  const reportError = (error: unknown) => {
    const payload = toErrorPayload(error);
    toast({ title: t(`errors.${payload.code}`, { defaultValue: payload.message }), variant: 'error' });
  };

  const run = async (key: string, operation: () => Promise<unknown>) => {
    setBusyValue(key);
    try {
      await operation();
      await onChanged();
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setBusyValue(null);
    }
  };

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const added = await run('__add__', () => updatePlayerList(instanceId, spec.id, 'add', trimmed, spec.reason ? reason : undefined));
    if (added) {
      setValue('');
      setReason('');
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setIsToggling(true);
    try {
      await togglePlayerList(instanceId, spec.id, enabled);
      await onChanged();
    } catch (error) {
      reportError(error);
    } finally {
      setIsToggling(false);
    }
  };

  const formatDetail = (field: string, raw: string | number | boolean): string | null => {
    const text = String(raw);
    if (EMPTY_DETAIL_VALUES.has(text.toLowerCase())) return null;
    if (field === 'created' || field === 'expires') {
      const date = new Date(text.replace(/ ([+-]\d{4})$/, '$1'));
      return Number.isNaN(date.getTime()) ? text : dateFormat.format(date);
    }
    if (field === 'level') return t('players.lists.level', { level: text });
    return text;
  };

  const entries = (state?.entries ?? []).filter((entry) => entry.value.toLowerCase().includes(filter.toLowerCase()));

  const renderEntry = (entry: PlayerListEntry) => {
    const details = Object.entries(entry.details)
      .map(([field, raw]) => ({ field, text: formatDetail(field, raw) }))
      .filter((detail): detail is { field: string; text: string } => detail.text !== null);
    return (
      <li key={entry.value} className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] text-ink">{entry.value}</div>
          {details.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-mute">
              {details.map((detail) => (
                <span key={detail.field} className="truncate">
                  {detail.field === 'level' ? detail.text : `${t(`players.lists.detail.${detail.field}`, { defaultValue: detail.field })}: ${detail.text}`}
                </span>
              ))}
            </div>
          )}
        </div>
        <IconButton
          label={t('players.lists.remove', { value: entry.value })}
          variant="ghost"
          disabled={busyValue !== null}
          onClick={() => void run(entry.value, () => updatePlayerList(instanceId, spec.id, 'remove', entry.value))}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </li>
    );
  };

  return (
    <div className="geist-card flex min-h-0 flex-1 flex-col overflow-hidden border border-hairline bg-surface">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-surface-3 text-body">
            <ActionIcon name={spec.icon} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-ink">{resolveLocalized(spec.label, i18n.language)}</h3>
            {spec.description && (
              <p className="text-[12px] text-soft">{resolveLocalized(spec.description, i18n.language)}</p>
            )}
          </div>
        </div>
        {spec.toggle && (
          <label className="flex shrink-0 items-center gap-2 text-[12px] text-body">
            {t('players.lists.enforced')}
            <Switch
              checked={state?.enabled === true}
              busy={isToggling}
              disabled={state === undefined}
              onCheckedChange={(enabled) => void handleToggle(enabled)}
              ariaLabel={t('players.lists.enforced')}
            />
          </label>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-3">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t(isIp ? 'players.lists.add_placeholder_ip' : 'players.lists.add_placeholder_player')}
          disabled={!isOnline}
          className="w-56 font-mono"
          aria-label={t(isIp ? 'players.lists.add_placeholder_ip' : 'players.lists.add_placeholder_player')}
        />
        {spec.reason && (
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('players.lists.reason_placeholder')}
            disabled={!isOnline}
            className="min-w-0 flex-1"
            aria-label={t('players.lists.reason_placeholder')}
          />
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!isOnline || !value.trim() || busyValue !== null}
          loading={busyValue === '__add__'}
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
        >
          {t('players.lists.add')}
        </Button>
        {!isOnline && <p className="w-full text-[11px] text-mute">{t('players.lists.offline_hint')}</p>}
      </form>

      <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto" aria-busy={state === undefined}>
        {state === undefined &&
          Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
            <li key={index} className="px-4 py-3">
              <Skeleton className="h-4 w-40" />
            </li>
          ))}
        {state?.unreadable && <li className="px-4 py-6 text-[13px] text-danger-fg">{t('players.lists.unreadable', { file: spec.file })}</li>}
        {state && !state.unreadable && entries.length === 0 && (
          <li className="px-4 py-8 text-center text-[13px] text-mute">{t('players.lists.empty')}</li>
        )}
        {entries.map(renderEntry)}
      </ul>
    </div>
  );
};
