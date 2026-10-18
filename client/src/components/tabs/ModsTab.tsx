import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Check, FileText, Folder, FolderOpen, Save, Search } from 'lucide-react';
import type { ConfigEntry, ConfigValue, ModConfigFormat } from '../../types/daemon';
import type { ModConfigEditorMode } from '../../hooks/useModConfigs';
import { ancestorFolders, buildConfigTree, filterConfigPaths, type ConfigTreeNode } from '../../utils/configTree';
import { cn } from '../../utils/cn';
import { ConfigEntryRow } from '../common/ConfigEntryRow';
import { SegmentedControl } from '../ui';

interface ModsTabProps {
  files: string[];
  selectedFile: string;
  format: ModConfigFormat;
  editorMode: ModConfigEditorMode;
  onEditorModeChange: (mode: ModConfigEditorMode) => void;
  entries: ConfigEntry[];
  content: string;
  onContentChange: (content: string) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
  fileFilter: string;
  onFileFilterChange: (filter: string) => void;
  onSelectFile: (filename: string) => void;
  onUpdateEntry: (key: string, value: ConfigValue) => void;
  onSave: () => Promise<void>;
}

const TREE_INDENT_PX = 14;
const TREE_BASE_PADDING_PX = 12;

interface ConfigTreeProps {
  nodes: ConfigTreeNode[];
  depth: number;
  selectedFile: string;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
}

/** The config folder as it is on disk: folders that open, and loose files beside them. */
const ConfigTree: React.FC<ConfigTreeProps> = ({ nodes, depth, selectedFile, expanded, onToggleFolder, onSelectFile }) => (
  <>
    {nodes.map((node) => {
      const paddingLeft = TREE_BASE_PADDING_PX + depth * TREE_INDENT_PX;
      if (node.kind === 'file') {
        const isSelected = selectedFile === node.path;
        return (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelectFile(node.path)}
            style={{ paddingLeft }}
            title={node.path}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 border-l-2 py-2 pr-3 text-left font-mono text-[13px] transition',
              isSelected
                ? 'border-ink bg-surface-3 font-medium text-ink'
                : 'border-transparent text-soft hover:bg-surface-2 hover:text-ink'
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-mute" />
            <span className="truncate">{node.name}</span>
          </button>
        );
      }

      const isOpen = expanded.has(node.path);
      const FolderIcon = isOpen ? FolderOpen : Folder;
      const Chevron = isOpen ? ChevronDown : ChevronRight;
      return (
        <React.Fragment key={node.path}>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            aria-expanded={isOpen}
            style={{ paddingLeft }}
            title={node.path}
            className="flex w-full cursor-pointer items-center gap-2 border-l-2 border-transparent py-2 pr-3 text-left font-mono text-[13px] text-ink transition hover:bg-surface-2"
          >
            <Chevron className="h-3.5 w-3.5 shrink-0 text-mute" />
            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-mute" />
            <span className="truncate">{node.name}</span>
          </button>
          {isOpen && (
            <ConfigTree
              nodes={node.children}
              depth={depth + 1}
              selectedFile={selectedFile}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          )}
        </React.Fragment>
      );
    })}
  </>
);

