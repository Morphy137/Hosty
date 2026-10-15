import type React from 'react';
import type { CustomSetupProps } from '../wizardTypes';
import { InstallerStep } from './InstallerStep';

/** Setup components a manifest can place with `{ type: 'custom', component: <key> }`. */
export const CUSTOM_SETUP_COMPONENTS: Record<string, React.FC<CustomSetupProps>> = {
  installer: InstallerStep
};
