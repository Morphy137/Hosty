import type React from 'react';
import type { CustomSetupProps } from '../wizardTypes';
import { MinecraftInstallStep } from './MinecraftInstallStep';

/** Custom setup components a driver can request with `{ type: 'custom', component: <key> }`. */
export const CUSTOM_SETUP_COMPONENTS: Record<string, React.FC<CustomSetupProps>> = {
  'minecraft-install': MinecraftInstallStep
};
