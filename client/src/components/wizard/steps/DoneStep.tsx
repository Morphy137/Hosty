import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

export const DoneStep: React.FC<{ name: string; warning: string | null }> = ({ name, warning }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20 }}
      >
        <CheckCircle2 className="h-12 w-12 text-success-fg" />
      </motion.div>
      <h3 className="text-[16px] font-semibold text-ink">{t('wizard.done_title', { name })}</h3>
      <p className="max-w-sm text-[13px] text-soft">{t('wizard.done_desc')}</p>
      {warning && <p className="max-w-sm text-[12px] text-warning-fg">{warning}</p>}
    </div>
  );
};
