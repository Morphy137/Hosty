import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Search } from 'lucide-react';
import { fetchLoaderVersions, inspectServerJar } from '../../../api/daemonApi';
import { LOADER_METADATA, SERVER_LOADERS, type ServerLoader } from '../../../types/daemon';
import { checkJava } from '../../../utils/javaRequirement';
import { Badge } from '../../ui/Badge';
import { Dropzone } from '../../ui/Dropzone';
import { Input } from '../../ui/Input';
import { cn } from '../../../utils/cn';
import type { CustomSetupProps } from '../wizardTypes';

export const MinecraftInstallStep: React.FC<CustomSetupProps> = ({
  draft,
  update,
  disabled,
  javaMajor,
  onValidityChange
}) => {
  const { t } = useTranslation();
  const install = draft.loaderInstall;
  const meta = LOADER_METADATA[install.loader];
  const requiresJar = !meta.isAutomatic;
  const usesJar = requiresJar || install.useCustomJar;

  const [versions, setVersions] = useState<string[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [filter, setFilter] = useState('');

  const patch = (changes: Partial<typeof install>) => update({ loaderInstall: { ...install, ...changes } });

  useEffect(() => {
    if (!meta.isAutomatic || install.useCustomJar) return;
    let ignore = false;
    setIsLoadingVersions(true);
    fetchLoaderVersions(install.loader)
      .then((list) => {
        if (ignore) return;
        setVersions(list);
        if (!list.includes(install.version)) update({ loaderInstall: { ...install, version: list[0] ?? '' } });
      })
      .catch(() => {
        if (!ignore) setVersions([]);
      })
      .finally(() => {
        if (!ignore) setIsLoadingVersions(false);
      });
    return () => {
      ignore = true;
    };
    // `install.version` is intentionally excluded: the list is refetched per loader only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [install.loader, install.useCustomJar, meta.isAutomatic]);

  const isValid = usesJar ? install.jarFile !== null && !isInspecting : install.version !== '';
  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const attachJar = (file: File) => {
    patch({ jarFile: file, jarInspection: null });
    setIsInspecting(true);
    inspectServerJar(file)
      .then((inspection) => {
        update({
          loaderInstall: {
            ...install,
            jarFile: file,
            jarInspection: inspection,
            useCustomJar: true,
            loader: inspection.loader ?? install.loader
          }
        });
      })
      .catch(() => {
        // Detection is advisory; the user can still choose the loader manually.
      })
      .finally(() => setIsInspecting(false));
  };

  const visibleVersions = useMemo(
    () => versions.filter((version) => version.toLowerCase().includes(filter.trim().toLowerCase())),
    [versions, filter]
  );

  const effectiveVersion = usesJar ? install.jarInspection?.mcVersion : install.version;
  const javaCheck = checkJava(javaMajor, effectiveVersion);

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
          {SERVER_LOADERS.map((loader: ServerLoader) => {
            const info = LOADER_METADATA[loader];
            const isSelected = install.loader === loader;
            return (
              <button
                key={loader}
                type="button"
                disabled={disabled}
                onClick={() => patch({ loader, version: '' })}
                className={cn(
                  'rounded-[6px] border p-2.5 text-left transition-colors cursor-pointer',
                  isSelected ? 'border-accent bg-info-soft' : 'border-hairline bg-surface hover:bg-surface-2'
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-ink">{info.name}</span>
                  <Badge variant={info.isAutomatic ? 'success' : 'neutral'}>
                    {info.isAutomatic ? t('create_server.badge_auto') : t('create_server.badge_manual')}
                  </Badge>
                </span>
                <span className="mt-1 block text-[11px] capitalize text-mute">{info.category}</span>
              </button>
            );
          })}
        </div>
      </div>

      {meta.isAutomatic && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ink"
            checked={install.useCustomJar}
            disabled={disabled}
            onChange={(event) => patch({ useCustomJar: event.target.checked })}
          />
          {t('wizard.use_own_jar')}
        </label>
      )}

      {!usesJar && (
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
                onClick={() => patch({ version })}
                className={cn(
                  'flex w-full items-center justify-between border-b border-hairline px-3 py-2 text-left font-mono text-[12px] last:border-b-0 cursor-pointer',
                  install.version === version ? 'bg-info-soft text-accent-fg' : 'text-ink hover:bg-surface-2'
                )}
              >
                {t('create_server.version_option', { version, loader: meta.name.toUpperCase() })}
                {install.version === version && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {usesJar && (
        <div className="space-y-3 rounded-[6px] border border-hairline bg-surface-2 p-3.5">
          {meta.officialUrl && requiresJar && (
            <div className="flex items-start justify-between gap-3 text-[12px] text-body">
              <p>{t('provisioning.manual_download_instructions', { loader: meta.name })}</p>
              <a
                href={meta.officialUrl}
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
            accept=".jar"
            onFile={attachJar}
            disabled={disabled}
            title={t('provisioning.upload_jar_dropzone')}
            hint={t('provisioning.upload_jar_hint')}
          >
            {install.jarFile ? (
              <div className="flex items-center justify-center gap-2.5">
                <FileText className="h-6 w-6 text-accent-fg" />
                <div className="text-left">
                  <div className="font-mono text-[13px] font-medium text-ink">{install.jarFile.name}</div>
                  <div className="font-mono text-[11px] text-mute">
                    {(install.jarFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              </div>
            ) : null}
          </Dropzone>

          {install.jarFile && (
            <div className="flex items-center gap-2 text-[12px] text-body">
              {isInspecting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('create_server.detecting_jar')}
                </>
              ) : install.jarInspection?.loader ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" />
                  {t(
                    install.jarInspection.kind === 'installer'
                      ? 'create_server.detected_installer'
                      : 'create_server.detected_server',
                    {
                      loader: LOADER_METADATA[install.jarInspection.loader].name,
                      version: install.jarInspection.mcVersion ?? '?'
                    }
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
