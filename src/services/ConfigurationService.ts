import * as vscode from 'vscode';
import type { Result, WeblateConfiguration, ConfigurationError } from '../types/index';

/** Non-secret fields required in the Fastlate configuration, in validation order. */
const REQUIRED_SETTINGS_FIELDS: ReadonlyArray<keyof Omit<WeblateConfiguration, 'authToken'>> = [
  'serverUrl',
  'project',
  'component',
  'defaultLanguage',
];

/**
 * Returns true if the value is absent (undefined/null) or contains only whitespace.
 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return true;
}

/**
 * Returns true if the URL starts with http:// or https:// and has a non-empty hostname.
 */
function isValidUrl(value: string): boolean {
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function readFastlateSetting(field: keyof Omit<WeblateConfiguration, 'authToken'>): string | undefined {
  const scopedConfig = vscode.workspace.getConfiguration('fastlate');
  const scopedValue = scopedConfig.get<string>(field);

  if (!isBlank(scopedValue)) {
    return scopedValue;
  }

  const rootConfig = vscode.workspace.getConfiguration();
  return rootConfig.get<string>(`fastlate.${field}`);
}

/**
 * Reads and validates Fastlate settings plus the auth token loaded from SecretStorage.
 *
 * Returns `{ ok: true, value: WeblateConfiguration }` when all fields are present
 * and valid, or `{ ok: false, error: ConfigurationError }` on the first validation
 * failure encountered.
 */
export class ConfigurationService {
  readConfiguration(authToken: string | undefined): Result<WeblateConfiguration, ConfigurationError> {
    for (const field of REQUIRED_SETTINGS_FIELDS) {
      const value = readFastlateSetting(field);
      if (isBlank(value)) {
        return { ok: false, error: { kind: 'missing_field', field } };
      }
    }

    if (isBlank(authToken)) {
      return { ok: false, error: { kind: 'missing_field', field: 'authToken' } };
    }
    if (typeof authToken !== 'string') {
      return { ok: false, error: { kind: 'missing_field', field: 'authToken' } };
    }
    const trimmedAuthToken = authToken.trim();

    const serverUrl = readFastlateSetting('serverUrl') as string;
    const project = readFastlateSetting('project') as string;
    const component = readFastlateSetting('component') as string;
    const defaultLanguage = readFastlateSetting('defaultLanguage') as string;

    if (!isValidUrl(serverUrl)) {
      return { ok: false, error: { kind: 'invalid_url', value: serverUrl } };
    }

    return {
      ok: true,
      value: { serverUrl, authToken: trimmedAuthToken, project, component, defaultLanguage },
    };
  }
}
