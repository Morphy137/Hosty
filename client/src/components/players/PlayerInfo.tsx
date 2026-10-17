import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Snowflake, VolumeX, Wifi } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
import { cn } from '../../utils/cn';
import { resolveDimension } from '../../utils/dimensions';
import { formatDecimal } from '../../utils/format';
import { playerAvatarUrl } from '../../utils/playerActions';
import { DimensionIcon } from '../common/DimensionIcon';

/** Avatar from the game's `playerView.avatarUrl` template, else the player's initials. */
export const PlayerAvatar: React.FC<{ player: PlayerState; game: GameDriverSummary | undefined; size?: number }> = ({
  player,
  game,
  size = 40
}) => {
  const avatar = playerAvatarUrl(game?.playerView?.avatarUrl, player.username);
  return avatar ? (
    <img
      src={avatar}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[6px] border border-hairline object-contain shadow-2xs"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[6px] bg-surface-3 text-[13px] font-semibold text-ink"
    >
      {player.username.slice(0, 2).toUpperCase()}
    </span>
  );
};

/** State flags reported by the Telemetry Bridge (any game's bridge may send them). */
export const PlayerBadges: React.FC<{ player: PlayerState }> = ({ player }) => {
  const { t } = useTranslation();
  return (
    <>
      {player.isOp && (
        <span className="rounded-[3px] border border-warning/30 bg-warning/15 px-1 font-mono text-[9px] font-bold text-warning">
          {t('overview.players.operator')}
        </span>
      )}
      {player.isFrozen && (
        <span className="inline-flex items-center gap-0.5 rounded-[3px] border border-accent/30 bg-accent/15 px-1 font-mono text-[9px] font-bold text-accent-fg">
          <Snowflake className="h-2.5 w-2.5" />
          {t('players.frozen')}
        </span>
      )}
      {player.isMuted && (
        <span className="inline-flex items-center gap-0.5 rounded-[3px] border border-danger/30 bg-danger/15 px-1 font-mono text-[9px] font-bold text-danger-fg">
          <VolumeX className="h-2.5 w-2.5" />
          {t('players.muted')}
        </span>
      )}
    </>
  );
};

/** Fixed cell widths (in `ch` of the mono font) so a value changing never moves its neighbours. */
const FACT_CELL = {
  dimension: 'min-w-[6.5rem]',
  coordinates: 'w-[26ch]',
  health: 'w-[12ch]',
  food: 'w-[9ch]',
  ping: 'w-[6ch]'
} as const;

const FACT_CELL_BASE = 'shrink-0 overflow-hidden whitespace-nowrap tabular-nums';

/** What the game says it can show about a player: dimension, coordinates, vitals, ping. */
export const PlayerFacts: React.FC<{ player: PlayerState; game: GameDriverSummary | undefined }> = ({ player, game }) => {
  const { t, i18n } = useTranslation();
  const view = game?.playerView;
  const dimension = view?.dimensions ? resolveDimension(game, player.dimension, i18n.language) : null;
  const number = (value: number, fixed = false) => formatDecimal(value, i18n.language, fixed);
  const coordinates = `${number(player.x, true)}, ${number(player.y, true)}, ${number(player.z, true)}`;
  const health =
    player.health === undefined
      ? ''
      : player.maxHealth
        ? `${number(player.health)}/${number(player.maxHealth)}`
        : number(player.health);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-mute">
      {dimension && (
        <span
          className={cn(
            FACT_CELL.dimension,
            'inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-body'
          )}
        >
          <DimensionIcon dimension={dimension} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{dimension.label}</span>
        </span>
      )}
      {view?.coordinates && (
        <span className={cn(FACT_CELL.coordinates, FACT_CELL_BASE, 'truncate')} title={coordinates}>
          {coordinates}
        </span>
      )}
      {view?.vitals && player.health !== undefined && (
        <span className={cn(FACT_CELL.health, FACT_CELL_BASE, 'inline-flex items-center gap-0.5 text-danger-fg')}>
          <Heart className="h-2.5 w-2.5 shrink-0 fill-danger-fg" />
          <span className="truncate">{health} HP</span>
        </span>
      )}
      {view?.vitals && player.food !== undefined && (
        <span className={cn(FACT_CELL.food, FACT_CELL_BASE, 'truncate')}>
          {t('overview.players.food')}: {number(player.food)}
        </span>
      )}
      {player.ping !== undefined && (
        <span className={cn(FACT_CELL.ping, FACT_CELL_BASE, 'inline-flex items-center gap-0.5 text-success-fg')}>
          <Wifi className="h-2.5 w-2.5 shrink-0" />
          {number(player.ping)}ms
        </span>
      )}
    </div>
  );
};
