import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Heart, Zap, Gift, Check } from 'lucide-react';
import type { PlayerState } from '../../types/daemon';
import { Slider } from '../common/Slider';
import { ItemSlotIcon } from '../common/ItemSlotIcon';
import { SlidingText } from '../common/SlidingText';

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
      <div className="geist-card bg-white dark:bg-[#111111] border border-[#ebebeb] dark:border-[#262626] max-w-md w-full p-6 shadow-2xl flex flex-col gap-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#ebebeb] dark:border-[#262626] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/40`}
              alt={player.username}
              className="w-9 h-9 rounded-[6px] border border-[#ebebeb] dark:border-[#262626]"
            />
            <div>
              <h2 className="text-[15px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.3px] flex items-center gap-1.5">
                {actionType === 'HEAL' && (
                  <>
                    <Heart className="w-4 h-4 text-[#0070f3] dark:text-[#50e3c2]" />
                    <SlidingText>{t('players.actions.heal_title', { player: player.username })}</SlidingText>
                  </>
                )}
                {actionType === 'DAMAGE' && (
                  <>
                    <Zap className="w-4 h-4 text-[#ee0000] dark:text-[#ff4d4d]" />
                    <SlidingText>{t('players.actions.damage_title', { player: player.username })}</SlidingText>
                  </>
                )}
                {actionType === 'GIFT' && (
                  <>
                    <Gift className="w-4 h-4 text-[#0070f3] dark:text-[#3291ff]" />
                    <SlidingText>{t('players.actions.gift_title', { player: player.username })}</SlidingText>
                  </>
                )}
              </h2>
              <p className="text-[12px] text-[#888888] dark:text-[#a1a1a1]">{player.username}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[6px] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* HEAL CONFIGURATION */}
          {actionType === 'HEAL' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#888888] dark:text-[#a1a1a1]">
                    {t('players.actions.heal_amount')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-[#e6f7ff] dark:bg-[#071f38] text-[#0070f3] dark:text-[#3291ff] border border-[#0070f3]/25 shadow-2xs">
                    <Heart className="w-3 h-3 fill-[#0070f3] dark:fill-[#3291ff]" />
                    <span>{healHearts} {t('players.actions.hearts_label')}</span>
                  </span>
                </div>

                <Slider
                  min={1}
                  max={20}
                  value={healHearts}
                  onChange={setHealHearts}
                  variant="success"
                  ariaLabel={t('players.actions.heal_amount')}
                />

                {/* Heal Presets (Shadcn Segmented Control) */}
                <div className="flex p-1 rounded-[8px] bg-[#f5f5f5] dark:bg-[#171717] border border-[#ebebeb] dark:border-[#262626] gap-1">
                  {[2, 6, 10, 20].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHealHearts(h)}
                      className={`flex-1 py-1 rounded-[6px] font-mono text-[11px] transition-all cursor-pointer text-center ${
                        healHearts === h
                          ? 'bg-white dark:bg-[#262626] text-[#171717] dark:text-[#ededed] shadow-xs border border-[#e5e5e5] dark:border-[#383838] font-semibold'
                          : 'text-[#666666] dark:text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] hover:bg-white/60 dark:hover:bg-[#262626]/50 border border-transparent'
                      }`}
                    >
                      {h} {t('players.actions.hearts_label')}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 pt-1 text-[13px] text-[#171717] dark:text-[#ededed] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={healFeed}
                  onChange={(e) => setHealFeed(e.target.checked)}
                  className="w-4 h-4 rounded-[4px] border-[#d4d4d4] dark:border-[#383838] accent-[#171717] dark:accent-[#ededed] cursor-pointer"
                />
                <span>{t('players.actions.feed_checkbox')}</span>
              </label>
            </div>
          )}

          {/* DAMAGE CONFIGURATION */}
          {actionType === 'DAMAGE' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#888888] dark:text-[#a1a1a1]">
                    {t('players.actions.damage_amount')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-[#fff0f0] dark:bg-[#2b1114] text-[#ee0000] dark:text-[#ff6b6b] border border-[#ee0000]/25 shadow-2xs">
                    <Zap className="w-3 h-3 fill-[#ee0000] text-[#ee0000]" />
                    <span>{damageAmount} HP ({damageAmount / 2} {t('players.actions.hearts_label')})</span>
                  </span>
                </div>

                <Slider
                  min={1}
                  max={20}
                  value={damageAmount}
                  onChange={setDamageAmount}
                  variant="danger"
                  ariaLabel={t('players.actions.damage_amount')}
                />

                {/* Damage Presets (Shadcn Segmented Control) */}
                <div className="flex p-1 rounded-[8px] bg-[#f5f5f5] dark:bg-[#171717] border border-[#ebebeb] dark:border-[#262626] gap-1">
                  {[2, 4, 10, 19].map((hp) => (
                    <button
                      key={hp}
                      type="button"
                      onClick={() => setDamageAmount(hp)}
                      className={`flex-1 py-1 rounded-[6px] font-mono text-[11px] transition-all cursor-pointer text-center ${
                        damageAmount === hp
                          ? 'bg-white dark:bg-[#262626] text-[#171717] dark:text-[#ededed] shadow-xs border border-[#e5e5e5] dark:border-[#383838] font-semibold'
                          : 'text-[#666666] dark:text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] hover:bg-white/60 dark:hover:bg-[#262626]/50 border border-transparent'
                      }`}
                    >
                      {hp} HP
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GIFT CONFIGURATION */}
          {actionType === 'GIFT' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-mono text-[11px] uppercase tracking-wider text-[#888888] dark:text-[#a1a1a1]">
                  {t('players.actions.gift_select_item')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {COMMON_GIFT_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setGiftItem(item.id);
                        setGiftCustomItem('');
                      }}
                      className={`flex items-center gap-2 p-2 rounded-[6px] border text-left text-[12px] font-medium transition-all cursor-pointer ${
                        giftItem === item.id && !giftCustomItem
                          ? 'bg-white dark:bg-[#1a1a1a] text-[#171717] dark:text-[#ededed] border-[#0070f3] dark:border-[#3291ff] ring-1 ring-[#0070f3] dark:ring-[#3291ff] shadow-xs'
                          : 'bg-[#fafafa] dark:bg-[#141414] hover:bg-[#f0f0f0] dark:hover:bg-[#1f1f1f] text-[#666666] dark:text-[#a1a1a1] border-[#ebebeb] dark:border-[#262626]'
                      }`}
                    >
                      <ItemSlotIcon id={item.id} fallbackText={item.label} className="w-5 h-5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[11px] uppercase tracking-wider text-[#888888] dark:text-[#a1a1a1]">
                  {t('players.actions.gift_custom_item')}
                </label>
                <input
                  type="text"
                  placeholder={t('players.actions.custom_item_placeholder')}
                  value={giftCustomItem}
                  onChange={(e) => setGiftCustomItem(e.target.value)}
                  className="w-full h-8.5 px-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#0070f3] dark:focus:border-[#3291ff] transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#888888] dark:text-[#a1a1a1]">
                    {t('players.actions.gift_quantity')}
                  </span>
                  <span className="font-mono text-[12px] text-[#171717] dark:text-[#ededed] font-semibold">
                    {giftQuantity}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={giftQuantity}
                    onChange={(e) => setGiftQuantity(Number(e.target.value))}
                    className="w-20 h-8.5 px-2.5 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] focus:outline-none focus:border-[#0070f3] dark:focus:border-[#3291ff] text-center"
                  />
                  {/* Quantity Presets (Shadcn Segmented Control) */}
                  <div className="flex p-1 rounded-[8px] bg-[#f5f5f5] dark:bg-[#171717] border border-[#ebebeb] dark:border-[#262626] gap-1 flex-1">
                    {[1, 16, 32, 64].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setGiftQuantity(qty)}
                        className={`flex-1 py-1 rounded-[6px] font-mono text-[11px] transition-all cursor-pointer text-center ${
                          giftQuantity === qty
                            ? 'bg-white dark:bg-[#262626] text-[#171717] dark:text-[#ededed] shadow-xs border border-[#e5e5e5] dark:border-[#383838] font-semibold'
                            : 'text-[#666666] dark:text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] hover:bg-white/60 dark:hover:bg-[#262626]/50 border border-transparent'
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
          <div className="flex gap-2.5 pt-3 border-t border-[#ebebeb] dark:border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-[6px] bg-white dark:bg-[#141414] hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] border border-[#ebebeb] dark:border-[#262626] text-[13px] font-medium text-[#666666] hover:text-[#171717] dark:text-[#a1a1a1] dark:hover:text-[#ededed] transition-colors cursor-pointer"
            >
              <SlidingText>{t('common.cancel')}</SlidingText>
            </button>
            <button
              type="submit"
              className="flex-1 h-9 rounded-[6px] bg-[#171717] hover:bg-[#262626] dark:bg-[#ededed] dark:hover:bg-[#ffffff] text-white dark:text-[#171717] text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <SlidingText>{t('players.actions.execute_button')}</SlidingText>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
