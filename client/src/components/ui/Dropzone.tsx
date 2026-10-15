import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DropzoneProps {
  accept: string;
  onFile: (file: File) => void;
  title: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** Click-or-drop file target. `children` replaces the default prompt (e.g. to show the chosen file). */
export const Dropzone: React.FC<DropzoneProps> = ({ accept, onFile, title, hint, disabled, className, children }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const extensions = accept.split(',').map((ext) => ext.trim().toLowerCase());
  const isAccepted = (file: File) => extensions.some((ext) => file.name.toLowerCase().endsWith(ext));

  const handleFile = (file: File | undefined) => {
    if (file && isAccepted(file)) onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) handleFile(event.dataTransfer.files?.[0]);
      }}
      className={cn(
        'rounded-[8px] border-2 border-dashed p-5 text-center transition-colors duration-[var(--duration-fast)]',
        isDragging ? 'border-accent bg-info-soft' : 'border-hairline-strong bg-surface hover:border-ink',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {children ?? (
        <div className="space-y-1.5">
          <Upload className="mx-auto h-6 w-6 text-mute" />
          <div className="text-[13px] font-medium text-ink">{title}</div>
          {hint && <div className="text-[11px] text-mute">{hint}</div>}
        </div>
      )}
    </div>
  );
};
