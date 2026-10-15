import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerActionSpec, PlayerState } from '../../types/daemon';
import { resolveLocalized } from '../../utils/localized';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export type PlayerActionValues = Record<string, string | number>;
/** Asks the daemon to run a declared player action (it picks the bridge or the console commands). */
export type RunPlayerAction = (actionId: string, username: string, values?: PlayerActionValues) => void;

interface PlayerActionDialogProps {
  player: PlayerState;
  action: PlayerActionSpec;
  onClose: () => void;
  onRun: RunPlayerAction;
}

/** Form for an action's declared parameters; actions without parameters never open it. */
export const PlayerActionDialog: React.FC<PlayerActionDialogProps> = ({ player, action, onClose, onRun }) => {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<PlayerActionValues>(() =>
    Object.fromEntries((action.params ?? []).map((param) => [param.id, param.default ?? '']))
  );
  const label = resolveLocalized(action.label, i18n.language) ?? action.id;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      title={`${label}: ${player.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={action.danger ? 'danger' : 'primary'}
            onClick={() => {
              onRun(action.id, player.username, values);
              onClose();
            }}
          >
            {t('players.actions.execute_button')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {(action.params ?? []).map((param) => {
          const paramLabel = resolveLocalized(param.label, i18n.language) ?? param.id;
          return (
            <label key={param.id} className="block space-y-1.5">
              <span className="font-mono text-[11px] uppercase text-mute">{paramLabel}</span>
              {param.type === 'select' ? (
                <Select
                  ariaLabel={paramLabel}
                  value={String(values[param.id] ?? '')}
                  onValueChange={(value) => setValues((current) => ({ ...current, [param.id]: value }))}
                  options={(param.options ?? []).map((option) => ({
                    value: option.value,
                    label: resolveLocalized(option.label, i18n.language) ?? option.value
                  }))}
                />
              ) : (
                <Input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={values[param.id] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [param.id]: param.type === 'number' ? Number(event.target.value) : event.target.value
                    }))
                  }
                />
              )}
            </label>
          );
        })}
      </div>
    </Dialog>
  );
};
