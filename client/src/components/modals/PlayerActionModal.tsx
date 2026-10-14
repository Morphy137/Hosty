import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Heart, Zap, Gift, Check } from 'lucide-react';
import type { PlayerState } from '../../types/daemon';

export type DynamicActionType = 'HEAL' | 'DAMAGE' | 'GIFT';

interface PlayerActionModalProps {
  player: PlayerState | null;
  actionType: DynamicActionType | null;
  onClose: () => void;
  onExecute: (command: string) => void;
}

const COMMON_GIFT_ITEMS = [
  { id: 'minecraft:diamond', label: 'Diamond' },
  { id: 'minecraft:emerald', label: 'Emerald' },
  { id: 'minecraft:golden_apple', label: 'Golden Apple' },
  { id: 'minecraft:cooked_beef', label: 'Steak' },
  { id: 'minecraft:netherite_ingot', label: 'Netherite' },
  { id: 'minecraft:totem_of_undying', label: 'Totem' }
] as const;

export const PlayerActionModal: React.FC<PlayerActionModalProps> = ({
  player,
  actionType,
  onClose,
  onExecute
}) => {
  const { t } = useTranslation();

  // Heal state
  const [healHearts, setHealHearts] = useState<number>(10);
  const [healFeed, setHealFeed] = useState<boolean>(true);

  // Damage state
  const [damageAmount, setDamageAmount] = useState<number>(4);

  // Gift state
  const [giftItem, setGiftItem] = useState<string>('minecraft:diamond');
  const [giftCustomItem, setGiftCustomItem] = useState<string>('');
  const [giftQuantity, setGiftQuantity] = useState<number>(16);

  if (!player || !actionType) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (actionType === 'HEAL') {
      const amplifier = Math.max(1, Math.min(10, Math.ceil(healHearts / 2)));
      onExecute(`effect give ${player.username} minecraft:instant_health 1 ${amplifier}`);
      if (healFeed) {
        onExecute(`effect give ${player.username} minecraft:saturation 2 5`);
      }
    } else if (actionType === 'DAMAGE') {
      const dmg = Math.max(1, Math.min(100, damageAmount));
      onExecute(`damage ${player.username} ${dmg}`);
    } else if (actionType === 'GIFT') {
      const selected = giftCustomItem.trim() || giftItem;
      const qty = Math.max(1, Math.min(64, giftQuantity));
      onExecute(`give ${player.username} ${selected} ${qty}`);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white max-w-md w-full p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/40`}
              alt={player.username}
              className="w-9 h-9 rounded-[4px] border border-[#ebebeb]"
            />
            <div>
              <h2 className="text-[15px] font-semibold text-[#171717] tracking-[-0.3px] flex items-center gap-1.5">
                {actionType === 'HEAL' && (
                  <>
                    <Heart className="w-4 h-4 text-[#ee0000]" />
                    <span>{t('players.actions.heal_title', { player: player.username })}</span>
                  </>
                )}
                {actionType === 'DAMAGE' && (
                  <>
                    <Zap className="w-4 h-4 text-[#f5a623]" />
                    <span>{t('players.actions.damage_title', { player: player.username })}</span>
                  </>
                )}
                {actionType === 'GIFT' && (
                  <>
                    <Gift className="w-4 h-4 text-[#0070f3]" />
                    <span>{t('players.actions.gift_title', { player: player.username })}</span>
                  </>
                )}
              </h2>
              <p className="text-[12px] text-[#888888]">{player.username}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[4px] hover:bg-[#fafafa] text-[#888888] hover:text-[#171717] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* HEAL CONFIGURATION */}
          {actionType === 'HEAL' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888] flex justify-between">
                  <span>{t('players.actions.heal_amount')}</span>
                  <span className="text-[#171717] font-semibold">{healHearts} Hearts</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={healHearts}
                  onChange={(e) => setHealHearts(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#f0f0f0] rounded-[2px] appearance-none cursor-pointer accent-[#171717]"
                />
                <div className="flex justify-between font-mono text-[10px] text-[#888888]">
                  <span>1 Heart</span>
                  <span>10 (Full)</span>
                  <span>20 (Boost)</span>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-[13px] text-[#171717] cursor-pointer">
                <input
                  type="checkbox"
                  checked={healFeed}
                  onChange={(e) => setHealFeed(e.target.checked)}
                  className="rounded-[3px] border-[#ebebeb] text-[#171717] focus:ring-0 cursor-pointer"
                />
                <span>{t('players.actions.feed_checkbox')}</span>
              </label>
            </div>
          )}

          {/* DAMAGE CONFIGURATION */}
          {actionType === 'DAMAGE' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888] flex justify-between">
                  <span>{t('players.actions.damage_amount')}</span>
                  <span className="text-[#ee0000] font-semibold">{damageAmount} HP ({damageAmount / 2} Hearts)</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#f0f0f0] rounded-[2px] appearance-none cursor-pointer accent-[#ee0000]"
                />
              </div>

              {/* Damage Presets */}
              <div className="flex gap-2">
                {[2, 4, 10, 19].map((hp) => (
                  <button
                    key={hp}
                    type="button"
                    onClick={() => setDamageAmount(hp)}
                    className={`flex-1 py-1 rounded-[4px] border font-mono text-[11px] transition cursor-pointer ${
                      damageAmount === hp
                        ? 'bg-[#171717] text-white border-[#171717]'
                        : 'bg-[#fafafa] hover:bg-[#f5f5f5] text-[#4d4d4d] border-[#ebebeb]'
                    }`}
                  >
                    {hp} HP
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* GIFT CONFIGURATION */}
          {actionType === 'GIFT' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888]">
                  {t('players.actions.gift_select_item')}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {COMMON_GIFT_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setGiftItem(item.id);
                        setGiftCustomItem('');
                      }}
                      className={`p-2 rounded-[4px] border text-left text-[12px] font-medium transition cursor-pointer ${
                        giftItem === item.id && !giftCustomItem
                          ? 'bg-[#171717] text-white border-[#171717]'
                          : 'bg-[#fafafa] hover:bg-[#f5f5f5] text-[#171717] border-[#ebebeb]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888]">
                  {t('players.actions.gift_custom_item')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. minecraft:nether_star"
                  value={giftCustomItem}
                  onChange={(e) => setGiftCustomItem(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[4px] border border-[#ebebeb] font-mono text-[12px] text-[#171717] focus:outline-none focus:border-[#171717]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[11px] uppercase text-[#888888] flex justify-between">
                  <span>{t('players.actions.gift_quantity')}</span>
                  <span className="text-[#171717] font-semibold">{giftQuantity}</span>
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={giftQuantity}
                    onChange={(e) => setGiftQuantity(Number(e.target.value))}
                    className="w-20 h-8 px-2.5 rounded-[4px] border border-[#ebebeb] font-mono text-[12px] text-[#171717] focus:outline-none focus:border-[#171717]"
                  />
                  <div className="flex gap-1.5 flex-1">
                    {[1, 16, 32, 64].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setGiftQuantity(qty)}
                        className={`flex-1 h-8 rounded-[4px] border font-mono text-[11px] transition cursor-pointer ${
                          giftQuantity === qty
                            ? 'bg-[#171717] text-white border-[#171717]'
                            : 'bg-[#fafafa] hover:bg-[#f5f5f5] text-[#4d4d4d] border-[#ebebeb]'
                        }`}
                      >
                        {qty}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer Buttons */}
          <div className="flex gap-2 pt-2 border-t border-[#ebebeb]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-[4px] bg-white hover:bg-[#fafafa] border border-[#ebebeb] text-[13px] font-medium text-[#4d4d4d] transition cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 h-9 rounded-[4px] bg-[#171717] hover:bg-[#333333] text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {t('players.actions.execute_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
