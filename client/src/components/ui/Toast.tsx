import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../utils/cn';
import { ToastContext, type ToastApi, type ToastVariant } from './toastContext';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 4000;

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success-fg" />,
  error: <AlertCircle className="h-4 w-4 text-danger-fg" />,
  info: <Info className="h-4 w-4 text-accent-fg" />
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ title, description, variant = 'info' }) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn('geist-card-elevated pointer-events-auto flex items-start gap-3 p-3')}
          >
            <span className="mt-0.5 shrink-0">{ICONS[item.variant]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">{item.title}</p>
              {item.description && <p className="mt-0.5 text-[12px] text-mute">{item.description}</p>}
            </div>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => dismiss(item.id)}
              className="rounded-[4px] p-1 text-mute transition hover:bg-surface-3 hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

