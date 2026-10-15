import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SetupField } from '../../../types/daemon';
import { resolveLocalized } from '../../../utils/localized';
import { Input, NumberInput } from '../../ui/Input';
import { Select } from '../../ui/Select';
import type { SetupValue } from '../wizardTypes';

interface SchemaFieldsProps {
  fields: SetupField[];
  values: Record<string, SetupValue>;
  onChange: (id: string, value: SetupValue) => void;
  disabled?: boolean;
}

/** Renders a driver's `setupSchema` generically, so a new game needs no wizard code. */
export const SchemaFields: React.FC<SchemaFieldsProps> = ({ fields, values, onChange, disabled }) => {
  const { t, i18n } = useTranslation();
  const labelOf = (field: Pick<SetupField, 'label' | 'labelKey'>) =>
    resolveLocalized(field.label, i18n.language) ?? (field.labelKey ? t(field.labelKey) : '');

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const current = values[field.id] ?? field.default ?? '';
        const label = (
          <label className="font-mono text-[11px] uppercase text-mute" htmlFor={`setup-${field.id}`}>
            {labelOf(field)}
          </label>
        );
        const descriptionText =
          resolveLocalized(field.description, i18n.language) ?? (field.descriptionKey ? t(field.descriptionKey) : '');
        const description = descriptionText ? <p className="text-[12px] text-mute">{descriptionText}</p> : null;

        if (field.type === 'select') {
          return (
            <div key={field.id} className="space-y-1.5">
              {label}
              <Select
                ariaLabel={labelOf(field)}
                value={String(current)}
                disabled={disabled}
                onValueChange={(value) => onChange(field.id, value)}
                options={(field.options ?? []).map((option) => ({
                  value: option.value,
                  label: resolveLocalized(option.label, i18n.language) ?? (option.labelKey ? t(option.labelKey) : option.value)
                }))}
              />
              {description}
            </div>
          );
        }

        if (field.type === 'number') {
          return (
            <div key={field.id} className="space-y-1.5">
              {label}
              <NumberInput
                id={`setup-${field.id}`}
                value={Number(current)}
                disabled={disabled}
                onValueChange={(value) => onChange(field.id, value)}
              />
              {description}
            </div>
          );
        }

        if (field.type === 'toggle') {
          return (
            <label key={field.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                checked={Boolean(current)}
                disabled={disabled}
                onChange={(event) => onChange(field.id, event.target.checked)}
              />
              {labelOf(field)}
            </label>
          );
        }

        // text | secret
        return (
          <div key={field.id} className="space-y-1.5">
            {label}
            <Input
              id={`setup-${field.id}`}
              type={field.type === 'secret' ? 'password' : 'text'}
              autoComplete="off"
              value={String(current)}
              disabled={disabled}
              onChange={(event) => onChange(field.id, event.target.value)}
            />
            {description}
          </div>
        );
      })}
    </div>
  );
};
