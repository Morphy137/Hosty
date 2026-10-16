import React from 'react';
import { actionIcon } from '../../utils/actionIcons';

/** Renders an icon a game pack names (`playerActions[].icon`, `playerLists[].icon`); unknown names get a wand. */
export const ActionIcon: React.FC<{ name: string | undefined; className?: string }> = ({ name, className }) =>
  React.createElement(actionIcon(name), { className, 'aria-hidden': true });
