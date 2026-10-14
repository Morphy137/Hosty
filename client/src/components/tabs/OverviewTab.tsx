import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cpu,
  HardDrive,
  Users,
  Terminal,
  Heart,
  Gift,
  Zap,
  Skull,
  LogOut,
  ChevronRight
} from 'lucide-react';
import type { Metrics, PlayerState } from '../../types/daemon';
import { calculateRamPercent } from '../../utils/format';
import { buildPlayerCommand, type PlayerAction } from '../../utils/playerCommands';
import { DimensionIcon } from '../common/DimensionIcon';
import { PlayerActionModal, type DynamicActionType } from '../modals/PlayerActionModal';

interface OverviewTabProps {
  metrics: Metrics;
  players: PlayerState[];
  logs: string[];
  onSendCommand: (command: string) => void;
}

const DIMENSION_STYLES: Record<string, { key: string }> = {
  overworld: { key: 'overview.players.dimension.overworld' },
  the_nether: { key: 'overview.players.dimension.the_nether' },
  the_end: { key: 'overview.players.dimension.the_end' }
};

const QUICK_COMMANDS = [
  { label: 'weather clear', cmd: 'weather clear' },
  { label: 'time set day', cmd: 'time set day' },
  { label: 'save-all', cmd: 'save-all' },
  { label: 'list', cmd: 'list' }
];

