import { DaemonError } from '../errors';

export type ConfigValue = string | number | boolean;
export type ConfigUpdates = Record<string, ConfigValue>;

const FORBIDDEN_KEY_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_KEY_LENGTH = 256;

const isConfigValue = (value: unknown): value is ConfigValue =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

/**
 * Validates an untrusted request body as a flat map of config keys to primitive values.
 * Rejects prototype-pollution keys and line breaks that could inject extra entries into the file.
 */
export const parseConfigUpdates = (body: unknown): ConfigUpdates => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new DaemonError('INVALID_PAYLOAD', 'Expected a JSON object of key/value pairs.');
  }

  const updates: ConfigUpdates = {};
  for (const [key, value] of Object.entries(body)) {
    if (!key || key.length > MAX_KEY_LENGTH || /[\r\n=]/.test(key)) {
      throw new DaemonError('INVALID_PAYLOAD', `Invalid config key "${key}".`);
    }
    if (key.split('.').some((segment) => FORBIDDEN_KEY_SEGMENTS.has(segment))) {
      throw new DaemonError('INVALID_PAYLOAD', `Forbidden config key "${key}".`);
    }
    if (!isConfigValue(value)) {
      throw new DaemonError('INVALID_PAYLOAD', `Invalid value for "${key}": expected string, number or boolean.`);
    }
    if (typeof value === 'string' && /[\r\n]/.test(value)) {
      throw new DaemonError('INVALID_PAYLOAD', `Value for "${key}" must not contain line breaks.`);
    }
    updates[key] = value;
  }
  return updates;
};
