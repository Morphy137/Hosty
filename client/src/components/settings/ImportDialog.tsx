import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { inputClasses } from '../ui/Input';
import { cn } from '../../utils/cn';

/** Largest file accepted by the import (settings files are a few KB). */
const MAX_IMPORT_BYTES = 512 * 1024;

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Applies the pasted or loaded JSON; throw to show the "invalid file" message. */
  onImport: (text: string) => void;
}

/** Paste or load a JSON export (preferences or a theme). */
export const ImportDialog: React.FC<ImportDialogProps> = ({ open, onOpenChange, title, description, onImport }) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setText('');
    setError(null);
    onOpenChange(false);
  };

  const handleImport = () => {
    try {
      onImport(text);
      close();
    } catch {
      setError(t('settings.transfer.invalid'));
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(t('settings.transfer.too_large'));
      return;
    }
    setText(await file.text());
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('settings.transfer.cancel')}
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={handleImport}>
            {t('settings.transfer.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          spellCheck={false}
          aria-label={t('settings.transfer.paste_label')}
          placeholder={t('settings.transfer.paste_placeholder')}
          className={cn(inputClasses, 'h-48 resize-none py-2 font-mono text-[12px]')}
        />
        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" />
            {t('settings.transfer.load_file')}
          </Button>
          {error && <span className="text-[12px] text-danger-fg">{error}</span>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </Dialog>
  );
};
