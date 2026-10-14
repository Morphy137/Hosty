import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  RotateCcw,
  Trash2,
  Shield,
  Loader2,
  Sparkles,
  Package
} from 'lucide-react';
import type { PlayerState, PlayerInventoryData, InventorySlotItem } from '../../types/daemon';
import { formatDimensionName } from '../../utils/format';
import { DimensionIcon } from '../common/DimensionIcon';

interface PlayerInventoryModalProps {
  player: PlayerState | null;
  inventory: PlayerInventoryData | null;
  isLoading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onClearInventory: () => void;
}

export const PlayerInventoryModal: React.FC<PlayerInventoryModalProps> = ({
  player,
  inventory,
  isLoading,
  onClose,
  onRefresh,
  onClearInventory
}) => {
  const { t } = useTranslation();
  const [hoveredItem, setHoveredItem] = useState<{
    item: InventorySlotItem;
    x: number;
    y: number;
  } | null>(null);

  if (!player) return null;

  const handleMouseEnter = (item: InventorySlotItem | null, e: React.MouseEvent) => {
    if (!item) {
      setHoveredItem(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem({
      item,
      x: rect.right + 10,
      y: rect.top
    });
  };

  const renderSlot = (item: InventorySlotItem | null, slotIndex: number, fallbackIcon?: React.ReactNode) => {
    const hasItem = item !== null && item !== undefined;
    const durPercent =
      hasItem && item.damage !== undefined && item.maxDamage
        ? Math.max(0, Math.min(100, Math.round(((item.maxDamage - item.damage) / item.maxDamage) * 100)))
        : null;

    // Item ID display label (clean without minecraft: prefix for simple view)
    const shortName = hasItem
      ? item.customName ||
        item.id
          .replace(/^.*:/, '')
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : '';

    return (
      <div
        key={slotIndex}
        onMouseEnter={(e) => handleMouseEnter(item, e)}
        onMouseLeave={() => setHoveredItem(null)}
        className={`relative w-11 h-11 rounded-[4px] border flex items-center justify-center select-none transition ${
          hasItem
            ? 'bg-[#1e1e1e] border-[#383838] hover:border-[#50e3c2]/80 hover:bg-[#252525] cursor-pointer shadow-2xs'
            : 'bg-[#141414]/60 border-[#262626]'
        }`}
      >
        {hasItem ? (
          <>
            {/* Visual Icon / Letter Badge */}
            <div className="flex flex-col items-center justify-center p-1 text-center">
              <span className="font-mono text-[10px] font-bold text-[#ededed] leading-tight truncate max-w-[38px]">
                {shortName.slice(0, 3).toUpperCase()}
              </span>
            </div>

            {/* Stack count badge */}
            {item.count > 1 && (
              <span className="absolute bottom-0.5 right-1 font-mono text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                {item.count}
              </span>
            )}

            {/* Durability bar */}
            {durPercent !== null && (
              <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-[#000000] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    durPercent > 50
                      ? 'bg-[#50e3c2]'
                      : durPercent > 20
                      ? 'bg-[#f5a623]'
                      : 'bg-[#ee0000]'
                  }`}
                  style={{ width: `${durPercent}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="text-[#333333] flex items-center justify-center">
            {fallbackIcon}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-[#111111] border border-[#262626] text-white max-w-2xl w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#262626] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/40`}
              alt={player.username}
              className="w-10 h-10 rounded-[6px] border border-[#262626]"
            />
            <div>
              <h2 className="text-[16px] font-semibold text-[#ededed] tracking-[-0.3px] flex items-center gap-2">
                <Package className="w-4 h-4 text-[#0070f3]" />
                <span>{t('inventory.modal_title', { player: player.username })}</span>
              </h2>
              <div className="font-mono text-[12px] text-[#888888] flex items-center gap-2 mt-0.5">
                <span>{player.username}</span>
                <span>&bull;</span>
                <span className="inline-flex items-center gap-1">
                  <DimensionIcon dimension={player.dimension} className="w-3.5 h-3.5" />
                  <span>{formatDimensionName(player.dimension, t)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-8 px-2.5 rounded-[4px] bg-[#1a1a1a] hover:bg-[#262626] border border-[#333333] text-[12px] font-medium text-[#ededed] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title={t('inventory.refresh')}
            >
              <RotateCcw className={`w-3.5 h-3.5 text-[#888888] ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t('inventory.refresh')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[4px] hover:bg-[#1a1a1a] text-[#888888] hover:text-[#ededed] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {isLoading && !inventory ? (
          <div className="h-64 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#0070f3] animate-spin" />
            <p className="text-[13px] text-[#888888]">{t('inventory.loading')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-6 items-start justify-center">
              {/* Left Column: Equipment (Armor & Offhand) */}
              <div className="space-y-2">
                <span className="font-mono text-[10px] uppercase text-[#888888] tracking-wider block text-center">
                  {t('inventory.equipment')}
                </span>
                <div className="flex flex-col gap-1.5 p-2 rounded-[6px] bg-[#0a0a0a] border border-[#262626]">
                  {/* Helmet: slot 39 (index 0 in armor array) */}
                  {renderSlot(inventory?.armor?.[0] ?? null, 39, <span className="font-mono text-[9px] font-bold">HLM</span>)}
                  {/* Chestplate: slot 38 (index 1) */}
                  {renderSlot(inventory?.armor?.[1] ?? null, 38, <span className="font-mono text-[9px] font-bold">CHS</span>)}
                  {/* Leggings: slot 37 (index 2) */}
                  {renderSlot(inventory?.armor?.[2] ?? null, 37, <span className="font-mono text-[9px] font-bold">LEG</span>)}
                  {/* Boots: slot 36 (index 3) */}
                  {renderSlot(inventory?.armor?.[3] ?? null, 36, <span className="font-mono text-[9px] font-bold">BOT</span>)}

                  {/* Offhand: slot 40 */}
                  <div className="pt-2 border-t border-[#262626]">
                    {renderSlot(inventory?.offhand ?? null, 40, <Shield className="w-4 h-4" />)}
                  </div>
                </div>
              </div>

              {/* Right Area: Main Inventory & Hotbar */}
              <div className="space-y-4">
                {/* 27 Main Inventory Slots (3 rows of 9) */}
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] uppercase text-[#888888] tracking-wider block">
                    {t('inventory.main_inventory')}
                  </span>
                  <div className="p-2.5 rounded-[6px] bg-[#0a0a0a] border border-[#262626] grid grid-cols-9 gap-1.5">
                    {Array.from({ length: 27 }).map((_, idx) => {
                      const item = inventory?.inventory?.[idx] ?? null;
                      return renderSlot(item, idx + 9);
                    })}
                  </div>
                </div>

                {/* 9 Hotbar Slots */}
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] uppercase text-[#888888] tracking-wider block">
                    {t('inventory.hotbar')}
                  </span>
                  <div className="p-2.5 rounded-[6px] bg-[#0a0a0a] border border-[#262626] grid grid-cols-9 gap-1.5">
                    {Array.from({ length: 9 }).map((_, idx) => {
                      const item = inventory?.hotbar?.[idx] ?? null;
                      return renderSlot(item, idx);
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-2 border-t border-[#262626] flex items-center justify-between">
              <span className="text-[11px] text-[#666666]">
                {t('inventory.mod_support_hint')}
              </span>

              <button
                type="button"
                onClick={onClearInventory}
                className="h-8 px-3 rounded-[4px] bg-[#1f1214] hover:bg-[#381215] border border-[#ee0000]/30 text-[12px] font-medium text-[#ee0000] flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('inventory.clear_inventory_button')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Hover Tooltip Portal */}
        {hoveredItem && (
          <div
            className="fixed z-50 pointer-events-none p-3 rounded-[6px] bg-[#171717] border border-[#333333] shadow-2xl max-w-xs space-y-1 font-mono text-[11px]"
            style={{
              left: `${Math.min(window.innerWidth - 300, hoveredItem.x)}px`,
              top: `${Math.min(window.innerHeight - 150, hoveredItem.y)}px`
            }}
          >
            <div className="text-[13px] font-bold text-[#ededed] flex items-center gap-1.5">
              {hoveredItem.item.customName ? (
                <span className="italic text-[#f5a623]">{hoveredItem.item.customName}</span>
              ) : (
                <span>
                  {hoveredItem.item.id
                    .replace(/^.*:/, '')
                    .split('_')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                </span>
              )}
            </div>

            <div className="text-[#888888] text-[10px] break-all">
              {hoveredItem.item.id}
            </div>

            <div className="text-[#a1a1a1]">
              {t('inventory.count')}: <span className="text-white font-bold">{hoveredItem.item.count}</span>
            </div>

            {hoveredItem.item.damage !== undefined && hoveredItem.item.maxDamage && (
              <div className="text-[#a1a1a1]">
                {t('inventory.durability')}:{' '}
                <span className="text-[#50e3c2]">
                  {hoveredItem.item.maxDamage - hoveredItem.item.damage} / {hoveredItem.item.maxDamage}
                </span>
              </div>
            )}

            {hoveredItem.item.enchantments && hoveredItem.item.enchantments.length > 0 && (
              <div className="pt-1 border-t border-[#2e2e2e] space-y-0.5">
                <span className="text-[10px] text-[#707070] uppercase flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-[#50e3c2]" />
                  {t('inventory.enchantments')}
                </span>
                {hoveredItem.item.enchantments.map((ench, i) => (
                  <div key={i} className="text-[#50e3c2] text-[11px]">
                    {ench.id} {ench.level}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
