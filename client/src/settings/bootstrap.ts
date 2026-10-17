import { applyAppearance, resolveAppearance } from './appearance';
import { loadPreferences } from './storage';

/** Applies the saved appearance before React renders, so the first frame already has the right theme. */
export function applyInitialAppearance(): void {
  let prefersDark = false;
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // matchMedia unavailable: light until the provider mounts.
  }
  applyAppearance(resolveAppearance(loadPreferences(), prefersDark));
}
