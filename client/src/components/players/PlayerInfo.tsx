import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Snowflake, VolumeX, Wifi } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
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

/** Fixed food width (in `ch` of the mono font) so a changing value never moves the ping beside it. */
const FOOD_CELL_WIDTH = 'w-[9ch]';

/**
 * What the game says it can show about a player, stacked in a fixed order so nothing reflows when a
 * value changes: dimension, coordinates, health, then food with the ping beside it.
 */
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
  const showFood = view?.vitals && player.food !== undefined;
  return (
    <div className="flex flex-col items-start gap-1 font-mono text-[11px] tabular-nums text-mute">
      {dimension && (
        <span className="inline-flex max-w-full items-center gap-1 rounded-[3px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-body">
          <DimensionIcon dimension={dimension} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{dimension.label}</span>
        </span>
      )}
      {view?.coordinates && (
        <span className="max-w-full truncate whitespace-nowrap" title={coordinates}>
          {coordinates}
        </span>
      )}
      {view?.vitals && player.health !== undefined && (
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-danger-fg">
          <Heart className="h-2.5 w-2.5 shrink-0 fill-danger-fg" />
          {health} HP
        </span>
      )}
      {(showFood || player.ping !== undefined) && (
        <div className="flex items-center gap-2 whitespace-nowrap">
          {showFood && (
            <span className={FOOD_CELL_WIDTH}>
              {t('overview.players.food')}: {number(player.food as number)}
            </span>
          )}
          {player.ping !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-success-fg">
              <Wifi className="h-2.5 w-2.5 shrink-0" />
              {number(player.ping)}ms
            </span>
          )}
        </div>
      )}
    </div>
  );
};
