import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Shield, LogOut, Ban, Navigation, Sparkles } from 'lucide-react';
import type { PlayerState } from '../../types/daemon';
import { DimensionIcon } from '../common/DimensionIcon';

interface PlayerAdminModalProps {
  player: PlayerState | null;
  onClose: () => void;
  onSendCommand: (command: string) => void;
}

export const PlayerAdminModal: React.FC<PlayerAdminModalProps> = ({
  player,
  onClose,
  onSendCommand
}) => {
  const { t } = useTranslation();
  const [kickReason, setKickReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [tpCoords, setTpCoords] = useState({ x: '0', y: '64', z: '0' });

  if (!player) return null;

  const resolvedKickReason = kickReason.trim() || t('players.kick_default_reason');
  const resolvedBanReason = banReason.trim() || t('players.ban_default_reason');

  const handleKick = (e: React.FormEvent) => {
    e.preventDefault();
    onSendCommand(`kick ${player.username} ${resolvedKickReason}`);
    onClose();
  };

  const handleBan = (e: React.FormEvent) => {
    e.preventDefault();
    onSendCommand(`ban ${player.username} ${resolvedBanReason}`);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white dark:bg-[#111111] border border-[#ebebeb] dark:border-[#262626] max-w-lg w-full p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] dark:border-[#262626] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/48`}
              alt={player.username}
              className="w-10 h-10 rounded-[6px] border border-[#ebebeb] dark:border-[#262626]"
            />
            <div>
              <h2 className="text-[16px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.3px]">
                {player.username}
              </h2>
              <div className="font-mono text-[12px] text-[#888888] dark:text-[#a1a1a1] flex items-center gap-1.5 mt-0.5">
                <DimensionIcon dimension={player.dimension} className="w-3.5 h-3.5" />
                <span>{player.dimension}</span>
                <span>&bull;</span>
                <span>XYZ: {player.x}, {player.y}, {player.z}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gamemode Quick Bar */}
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
            {t('players.gamemode_label')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['survival', 'creative', 'adventure', 'spectator'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleSetGamemode(mode)}
                className="py-1.5 px-2 rounded-[6px] bg-[#fafafa] dark:bg-[#141414] hover:bg-[#171717] dark:hover:bg-[#ededed] hover:text-white dark:hover:text-[#171717] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium capitalize text-[#4d4d4d] dark:text-[#ededed] transition cursor-pointer text-center"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Operator Privileges */}
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
            {t('players.permissions_label')}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleOpToggle(true)}
              className="flex-1 py-1.5 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-[#0070f3] dark:text-[#3291ff]" />
              {t('overview.players.op')}
            </button>
            <button
              type="button"
              onClick={() => handleOpToggle(false)}
              className="flex-1 py-1.5 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#888888] dark:text-[#a1a1a1] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {t('overview.players.deop')}
            </button>
            <button
              type="button"
              onClick={() => onSendCommand(`clear ${player.username}`)}
              className="flex-1 py-1.5 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#171717] dark:text-[#ededed] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#f5a623]" />
              {t('overview.players.clear_inventory')}
            </button>
          </div>
        </div>

        {/* Teleport Coordinates */}
        <form onSubmit={handleTeleport} className="space-y-2">
          <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
            {t('players.teleport_coords_label')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tpCoords.x}
              onChange={(e) => setTpCoords({ ...tpCoords, x: e.target.value })}
              placeholder="X"
              className="w-16 h-8 px-2 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] text-center focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
            <input
              type="text"
              value={tpCoords.y}
              onChange={(e) => setTpCoords({ ...tpCoords, y: e.target.value })}
              placeholder="Y"
              className="w-16 h-8 px-2 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] text-center focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
            <input
              type="text"
              value={tpCoords.z}
              onChange={(e) => setTpCoords({ ...tpCoords, z: e.target.value })}
              placeholder="Z"
              className="w-16 h-8 px-2 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] text-center focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
            <button
              type="submit"
              className="flex-1 h-8 px-3 rounded-[6px] bg-[#171717] hover:bg-[#333333] dark:bg-[#ededed] dark:hover:bg-[#ffffff] text-white dark:text-[#171717] text-[12px] font-medium flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs"
            >
              <Navigation className="w-3.5 h-3.5" />
              {t('overview.players.tp')}
            </button>
          </div>
        </form>

        {/* Kick & Ban Actions */}
        <div className="pt-2 border-t border-[#ebebeb] dark:border-[#262626] space-y-3">
          <form onSubmit={handleKick} className="flex gap-2">
            <input
              type="text"
              value={kickReason}
              onChange={(e) => setKickReason(e.target.value)}
              placeholder={t('players.kick_reason_placeholder')}
              className="flex-1 h-8 px-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
            <button
              type="submit"
              className="h-8 px-3 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#f5f5f5] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[12px] font-medium text-[#4d4d4d] dark:text-[#a1a1a1] flex items-center gap-1 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('overview.players.kick')}
            </button>
          </form>

          <form onSubmit={handleBan} className="flex gap-2">
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('players.ban_reason_placeholder')}
              className="flex-1 h-8 px-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ee0000]/30 dark:border-[#ee0000]/50 text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#ee0000]"
            />
            <button
              type="submit"
              className="h-8 px-3 rounded-[6px] bg-[#ee0000] hover:bg-[#cc0000] text-white text-[12px] font-medium flex items-center gap-1 transition cursor-pointer shadow-2xs"
            >
              <Ban className="w-3.5 h-3.5" />
              {t('overview.players.ban')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