export const OverviewTab: React.FC<OverviewTabProps> = ({
  metrics,
  players,
  logs,
  onSendCommand
}) => {
  const { t } = useTranslation();
  const [commandInput, setCommandInput] = useState('');
  const [actionTarget, setActionTarget] = useState<{
    player: PlayerState;
    type: DynamicActionType;
  } | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const ramPercent = calculateRamPercent(metrics.ramMb, metrics.maxRamMb);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    onSendCommand(trimmed);
    setCommandInput('');
  };

  const handlePlayerAction = (username: string, action: PlayerAction) => {
    const cmd = buildPlayerCommand(action, username, 'Kicked by administrator');
    onSendCommand(cmd);
  };

  return (
    <>
      {/* Top 3-Up Metric Strip */}
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <div className="geist-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.cpu')}
            </span>
            <Cpu className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
              {metrics.cpu}%
            </span>
            <span className="font-mono text-[12px] text-[#888888]">java.exe</span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-[#171717] transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.cpu)}%` }}
            />
          </div>
        </div>

        <div className="geist-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.ram')}
            </span>
            <HardDrive className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
              {metrics.ramMb} MB
            </span>
            <span className="font-mono text-[12px] text-[#888888]">
              / {metrics.maxRamMb} MB ({ramPercent}%)
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[#f5f5f5] rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-[#171717] transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>

        <div className="geist-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[12px] uppercase text-[#888888]">
              {t('overview.metrics.players_online')}
            </span>
            <Users className="w-4 h-4 text-[#888888]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[24px] font-semibold tracking-[-0.96px] text-[#171717]">
              {players.length}
            </span>
            <span className="font-mono text-[12px] text-[#0070f3]">
              Active Sessions
            </span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[#4d4d4d]">
            <span>{t('overview.controls.address')}:</span>
            <span className="font-mono text-[#171717]">localhost:25565</span>
          </div>
        </div>
      </div>

      {/* Lower Split Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Connected Players Table/Cards */}
        <div className="col-span-5 geist-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#fafafa]/50">
            <div>
              <h2 className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
                {t('overview.players.title')}
              </h2>
            </div>
            <span className="font-mono text-[12px] text-[#888888]">
              {players.length} online
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ebebeb]">
            {players.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <p className="text-[14px] font-medium text-[#171717]">
                  {t('overview.players.empty')}
                </p>
                <p className="text-[13px] text-[#888888] mt-1 max-w-xs">
                  Awaiting player connections or use &ldquo;{t('header.mock_button')}&rdquo; to simulate activity.
                </p>
              </div>
            ) : (
              players.map((p) => {
                const dimStyle = DIMENSION_STYLES[p.dimension] || {
                  key: 'overview.players.dimension.overworld',
                  dot: 'bg-[#888888]'
                };
                const dimLabel = t(dimStyle.key, { defaultValue: p.dimension });

                return (
                  <div
                    key={p.username}
                    className="p-4 hover:bg-[#fafafa] transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://mc-heads.net/avatar/${p.username}/40`}
                          alt={p.username}
                          className="w-9 h-9 rounded-[6px] border border-[#ebebeb]"
                        />
                        <div>
                          <div className="text-[14px] font-medium tracking-[-0.28px] text-[#171717]">
                            {p.username}
                          </div>
                          <div className="font-mono text-[12px] text-[#888888]">
                            XYZ: {p.x}, {p.y}, {p.z}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#fafafa] border border-[#ebebeb] font-mono text-[11px] text-[#4d4d4d]">
                        <DimensionIcon dimension={p.dimension} className="w-3.5 h-3.5" />
                        {dimLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'HEAL' })}
                        className="flex-1 h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Heart className="w-3 h-3 text-[#ee0000]" />
                        {t('overview.players.feed')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'GIFT' })}
                        className="flex-1 h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Gift className="w-3 h-3 text-[#0070f3]" />
                        Gift
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionTarget({ player: p, type: 'DAMAGE' })}
                        className="flex-1 h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#171717] flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Zap className="w-3 h-3 text-[#f5a623]" />
                        Hurt
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KILL')}
                        className="flex-1 h-7 rounded-[4px] bg-white hover:bg-[#f7d4d6]/40 border border-[#ebebeb] text-[12px] font-medium text-[#ee0000] flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Skull className="w-3 h-3" />
                        Kill
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayerAction(p.username, 'KICK')}
                        className="flex-1 h-7 rounded-[4px] bg-white hover:bg-[#f5f5f5] border border-[#ebebeb] text-[12px] font-medium text-[#4d4d4d] flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" />
                        {t('overview.players.kick')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Console */}
        <div className="col-span-7 rounded-[8px] bg-[#171717] text-white flex flex-col overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#2e2e2e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#888888]" />
              <span className="font-mono text-[12px] text-[#f2f2f2]">
                stdout — server.jar
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {QUICK_COMMANDS.map((item) => (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => onSendCommand(item.cmd)}
                  className="px-2 py-0.5 rounded-[4px] bg-[#262626] hover:bg-[#333333] font-mono text-[11px] text-[#a1a1a1] hover:text-white transition cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-[13px] leading-[20px] space-y-1">
            {logs.length === 0 ? (
              <div className="text-[#888888]">
                Ready. Awaiting process output stream...
              </div>
            ) : (
              logs.map((line, idx) => (
                <div
                  key={idx}
                  className={`break-all ${
                    line.includes('WARN')
                      ? 'text-[#f5a623]'
                      : line.includes('ERROR')
                      ? 'text-[#ee0000]'
                      : line.startsWith('>')
                      ? 'text-[#50e3c2]'
                      : 'text-[#e5e5e5]'
                  }`}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>

          <form
            onSubmit={handleCommandSubmit}
            className="p-2.5 border-t border-[#2e2e2e] bg-[#111111] flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 text-[#888888] ml-1" />
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={t('overview.console.placeholder')}
              className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder-[#888888] focus:outline-none"
            />
            <button
              type="submit"
              className="h-7 px-3 rounded-[6px] bg-white hover:bg-[#e5e5e5] text-[#171717] text-[12px] font-medium transition cursor-pointer"
            >
              {t('overview.console.send')}
            </button>
          </form>
        </div>
      </div>

      {actionTarget && (
        <PlayerActionModal
          player={actionTarget.player}
          actionType={actionTarget.type}
          onClose={() => setActionTarget(null)}
          onExecute={onSendCommand}
        />
      )}
    </>
  );
};
