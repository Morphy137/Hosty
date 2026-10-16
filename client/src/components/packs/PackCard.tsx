import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Gamepad2 } from 'lucide-react';
import type { PackAuthor } from '../../types/daemon';
import { cn } from '../../utils/cn';

const LOGO_SIZE_PX = 40;

/** Pack logo tile; a neutral icon stands in until the image loads, or when the pack has none. */
export const PackLogo: React.FC<{ src?: string | null }> = ({ src }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-hairline bg-surface-3"
      style={{ width: LOGO_SIZE_PX, height: LOGO_SIZE_PX }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt=""
          className="h-7 w-7 object-contain"
          loading="lazy"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <Gamepad2 className="h-5 w-5 text-mute" aria-hidden="true" />
      )}
    </span>
  );
};

/** Author name; a link to their page when the pack declares an https URL. */
export const AuthorLink: React.FC<{ author: PackAuthor }> = ({ author }) =>
  author.url ? (
    <a
      href={author.url}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-body underline-offset-2 hover:text-accent-fg hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {author.name}
    </a>
  ) : (
    <span className="font-medium text-body">{author.name}</span>
  );

export interface PackDetail {
  label: string;
  value: React.ReactNode;
}

interface PackCardProps {
  logo: React.ReactNode;
  name: string;
  version?: string | null;
  author: PackAuthor | null;
  /** Short facts after the author (category, size...). */
  meta?: string[];
  description?: string;
  /** Status badges next to the name. */
  badges?: React.ReactNode;
  /** Buttons and switches on the right. */
  actions?: React.ReactNode;
  /** Rows of the expanded view. */
  details?: PackDetail[];
  /** Extra content under the details (errors, trust prompt). */
  footer?: React.ReactNode;
}

/** One game pack: a compact row that expands into its details. Shared by installed packs and the catalog. */
export const PackCard: React.FC<PackCardProps> = ({
  logo,
  name,
  version,
  author,
  meta = [],
  description,
  badges,
  actions,
  details = [],
  footer
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const canExpand = details.length > 0;

  return (
    <li className="rounded-[10px] border border-hairline bg-surface-2 transition-colors hover:border-hairline-strong">
      <div className="flex items-center gap-3 p-3">
        {logo}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[13px] font-semibold text-ink">{name}</span>
            {version && <span className="font-mono text-[11px] text-mute">v{version}</span>}
            {badges}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-mute">
            {author && (
              <>
                <span>{t('packs.by')}</span>
                <AuthorLink author={author} />
              </>
            )}
            {meta.map((item) => (
              <React.Fragment key={item}>
                {(author || item !== meta[0]) && <span aria-hidden="true">·</span>}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
          {description && <p className="mt-1 truncate text-[12px] text-soft">{description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {canExpand && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? t('packs.hide_details') : t('packs.show_details')}
              title={expanded ? t('packs.hide_details') : t('packs.show_details')}
              onClick={() => setExpanded((current) => !current)}
              className="cursor-pointer rounded-[4px] p-1 text-mute transition hover:bg-surface-3 hover:text-ink"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-hairline px-3 py-3 text-[12px]">
          {details.map((detail) => (
            <React.Fragment key={detail.label}>
              <dt className="text-mute">{detail.label}</dt>
              <dd className="min-w-0 break-words text-body">{detail.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {footer && <div className="space-y-2 px-3 pb-3">{footer}</div>}
    </li>
  );
};
