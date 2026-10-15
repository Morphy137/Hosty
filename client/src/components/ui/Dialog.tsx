import React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
} as const;

const EASE = [0.2, 0.8, 0.2, 1] as const;

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Hides the close button and blocks Escape / outside clicks (e.g. while an install runs). */
  dismissible?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true
}) => {
  const { t } = useTranslation();

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (dismissible || next) && onOpenChange(next)}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content
              forceMount
              onEscapeKeyDown={(event) => !dismissible && event.preventDefault()}
              onInteractOutside={(event) => !dismissible && event.preventDefault()}
              onClick={(event) => {
                if (dismissible && event.target === event.currentTarget) onOpenChange(false);
              }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-none"
            >
              <motion.div
                className={cn('geist-card-elevated flex max-h-[90vh] w-full flex-col', SIZES[size])}
                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
                  <div className="min-w-0">
                    <RadixDialog.Title className="text-[15px] font-semibold tracking-[-0.3px] text-ink">
                      {title}
                    </RadixDialog.Title>
                    {description ? (
                      <RadixDialog.Description className="mt-0.5 text-[13px] text-mute">
                        {description}
                      </RadixDialog.Description>
                    ) : (
                      <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
                    )}
                  </div>
                  {dismissible && (
                    <RadixDialog.Close
                      aria-label={t('common.close')}
                      className="cursor-pointer rounded-[4px] p-1.5 text-mute transition hover:bg-surface-3 hover:text-ink"
                    >
                      <X className="h-4 w-4" />
                    </RadixDialog.Close>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && (
                  <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div>
                )}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
};
