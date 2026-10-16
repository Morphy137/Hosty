import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDriverSummary } from '../../../types/daemon';
import { GameLogo } from '../../common/GameIcons';
import { SchemaFields } from './SchemaFields';
import { CUSTOM_SETUP_COMPONENTS } from './customSetupComponents';
import type { StepProps } from '../wizardTypes';

interface SetupStepProps extends StepProps {
  game: GameDriverSummary;
  javaMajor: number | null | undefined;
  onValidityChange: (valid: boolean) => void;
}

const isFilled = (value: string | number | boolean | undefined): boolean =>
  value !== undefined && (typeof value !== 'string' || value.trim() !== '');

/** Game-specific step: rendered entirely from the driver's `setupSchema`. */
export const SetupStep: React.FC<SetupStepProps> = ({ game, draft, update, disabled, javaMajor, onValidityChange }) => {
  const { t } = useTranslation();
  const customFields = game.setupSchema.filter((field) => field.type === 'custom');
  const plainFields = game.setupSchema.filter((field) => field.type !== 'custom');
  const [customValid, setCustomValid] = React.useState(true);

  // Required schema fields must have a value; custom components report their own validity.
  const requiredFilled = plainFields.every((field) => !field.required || isFilled(draft.setupValues[field.id]));
  const hasCustomFields = customFields.length > 0;
  React.useEffect(() => {
    onValidityChange((!hasCustomFields || customValid) && requiredFilled);
  }, [customValid, hasCustomFields, onValidityChange, requiredFilled]);

  return (
    <div className="space-y-5">
      {game.setupSchema.length === 0 && (
        <div className="flex items-start gap-3 rounded-[6px] border border-hairline bg-surface-2 p-4">
          <GameLogo gameId={game.id} size={28} />
          <p className="text-[12px] leading-relaxed text-soft">
            {t('wizard.setup_nothing', { game: game.name })}
          </p>
        </div>
      )}

      {customFields.map((field) => {
        const Component = field.component ? CUSTOM_SETUP_COMPONENTS[field.component] : undefined;
        if (!Component) return null;
        return (
          <Component
            key={field.id}
            game={game}
            draft={draft}
            update={update}
            disabled={disabled}
            javaMajor={javaMajor}
            onValidityChange={setCustomValid}
          />
        );
      })}

      {plainFields.length > 0 && (
        <SchemaFields
          fields={plainFields}
          values={draft.setupValues}
          disabled={disabled}
          onChange={(id, value) => update({ setupValues: { ...draft.setupValues, [id]: value } })}
        />
      )}
    </div>
  );
};
