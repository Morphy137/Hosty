import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FolderInput, Folder } from 'lucide-react';

interface ImportServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (folderPath: string, name?: string) => Promise<void>;
}

export const ImportServerModal: React.FC<ImportServerModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const { t } = useTranslation();
  const [folderPath, setFolderPath] = useState('');
  const [serverName, setServerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) return;

    setIsSubmitting(true);
    try {
      await onImport(trimmedPath, serverName.trim() || undefined);
      setIsSubmitting(false);
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="geist-card bg-white dark:bg-[#111111] border border-[#ebebeb] dark:border-[#262626] max-w-lg w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[#ebebeb] dark:border-[#262626] pb-4">
          <div className="flex items-center gap-2.5">
            <FolderInput className="w-5 h-5 text-[#171717] dark:text-[#ededed]" />
            <h2 className="text-[17px] font-semibold text-[#171717] dark:text-[#ededed] tracking-[-0.3px]">
              {t('import_server.modal_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#fafafa] dark:hover:bg-[#1f1f1f] text-[#888888] hover:text-[#171717] dark:hover:text-[#ededed] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('import_server.path_label')}
            </label>
            <div className="relative">
              <Folder className="w-4 h-4 text-[#888888] dark:text-[#a1a1a1] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="C:\Servers\MyMinecraftServer"
                required
                className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] font-mono text-[12px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
              />
            </div>
            <p className="text-[12px] text-[#888888] dark:text-[#a1a1a1]">
              {t('import_server.path_hint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[11px] uppercase text-[#888888] dark:text-[#a1a1a1]">
              {t('import_server.name_label')}
            </label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Custom Display Name (optional)"
              className="w-full h-9 px-3 rounded-[6px] bg-white dark:bg-[#141414] border border-[#ebebeb] dark:border-[#262626] text-[13px] text-[#171717] dark:text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#171717] dark:focus:border-[#ededed]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !folderPath.trim()}
            className="w-full h-10 rounded-[6px] bg-[#171717] hover:bg-[#333333] dark:bg-[#ededed] dark:hover:bg-[#ffffff] text-white dark:text-[#171717] disabled:opacity-40 text-[14px] font-medium flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
          >
            <FolderInput className="w-4 h-4" />
            {isSubmitting ? t('import_server.submitting') : t('import_server.submit_button')}
          </button>
        </form>
      </div>
    </div>
  );
};
