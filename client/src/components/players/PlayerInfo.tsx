import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Snowflake, VolumeX, Wifi } from 'lucide-react';
import type { GameDriverSummary, PlayerState } from '../../types/daemon';
import { resolveDimension } from '../../utils/dimensions';
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

/** What the game says it can show about a player: dimension, coordinates, vitals, ping. */
export const PlayerFacts: React.FC<{ player: PlayerState; game: GameDriverSummary | undefined }> = ({ player, game }) => {
  const { t, i18n } = useTranslation();
  const view = game?.playerView;
  const dimension = view?.dimensions ? resolveDimension(game, player.dimension, i18n.language) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-mute">
      {dimension && (
        <span className="inline-flex items-center gap-1 rounded-[3px] border border-hairline bg-surface-2 px-1.5 py-0.5 text-body">
          <DimensionIcon dimension={dimension} className="h-3.5 w-3.5" />
          <span className="truncate">{dimension.label}</span>
        </span>
      )}
      {view?.coordinates && (
        <span>
          {player.x}, {player.y}, {player.z}
        </span>
      )}
      {view?.vitals && player.health !== undefined && (
        <span className="inline-flex items-center gap-0.5 text-danger-fg">
          <Heart className="h-2.5 w-2.5 fill-danger-fg" />
          {player.maxHealth ? `${player.health}/${player.maxHealth}` : player.health} HP
        </span>
      )}
      {view?.vitals && player.food !== undefined && (
        <span>
          {t('overview.players.food')}: {player.food}
        </span>
      )}
      {player.ping !== undefined && (
        <span className="inline-flex items-center gap-0.5 text-success-fg">
          <Wifi className="h-2.5 w-2.5" />
          {player.ping}ms
        </span>
      )}
    </div>
  );
};
