import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Search } from 'lucide-react';
import { fetchInstallerBuilds, fetchInstallerVersions, inspectServerFile } from '../../../api/daemonApi';
import type { InstallerVariant } from '../../../types/daemon';
import { checkJava } from '../../../utils/javaRequirement';
import { resolveLocalized } from '../../../utils/localized';
import { Badge } from '../../ui/Badge';
import { Dropzone } from '../../ui/Dropzone';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { cn } from '../../../utils/cn';
import type { CustomSetupProps } from '../wizardTypes';

/**
 * Server software step for games whose extension implements an installer: pick a variant and version
 * (downloaded by Hosty) or bring your own server file. Everything shown comes from the manifest `installer`.
 */
export const InstallerStep: React.FC<CustomSetupProps> = ({ game, draft, update, disabled, javaMajor, onValidityChange }) => {
  const { t, i18n } = useTranslation();
  const spec = game.installer;
  const variants = useMemo(() => spec?.variants ?? [], [spec]);
  const install = draft.install;
  const variant: InstallerVariant | undefined =
    variants.find((candidate) => candidate.id === install.variant) ??
    variants.find((candidate) => candidate.id === spec?.defaultVariant) ??
    variants[0];
  const requiresFile = variant ? !variant.automatic : false;
  const usesFile = requiresFile || install.useOwnFile;

  const [versions, setVersions] = useState<string[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [filter, setFilter] = useState('');
  const [builds, setBuilds] = useState<string[]>([]);
  const [isLoadingBuilds, setIsLoadingBuilds] = useState(false);

  const patch = (changes: Partial<typeof install>) => update({ install: { ...install, ...changes } });

  // The draft starts without a variant; settle on the game's default once its manifest is known.
  useEffect(() => {
    if (variant && install.variant !== variant.id) update({ install: { ...install, variant: variant.id, version: '', build: '' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id]);

  useEffect(() => {
    if (!variant?.automatic || install.useOwnFile) return;
    let ignore = false;
    setIsLoadingVersions(true);
    fetchInstallerVersions(game.id, variant.id)
      .then((list) => {
        if (ignore) return;
        setVersions(list);
        if (!list.includes(install.version)) update({ install: { ...install, variant: variant.id, version: list[0] ?? '', build: '' } });
      })
      .finally(() => {
        if (!ignore) setIsLoadingVersions(false);
      });
    return () => {
      ignore = true;
    };
    // `install.version` is intentionally excluded: the list is refetched per variant only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, variant?.id, variant?.automatic, install.useOwnFile]);

  // The loader builds of the chosen version; the user may keep the latest one (empty value) or pick another.
  useEffect(() => {
    if (!variant?.automatic || install.useOwnFile || !install.version) {
      setBuilds([]);
      return;
    }
    let ignore = false;
    setIsLoadingBuilds(true);
    fetchInstallerBuilds(game.id, variant.id, install.version)
      .then((list) => {
        if (!ignore) setBuilds(list);
      })
      .finally(() => {
        if (!ignore) setIsLoadingBuilds(false);
      });
    return () => {
      ignore = true;
    };
  }, [game.id, variant?.id, variant?.automatic, install.useOwnFile, install.version]);

  const isValid = usesFile ? install.file !== null && !isInspecting : install.version !== '';
  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const attachFile = (file: File) => {
    patch({ file, fileInfo: null });
    setIsInspecting(true);
    inspectServerFile(game.id, file)
      .then((fileInfo) => {
        update({
          install: {
            ...install,
            file,
            fileInfo,
            useOwnFile: true,
            variant: fileInfo.variant ?? install.variant
          }
        });
      })
      .catch(() => {
        // Detection is advisory; the user can still choose the variant manually.
      })
      .finally(() => setIsInspecting(false));
  };

  const visibleVersions = useMemo(
    () => versions.filter((version) => version.toLowerCase().includes(filter.trim().toLowerCase())),
    [versions, filter]
  );

  const variantName = (id: string | null | undefined) => variants.find((candidate) => candidate.id === id)?.name ?? id ?? '';
  const effectiveVersion = usesFile ? install.fileInfo?.gameVersion : install.version;
  const javaCheck = game.supportsCustomJava ? checkJava(javaMajor, spec?.javaRequirements, effectiveVersion) : { status: 'unknown' as const };

  if (!spec || !variant) return null;

  return (
    <div className="space-y-5">
      {javaCheck.status === 'missing' || javaCheck.status === 'outdated' ? (
        <div className="flex items-start gap-3 rounded-[6px] border border-warning bg-warning-soft p-3.5 text-[12px]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1.5">
            <p className="font-semibold text-ink">
              {javaCheck.status === 'missing'
                ? t('environment.java_missing_title')
                : t('wizard.java_outdated_title', { installed: javaCheck.installed })}
            </p>
            <p className="leading-relaxed text-soft">{t('wizard.java_required_desc', { required: javaCheck.required })}</p>
            <a
              href={`https://adoptium.net/temurin/releases/?version=${javaCheck.required}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-warning px-2.5 py-1 text-[11px] font-medium text-black no-underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('wizard.java_download', { version: javaCheck.required })}
            </a>
          </div>
        </div>
      ) : javaCheck.status === 'ok' ? (
        <p className="flex items-center gap-2 text-[12px] text-soft">
          <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" />
          {t('wizard.java_ok', { installed: javaCheck.installed, required: javaCheck.required })}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="font-mono text-[11px] uppercase text-mute">{t('provisioning.loader_label')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {variants.map((candidate) => {
            const isSelected = variant.id === candidate.id;
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={disabled}
                onClick={() => patch({ variant: candidate.id, version: '', build: '' })}
                className={cn(
                  'cursor-pointer rounded-[6px] border p-2.5 text-left transition-colors',
                  isSelected ? 'border-accent bg-info-soft' : 'border-hairline bg-surface hover:bg-surface-2'
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-ink">{candidate.name}</span>
                  <Badge variant={candidate.automatic ? 'success' : 'neutral'}>
                    {candidate.automatic ? t('create_server.badge_auto') : t('create_server.badge_manual')}
                  </Badge>
                </span>
                {candidate.group && (
                  <span className="mt-1 block text-[11px] text-mute">{resolveLocalized(candidate.group, i18n.language)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {variant.automatic && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ink"
            checked={install.useOwnFile}
            disabled={disabled}
            onChange={(event) => patch({ useOwnFile: event.target.checked })}
          />
          {t('wizard.use_own_jar')}
        </label>
      )}

      {!usesFile && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase text-mute">{t('provisioning.version_label')}</p>
            {isLoadingVersions && (
              <span className="flex items-center gap-1 text-[11px] text-accent-fg">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('provisioning.loading_versions')}
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mute" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('wizard.version_search')}
              className="pl-9"
            />
          </div>
          <div className="max-h-44 overflow-y-auto rounded-[6px] border border-hairline">
            {visibleVersions.length === 0 && !isLoadingVersions && (
              <p className="p-3 text-[12px] text-mute">{t('wizard.version_none')}</p>
            )}
            {visibleVersions.map((version) => (
              <button
                key={version}
                type="button"
                disabled={disabled}
                onClick={() => patch({ version, build: '' })}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between border-b border-hairline px-3 py-2 text-left font-mono text-[12px] last:border-b-0',
                  install.version === version ? 'bg-info-soft text-accent-fg' : 'text-ink hover:bg-surface-2'
                )}
              >
                {t('create_server.version_option', { version, loader: variant.name })}
                {install.version === version && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {!usesFile && (builds.length > 0 || isLoadingBuilds) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase text-mute">{t('wizard.build_label', { loader: variant.name })}</p>
            {isLoadingBuilds && <Loader2 className="h-3 w-3 animate-spin text-accent-fg" />}
          </div>
          <Select
            value={install.build}
            disabled={disabled || isLoadingBuilds}
            ariaLabel={t('wizard.build_label', { loader: variant.name })}
            onValueChange={(build) => patch({ build })}
            options={[
              { value: '', label: t('wizard.build_latest', { build: builds[0] ?? '' }) },
              ...builds.map((build) => ({ value: build, label: build }))
            ]}
          />
        </div>
      )}

      {usesFile && (
        <div className="space-y-3 rounded-[6px] border border-hairline bg-surface-2 p-3.5">
          {variant.url && requiresFile && (
            <div className="flex items-start justify-between gap-3 text-[12px] text-body">
              <p>{t('provisioning.manual_download_instructions', { loader: variant.name })}</p>
              <a
                href={variant.url}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-[4px] border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink no-underline"
              >
                {t('provisioning.visit_official_site')}
                <ExternalLink className="h-3 w-3 text-mute" />
              </a>
            </div>
          )}

          <Dropzone
            accept={(spec.fileTypes ?? []).join(',')}
            onFile={attachFile}
            disabled={disabled}
            title={t('provisioning.upload_jar_dropzone')}
            hint={t('provisioning.upload_jar_hint')}
          >
            {install.file ? (
              <div className="flex items-center justify-center gap-2.5">
                <FileText className="h-6 w-6 text-accent-fg" />
                <div className="text-left">
                  <div className="font-mono text-[13px] font-medium text-ink">{install.file.name}</div>
                  <div className="font-mono text-[11px] text-mute">{(install.file.size / (1024 * 1024)).toFixed(2)} MB</div>
                </div>
              </div>
            ) : null}
          </Dropzone>

          {install.file && (
            <div className="flex items-center gap-2 text-[12px] text-body">
              {isInspecting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('create_server.detecting_jar')}
                </>
              ) : install.fileInfo?.variant ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" />
                  {t(
                    install.fileInfo.kind === 'installer' ? 'create_server.detected_installer' : 'create_server.detected_server',
                    { loader: variantName(install.fileInfo.variant), version: install.fileInfo.gameVersion ?? '?' }
                  )}
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-warning" />
                  {t('create_server.detected_unknown')}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
