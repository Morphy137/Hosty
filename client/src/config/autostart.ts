import { isTauriRuntime } from './daemon';

/** Whether Hosty starts with the operating system (desktop shell only). */
export async function isLaunchAtLoginEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { isEnabled } = await import('@tauri-apps/plugin-autostart');
  return isEnabled();
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  await (enabled ? enable() : disable());
}
