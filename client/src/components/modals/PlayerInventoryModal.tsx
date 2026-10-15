import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { ItemSlotIcon } from '../common/ItemSlotIcon';
import { SlidingText } from '../common/SlidingText';

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

  // Prevent background scrollbar triggers while inventory modal is open
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, []);

  if (!player) return null;

  const handleMouseEnter = (item: InventorySlotItem | null, e: React.MouseEvent) => {
    if (!item) {
      setHoveredItem(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position tooltip to the right of the slot, safely bounded
    const x = rect.right + 12 > window.innerWidth - 240 ? rect.left - 240 : rect.right + 12;
    const y = Math.max(16, Math.min(window.innerHeight - 220, rect.top));
    setHoveredItem({ item, x, y });
  };

  const renderSlot = (item: InventorySlotItem | null, slotIndex: number, fallbackIcon?: React.ReactNode) => {
    const hasItem = item !== null && item !== undefined;
    const durPercent =
      hasItem && item.damage !== undefined && item.maxDamage
        ? Math.max(0, Math.min(100, Math.round(((item.maxDamage - item.damage) / item.maxDamage) * 100)))
        : null;

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
            ? 'bg-surface border-hairline-strong hover:border-accent dark:hover:border-success/80 hover:bg-surface-2 cursor-pointer shadow-2xs'
            : 'bg-surface-3 dark:bg-surface-2/60 border-hairline-strong'
        }`}
      >
        {hasItem ? (
          <>
            {/* Direct item pixel texture or fallback badge */}
            <ItemSlotIcon id={item.id} fallbackText={shortName} />

            {/* Stack count badge */}
            {item.count > 1 && (
              <span className="absolute bottom-0.5 right-1 font-mono text-[11px] font-bold text-ink drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,1)] pointer-events-none">
                {item.count}
              </span>
            )}

            {/* Durability bar */}
            {durPercent !== null && (
              <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-hairline-strong rounded-full overflow-hidden pointer-events-none">
                <div
                  className={`h-full transition-all ${
                    durPercent > 50
                      ? 'bg-success'
                      : durPercent > 20
                      ? 'bg-warning'
                      : 'bg-danger'
                  }`}
                  style={{ width: `${durPercent}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="text-mute flex items-center justify-center pointer-events-none">
            {fallbackIcon}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-hidden">
      <div className="geist-card bg-surface border border-hairline text-ink max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-5 h-[min(40rem,90vh)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex items-center gap-3">
            <img
              src={`https://mc-heads.net/avatar/${player.username}/40`}
              alt={player.username}
              className="w-10 h-10 rounded-[6px] border border-hairline"
            />
            <div>
              <h2 className="text-[16px] font-semibold text-ink tracking-[-0.3px] flex items-center gap-2">
                <Package className="w-4 h-4 text-accent-fg" />
                <SlidingText>{t('inventory.modal_title', { player: player.username })}</SlidingText>
              </h2>
              <div className="font-mono text-[12px] text-mute flex items-center gap-2 mt-0.5">
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
              className="h-8 px-2.5 rounded-[4px] bg-surface hover:bg-surface-2 border border-hairline text-[12px] font-medium text-ink flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title={t('inventory.refresh')}
            >
              <RotateCcw className={`w-3.5 h-3.5 text-mute ${isLoading ? 'animate-spin' : ''}`} />
              <SlidingText>{t('inventory.refresh')}</SlidingText>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[4px] hover:bg-surface-2 text-mute hover:text-ink transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        {isLoading && !inventory ? (
          <div className="h-64 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-accent-fg animate-spin" />
            <p className="text-[13px] text-mute">{t('inventory.loading')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex gap-6 items-start justify-center">
              {/* Left Column: Equipment (Armor & Offhand) */}
              <div className="space-y-2">
                <span className="font-mono text-[10px] uppercase text-mute tracking-wider block text-center">
                  {t('inventory.equipment')}
                </span>
                <div className="flex flex-col gap-1.5 p-2 rounded-[6px] bg-canvas border border-hairline">
                  {/* Helmet: slot 39 (index 0 in armor array) */}
                  {renderSlot(inventory?.armor?.[0] ?? null, 39, <span className="font-mono text-[9px] font-bold">HLM</span>)}
                  {/* Chestplate: slot 38 (index 1) */}
                  {renderSlot(inventory?.armor?.[1] ?? null, 38, <span className="font-mono text-[9px] font-bold">CHS</span>)}
                  {/* Leggings: slot 37 (index 2) */}
                  {renderSlot(inventory?.armor?.[2] ?? null, 37, <span className="font-mono text-[9px] font-bold">LEG</span>)}
                  {/* Boots: slot 36 (index 3) */}
                  {renderSlot(inventory?.armor?.[3] ?? null, 36, <span className="font-mono text-[9px] font-bold">BOT</span>)}

                  {/* Offhand: slot 40 */}
                  <div className="pt-2 border-t border-hairline">
                    {renderSlot(inventory?.offhand ?? null, 40, <Shield className="w-4 h-4" />)}
                  </div>
                </div>
              </div>

              {/* Right Area: Main Inventory & Hotbar */}
              <div className="space-y-4">
                {/* 27 Main Inventory Slots (3 rows of 9) */}
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] uppercase text-mute tracking-wider block">
                    {t('inventory.main_inventory')}
                  </span>
                  <div className="p-2.5 rounded-[6px] bg-canvas border border-hairline grid grid-cols-9 gap-1.5">
                    {Array.from({ length: 27 }).map((_, idx) => {
                      const item = inventory?.inventory?.[idx] ?? null;
                      return renderSlot(item, idx + 9);
                    })}
                  </div>
                </div>

                {/* 9 Hotbar Slots */}
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] uppercase text-mute tracking-wider block">
                    {t('inventory.hotbar')}
                  </span>
                  <div className="p-2.5 rounded-[6px] bg-canvas border border-hairline grid grid-cols-9 gap-1.5">
                    {Array.from({ length: 9 }).map((_, idx) => {
                      const item = inventory?.hotbar?.[idx] ?? null;
                      return renderSlot(item, idx);
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-2 border-t border-hairline flex items-center justify-end">
              <button
                type="button"
                onClick={onClearInventory}
                className="h-8 px-3 rounded-[4px] bg-danger-soft hover:bg-danger-soft border border-danger/30 text-[12px] font-medium text-danger-fg flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <SlidingText>{t('inventory.clear_inventory_button')}</SlidingText>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hover Tooltip Portaled directly to document.body to prevent parent container layout shifts */}
      {hoveredItem && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-9999 pointer-events-none p-3 rounded-[6px] bg-surface border border-hairline shadow-2xl max-w-xs space-y-1 font-mono text-[11px] text-ink"
          style={{
            left: `${hoveredItem.x}px`,
            top: `${hoveredItem.y}px`
          }}
        >
          <div className="text-[13px] font-bold text-ink flex items-center gap-1.5">
            {hoveredItem.item.customName ? (
              <span className="italic text-warning">{hoveredItem.item.customName}</span>
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

          <div className="text-mute text-[10px] break-all">
            {hoveredItem.item.id}
          </div>

          <div className="text-soft">
            {t('inventory.count')}: <span className="text-ink font-bold">{hoveredItem.item.count}</span>
          </div>

          {hoveredItem.item.damage !== undefined && hoveredItem.item.maxDamage && (
            <div className="text-soft">
              {t('inventory.durability')}:{' '}
              <span className="text-accent-fg font-semibold">
                {hoveredItem.item.maxDamage - hoveredItem.item.damage} / {hoveredItem.item.maxDamage}
              </span>
            </div>
          )}

          {hoveredItem.item.enchantments && hoveredItem.item.enchantments.length > 0 && (
            <div className="pt-1 border-t border-hairline space-y-0.5">
              <span className="text-[10px] text-mute uppercase flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-accent-fg" />
                {t('inventory.enchantments')}
              </span>
              {hoveredItem.item.enchantments.map((ench, i) => (
                <div key={i} className="text-accent-fg text-[11px]">
                  {ench.id} {ench.level}
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
