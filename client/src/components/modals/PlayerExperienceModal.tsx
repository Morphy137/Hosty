import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Award, Check } from 'lucide-react';
import type { PlayerState } from '../../types/daemon';
import { Slider } from '../ui/Slider';
import { SlidingText } from '../common/SlidingText';

interface PlayerExperienceModalProps {
  player: PlayerState | null;
  onClose: () => void;
  onGiveExp: (amount: number, expType: 'levels' | 'points', mode: 'add' | 'set') => void;
}

export const PlayerExperienceModal: React.FC<PlayerExperienceModalProps> = ({
  player,
  onClose,
  onGiveExp
}) => {
  const { t } = useTranslation();
  const [expType, setExpType] = useState<'levels' | 'points'>('levels');
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const [amount, setAmount] = useState<number>(10);

  if (!player) return null;

  const handleTypeChange = (newType: 'levels' | 'points') => {
    setExpType(newType);
    setAmount(newType === 'levels' ? 10 : 250);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGiveExp(amount, expType, mode);
    onClose();
  };

  const maxAmount = expType === 'levels' ? 100 : 3000;
  const levelPresets = [5, 15, 30, 50, 100];
  const pointPresets = [50, 150, 500, 1000, 2500];

  return createPortal(
    <div className="fixed inset-0 z-9999 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-surface border border-hairline max-w-md w-full p-6 shadow-2xl flex flex-col gap-5 h-[min(34rem,90vh)] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/40`}
              alt={player.username}
              className="w-9 h-9 rounded-[6px] border border-hairline"
            />
            <div>
              <h2 className="text-[15px] font-semibold text-ink tracking-[-0.3px] flex items-center gap-1.5">
                <Award className="w-4 h-4 text-accent-fg" />
                <SlidingText>{t('players.experience_modal.title', { player: player.username })}</SlidingText>
              </h2>
              <p className="text-[12px] text-mute">{player.username}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[6px] hover:bg-surface-2 text-mute hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Unit Type Selection (Levels vs Points) */}
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-mute">
              {t('players.experience_modal.type_label')}
            </label>
            <div className="flex p-1 rounded-[8px] bg-surface-3 border border-hairline gap-1">
              <button
                type="button"
                onClick={() => handleTypeChange('levels')}
                className={`flex-1 py-1.5 rounded-[6px] font-mono text-[12px] transition-all cursor-pointer text-center ${
                  expType === 'levels'
                    ? 'bg-surface-3 text-ink shadow-xs border border-hairline-strong font-semibold'
                    : 'text-soft hover:text-ink hover:bg-white/60 dark:hover:bg-surface-3/50 border border-transparent'
                }`}
              >
                {t('players.experience_modal.type_levels')}
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('points')}
                className={`flex-1 py-1.5 rounded-[6px] font-mono text-[12px] transition-all cursor-pointer text-center ${
                  expType === 'points'
                    ? 'bg-surface-3 text-ink shadow-xs border border-hairline-strong font-semibold'
                    : 'text-soft hover:text-ink hover:bg-white/60 dark:hover:bg-surface-3/50 border border-transparent'
                }`}
              >
                {t('players.experience_modal.type_points')}
              </button>
            </div>
          </div>

          {/* Action Mode (Add vs Set) */}
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-mute">
              {t('players.experience_modal.mode_label')}
            </label>
            <div className="flex p-1 rounded-[8px] bg-surface-3 border border-hairline gap-1">
              <button
                type="button"
                onClick={() => setMode('add')}
                className={`flex-1 py-1.5 rounded-[6px] font-mono text-[12px] transition-all cursor-pointer text-center ${
                  mode === 'add'
                    ? 'bg-surface-3 text-ink shadow-xs border border-hairline-strong font-semibold'
                    : 'text-soft hover:text-ink hover:bg-white/60 dark:hover:bg-surface-3/50 border border-transparent'
                }`}
              >
                {t('players.experience_modal.mode_add')}
              </button>
              <button
                type="button"
                onClick={() => setMode('set')}
                className={`flex-1 py-1.5 rounded-[6px] font-mono text-[12px] transition-all cursor-pointer text-center ${
                  mode === 'set'
                    ? 'bg-surface-3 text-ink shadow-xs border border-hairline-strong font-semibold'
                    : 'text-soft hover:text-ink hover:bg-white/60 dark:hover:bg-surface-3/50 border border-transparent'
                }`}
              >
                {t('players.experience_modal.mode_set')}
              </button>
            </div>
          </div>

          {/* Amount Configuration */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-mute">
                {t('players.experience_modal.amount_label')}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-success-soft text-success-fg border border-success/30 shadow-2xs">
                <Award className="w-3 h-3 text-success-fg" />
                <span>
                  {mode === 'add' ? '+' : ''}{amount}{' '}
                  {expType === 'levels'
                    ? t('players.experience_modal.levels')
                    : t('players.experience_modal.points')}
                </span>
              </span>
            </div>

            <Slider
              min={1}
              max={maxAmount}
              value={amount}
              onChange={setAmount}
              variant="success"
              ariaLabel={t('players.experience_modal.amount_label')}
            />

            {/* Presets */}
            <div className="flex p-1 rounded-[8px] bg-surface-3 border border-hairline gap-1">
              {(expType === 'levels' ? levelPresets : pointPresets).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val)}
                  className={`flex-1 py-1 rounded-[6px] font-mono text-[11px] transition-all cursor-pointer text-center ${
                    amount === val
                      ? 'bg-surface-3 text-ink shadow-xs border border-hairline-strong font-semibold'
                      : 'text-soft hover:text-ink hover:bg-white/60 dark:hover:bg-surface-3/50 border border-transparent'
                  }`}
                >
                  {val}{expType === 'levels' ? 'L' : ' XP'}
                </button>
              ))}
            </div>

            {/* Direct Number Input */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[12px] text-mute">
                {t('players.experience_modal.exact_value')}:
              </span>
              <input
                type="number"
                min={1}
                max={999999}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
                className="w-28 h-8 px-2.5 rounded-[6px] bg-surface border border-hairline font-mono text-[12px] text-ink focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex gap-2.5 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-[6px] bg-surface hover:bg-surface-2 border border-hairline text-[13px] font-medium text-soft hover:text-ink transition-colors cursor-pointer"
            >
              <SlidingText>{t('common.cancel')}</SlidingText>
            </button>
            <button
              type="submit"
              className="flex-1 h-9 rounded-[6px] bg-ink hover:bg-ink-hover text-on-ink text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <SlidingText>{t('players.experience_modal.submit')}</SlidingText>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
