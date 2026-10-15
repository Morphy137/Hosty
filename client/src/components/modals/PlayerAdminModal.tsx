import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Shield,
  LogOut,
  Ban,
  Navigation,
  Sparkles,
  Package,
  Snowflake,
  VolumeX,
  Zap,
  Award
} from 'lucide-react';
import type { DaemonAction, PlayerState } from '../../types/daemon';
import { DimensionIcon } from '../common/DimensionIcon';
import { formatDimensionName } from '../../utils/format';
import { SlidingText } from '../common/SlidingText';
import { PlayerExperienceModal } from './PlayerExperienceModal';

interface PlayerAdminModalProps {
  player: PlayerState | null;
  onClose: () => void;
  onSendCommand: (command: string) => void;
  onSendAction?: (action: DaemonAction, data?: unknown) => boolean;
  onInspectInventory?: (player: PlayerState) => void;
}

export const PlayerAdminModal: React.FC<PlayerAdminModalProps> = ({
  player,
  onClose,
  onSendCommand,
  onSendAction,
  onInspectInventory
}) => {
  const { t } = useTranslation();
  const [kickReason, setKickReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [tpCoords, setTpCoords] = useState({ x: '0', y: '64', z: '0' });
  const [frostEffect, setFrostEffect] = useState(false);
  const [isExpModalOpen, setIsExpModalOpen] = useState(false);

  if (!player) return null;

  const resolvedKickReason = kickReason.trim() || t('players.kick_default_reason');
  const resolvedBanReason = banReason.trim() || t('players.ban_default_reason');

  const handleKick = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSendAction) {
      onSendAction('ACTION', {
        action: 'KICK',
        username: player.username,
        reason: resolvedKickReason
      });
    } else {
      onSendCommand(`kick ${player.username} ${resolvedKickReason}`);
    }
    onClose();
  };

  const handleBan = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSendAction) {
      onSendAction('ACTION', {
        action: 'BAN',
        username: player.username,
        reason: resolvedBanReason
      });
    } else {
      onSendCommand(`ban ${player.username} ${resolvedBanReason}`);
    }
    onClose();
  };

  const handleSetGamemode = (mode: string) => {
    onSendCommand(`gamemode ${mode} ${player.username}`);
  };

  const handleTeleport = (e: React.FormEvent) => {
    e.preventDefault();
    onSendCommand(`tp ${player.username} ${tpCoords.x} ${tpCoords.y} ${tpCoords.z}`);
  };

  const handleOpToggle = (isOp: boolean) => {
    onSendCommand(`${isOp ? 'op' : 'deop'} ${player.username}`);
  };

  const handleToggleFreeze = () => {
    if (player.isFrozen) {
      if (onSendAction) {
        onSendAction('ACTION', { action: 'UNFREEZE', username: player.username });
      } else {
        onSendCommand(`effect clear ${player.username} slowness`);
        onSendCommand(`effect clear ${player.username} jump_boost`);
      }
    } else {
      if (onSendAction) {
        onSendAction('ACTION', {
          action: 'FREEZE',
          username: player.username,
          frostEffect
        });
      } else {
        onSendCommand(`effect give ${player.username} slowness 99999 255 true`);
        onSendCommand(`effect give ${player.username} jump_boost 99999 250 true`);
      }
    }
  };

  const handleToggleMute = () => {
    if (player.isMuted) {
      if (onSendAction) {
        onSendAction('ACTION', { action: 'UNMUTE', username: player.username });
      }
    } else {
      if (onSendAction) {
        onSendAction('ACTION', { action: 'MUTE', username: player.username });
      }
    }
  };

  const handleSmite = () => {
    if (onSendAction) {
      onSendAction('ACTION', { action: 'SMITE', username: player.username });
    } else {
      onSendCommand(`execute at ${player.username} run summon lightning_bolt`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-surface border border-hairline max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/48`}
              alt={player.username}
              className="w-10 h-10 rounded-[6px] border border-hairline"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-ink tracking-[-0.3px]">
                  {player.username}
                </h2>
                {player.isFrozen && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-accent/15 border border-accent/30 text-accent-fg font-mono text-[10px] font-bold">
                    <Snowflake className="w-2.5 h-2.5" />
                    {t('players.frozen')}
                  </span>
                )}
                {player.isMuted && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-danger/15 border border-danger/30 text-danger-fg font-mono text-[10px] font-bold">
                    <VolumeX className="w-2.5 h-2.5" />
                    {t('players.muted')}
                  </span>
                )}
              </div>
              <div className="font-mono text-[12px] text-mute flex items-center gap-1.5 mt-0.5">
                <DimensionIcon dimension={player.dimension} className="w-3.5 h-3.5" />
                <span>{formatDimensionName(player.dimension, t)}</span>
                <span>&bull;</span>
                <span>XYZ: {player.x}, {player.y}, {player.z}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-2 text-mute hover:text-ink transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gamemode Quick Bar */}
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-mute">
            {t('players.gamemode_label')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['survival', 'creative', 'adventure', 'spectator'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleSetGamemode(mode)}
                className="py-1.5 px-2 rounded-[6px] bg-surface-2 hover:bg-ink hover:text-on-ink border border-hairline text-[12px] font-medium capitalize text-body transition cursor-pointer text-center whitespace-nowrap overflow-hidden"
              >
                <SlidingText>{mode}</SlidingText>
              </button>
            ))}
          </div>
        </div>

        {/* Operator Privileges & Inventory Inspection */}
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-mute">
            {t('players.permissions_label')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleOpToggle(true)}
              className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-ink flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
            >
              <Shield className="w-3.5 h-3.5 text-accent-fg shrink-0" />
              <SlidingText>{t('overview.players.op')}</SlidingText>
            </button>
            <button
              type="button"
              onClick={() => handleOpToggle(false)}
              className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-mute flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
            >
              <SlidingText>{t('overview.players.deop')}</SlidingText>
            </button>
            {onInspectInventory && (
              <button
                type="button"
                onClick={() => {
                  onInspectInventory(player);
                  onClose();
                }}
                className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-ink flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
              >
                <Package className="w-3.5 h-3.5 text-ink shrink-0" />
                <SlidingText>{t('players.inventory_button')}</SlidingText>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSendCommand(`clear ${player.username}`)}
              className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-ink flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-warning shrink-0" />
              <SlidingText>{t('overview.players.clear_inventory')}</SlidingText>
            </button>
          </div>
        </div>

        {/* Advanced Admin Controls (Freeze, Mute, Smite, Exp) */}
        <div className="space-y-2 pt-1 border-t border-hairline">
          <label className="font-mono text-[11px] uppercase text-mute">
            {t('players.admin_actions')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleToggleFreeze}
              className={`py-1.5 px-2 rounded-[6px] border text-[12px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0 ${
                player.isFrozen
                  ? 'bg-accent/10 dark:bg-accent/20 border-accent/40 text-accent-fg'
                  : 'bg-surface hover:bg-surface-3 border-hairline text-ink'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5 text-accent-fg shrink-0" />
              <SlidingText>{player.isFrozen ? t('players.unfreeze') : t('players.freeze')}</SlidingText>
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className={`py-1.5 px-2 rounded-[6px] border text-[12px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0 ${
                player.isMuted
                  ? 'bg-danger/10 dark:bg-danger/20 border-danger/40 text-danger-fg'
                  : 'bg-surface hover:bg-surface-3 border-hairline text-ink'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5 text-danger-fg shrink-0" />
              <SlidingText>{player.isMuted ? t('players.unmute') : t('players.mute')}</SlidingText>
            </button>

            <button
              type="button"
              onClick={handleSmite}
              className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-ink flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
            >
              <Zap className="w-3.5 h-3.5 text-warning shrink-0" />
              <SlidingText>{t('players.smite')}</SlidingText>
            </button>

            <button
              type="button"
              onClick={() => setIsExpModalOpen(true)}
              className="py-1.5 px-2 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-ink flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap overflow-hidden min-w-0"
              title={t('players.give_exp')}
            >
              <Award className="w-3.5 h-3.5 text-accent-fg shrink-0" />
              <SlidingText>{t('players.experience')}</SlidingText>
            </button>
          </div>

          {!player.isFrozen && (
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={frostEffect}
                onChange={(e) => setFrostEffect(e.target.checked)}
                className="rounded-[3px] border-hairline text-accent-fg focus:ring-0 shrink-0"
              />
              <span className="text-[11px] text-mute leading-tight">
                {t('players.frost_effect_label')}
              </span>
            </label>
          )}
        </div>

        {/* Teleport Coordinates */}
        <form onSubmit={handleTeleport} className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-mute">
            {t('players.teleport_coords_label')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tpCoords.x}
              onChange={(e) => setTpCoords({ ...tpCoords, x: e.target.value })}
              placeholder="X"
              className="w-16 h-8 px-2 rounded-[6px] bg-surface border border-hairline font-mono text-[12px] text-ink text-center focus:outline-none focus:border-ink"
            />
            <input
              type="text"
              value={tpCoords.y}
              onChange={(e) => setTpCoords({ ...tpCoords, y: e.target.value })}
              placeholder="Y"
              className="w-16 h-8 px-2 rounded-[6px] bg-surface border border-hairline font-mono text-[12px] text-ink text-center focus:outline-none focus:border-ink"
            />
            <input
              type="text"
              value={tpCoords.z}
              onChange={(e) => setTpCoords({ ...tpCoords, z: e.target.value })}
              placeholder="Z"
              className="w-16 h-8 px-2 rounded-[6px] bg-surface border border-hairline font-mono text-[12px] text-ink text-center focus:outline-none focus:border-ink"
            />
            <button
              type="submit"
              className="flex-1 h-8 px-3 rounded-[6px] bg-ink hover:bg-ink-hover text-on-ink text-[12px] font-medium flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs whitespace-nowrap overflow-hidden"
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <SlidingText>{t('overview.players.tp')}</SlidingText>
            </button>
          </div>
        </form>

        {/* Kick & Ban Actions */}
        <div className="pt-2 border-t border-hairline space-y-3">
          <form onSubmit={handleKick} className="flex gap-2">
            <input
              type="text"
              value={kickReason}
              onChange={(e) => setKickReason(e.target.value)}
              placeholder={t('players.kick_reason_placeholder')}
              className="flex-1 h-8 px-2.5 rounded-[6px] bg-surface border border-hairline text-[12px] text-ink placeholder-mute focus:outline-none focus:border-ink"
            />
            <button
              type="submit"
              className="h-8 px-3 rounded-[6px] bg-surface hover:bg-surface-3 border border-hairline text-[12px] font-medium text-body flex items-center gap-1 transition cursor-pointer whitespace-nowrap overflow-hidden"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <SlidingText>{t('overview.players.kick')}</SlidingText>
            </button>
          </form>

          <form onSubmit={handleBan} className="flex gap-2">
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('players.ban_reason_placeholder')}
              className="flex-1 h-8 px-2.5 rounded-[6px] bg-surface border border-danger/30 dark:border-danger/50 text-[12px] text-ink placeholder-mute focus:outline-none focus:border-danger"
            />
            <button
              type="submit"
              className="h-8 px-3 rounded-[6px] bg-danger hover:bg-danger text-white text-[12px] font-medium flex items-center gap-1 transition cursor-pointer shadow-2xs whitespace-nowrap overflow-hidden"
            >
              <Ban className="w-3.5 h-3.5 shrink-0" />
              <SlidingText>{t('overview.players.ban')}</SlidingText>
            </button>
          </form>
        </div>
      </div>

      {isExpModalOpen && (
        <PlayerExperienceModal
          player={player}
          onClose={() => setIsExpModalOpen(false)}
          onGiveExp={(amount, expType, mode) => {
            if (onSendAction) {
              onSendAction('ACTION', {
                action: 'GIVE_EXP',
                username: player.username,
                amount,
                expType,
                mode
              });
            } else {
              onSendCommand(`experience ${mode} ${player.username} ${amount} ${expType}`);
            }
          }}
        />
      )}
    </div>
  );
};