export const ModsTab: React.FC<ModsTabProps> = ({
  files,
  selectedFile,
  format,
  editorMode,
  onEditorModeChange,
  entries,
  content,
  onContentChange,
  filter,
  onFilterChange,
  fileFilter,
  onFileFilterChange,
  onSelectFile,
  onUpdateEntry,
  onSave
}) => {
  const { t } = useTranslation();
  const [isSavedFeedback, setIsSavedFeedback] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Opening a config (for example from a mod's row) reveals the folders that hold it.
  const [revealedFile, setRevealedFile] = useState('');
  if (revealedFile !== selectedFile) {
    setRevealedFile(selectedFile);
    if (selectedFile) setOpenFolders((previous) => new Set([...previous, ...ancestorFolders(selectedFile)]));
  }

  const isSearching = fileFilter.trim() !== '';
  const visibleFiles = useMemo(() => filterConfigPaths(files, fileFilter), [files, fileFilter]);
  const tree = useMemo(() => buildConfigTree(visibleFiles), [visibleFiles]);
  // While searching every folder with a match is open, so results are never hidden.
  const expanded = useMemo(
    () => (isSearching ? new Set(visibleFiles.flatMap(ancestorFolders)) : openFolders),
    [isSearching, visibleFiles, openFolders]
  );

  const toggleFolder = (folderPath: string) => {
    setOpenFolders((previous) => {
      const next = new Set(previous);
      if (!next.delete(folderPath)) next.add(folderPath);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
      setIsSavedFeedback(true);
      setTimeout(() => setIsSavedFeedback(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredEntries = entries.filter((entry) => entry.key.toLowerCase().includes(filter.toLowerCase()));
  const isTextMode = editorMode === 'text';

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
      {/* Left File Selector (3 cols) */}
      <div className="col-span-3 geist-card bg-surface border border-hairline flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-hairline bg-surface-2/50">
          <span className="font-mono text-[11px] uppercase text-mute">{t('mods.directory_hint')}</span>
        </div>
        <div className="relative border-b border-hairline p-2">
          <Search className="w-4 h-4 text-mute absolute left-5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={fileFilter}
            onChange={(e) => onFileFilterChange(e.target.value)}
            placeholder={t('mods.file_search_placeholder')}
            aria-label={t('mods.file_search_placeholder')}
            className="w-full h-8 pl-8 pr-3 rounded-[6px] bg-surface border border-hairline text-[13px] text-ink placeholder-mute focus:outline-none focus:border-ink"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleFiles.length === 0 ? (
            <div className="p-4 text-[13px] text-mute text-center">
              {files.length === 0 ? t('mods.no_files') : t('mods.no_file_matches')}
            </div>
          ) : (
            <ConfigTree
              nodes={tree}
              depth={0}
              selectedFile={selectedFile}
              expanded={expanded}
              onToggleFolder={toggleFolder}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      </div>

      {/* Right editor (9 cols) */}
      <div className="col-span-9 flex flex-col overflow-hidden gap-4">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            {!isTextMode && (
              <div className="relative w-80">
                <Search className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder={t('mods.search_placeholder')}
                  className="w-full h-9 pl-9 pr-3 rounded-[6px] bg-surface border border-hairline text-[14px] text-ink placeholder-mute focus:outline-none focus:border-ink"
                />
              </div>
            )}
            {format !== 'text' && (
              <SegmentedControl<ModConfigEditorMode>
                value={editorMode}
                onValueChange={onEditorModeChange}
                ariaLabel={t('mods.editor_mode')}
                options={[
                  { value: 'form', label: t('mods.mode_form') },
                  { value: 'text', label: t('mods.mode_text') }
                ]}
              />
            )}
            {selectedFile && (
              <span className="truncate font-mono text-[12px] text-mute" title={selectedFile}>
                {selectedFile}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedFile}
            className="h-9 shrink-0 px-4 rounded-[6px] bg-ink hover:bg-ink-hover disabled:opacity-50 text-on-ink font-medium text-[14px] tracking-[-0.28px] flex items-center gap-2 transition cursor-pointer shadow-2xs"
          >
            {isSavedFeedback ? (
              <>
                <Check className="w-4 h-4 text-success-fg" />
                {t('mods.saved')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('mods.save')}
              </>
            )}
          </button>
        </div>

        <div className="geist-card bg-surface border border-hairline flex-1 flex flex-col overflow-hidden">
          {isTextMode ? (
            <textarea
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              disabled={!selectedFile}
              spellCheck={false}
              aria-label={t('mods.text_editor')}
              className="h-full w-full flex-1 resize-none bg-surface p-4 font-mono text-[12px] leading-5 text-ink focus:outline-none"
            />
          ) : (
            <>
              <div className="grid grid-cols-12 px-4 py-2.5 bg-surface-2 border-b border-hairline font-mono text-[11px] uppercase text-mute select-none shrink-0">
                <div className="col-span-1">{t('mods.headers.index')}</div>
                <div className="col-span-6">{t('mods.headers.path')}</div>
                <div className="col-span-2">{t('mods.headers.type')}</div>
                <div className="col-span-3 text-right">{t('mods.headers.value')}</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                {filteredEntries.length === 0 ? (
                  <div className="p-8 text-center text-[13px] text-mute">{t('mods.empty')}</div>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <ConfigEntryRow key={entry.key} entry={entry} index={idx} onUpdate={onUpdateEntry} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
