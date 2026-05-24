import type {
  KeyCreationResult,
  WeblateConfiguration,
  TermEditResult,
} from '../types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout per request attempt in milliseconds (10 seconds). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Maximum number of attempts (1 original + 2 retries = 3 total). */
const MAX_ATTEMPTS = 3;

/** Delay between retry attempts in milliseconds (2 seconds). */
const RETRY_DELAY_MS = 2_000;

/** Weblate "translated" state value. */
const STATE_TRANSLATED = 20;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true if the HTTP status code indicates a server error (5xx).
 */
function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }

  const record = objectRecord(value);
  if (record === null) {
    return [];
  }

  return Object.values(record).flatMap((item) => collectStrings(item));
}

function isDuplicateKeyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('already exist') ||
    lower.includes('já criada') ||
    lower.includes('já existe') ||
    lower.includes('duplicate') ||
    lower.includes('unique')
  );
}

function duplicateKeyMessage(body: unknown): string | null {
  const record = objectRecord(body);
  if (Array.isArray(record?.['key'])) {
    const firstMessage = record['key'].find((message) => typeof message === 'string');
    return typeof firstMessage === 'string' ? firstMessage : 'Key already exists';
  }

  const duplicateMessage = collectStrings(body).find(isDuplicateKeyMessage);
  return typeof duplicateMessage === 'string' ? duplicateMessage : null;
}

// ---------------------------------------------------------------------------
// Fetch wrapper with retry
// ---------------------------------------------------------------------------

interface FetchOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

interface FetchResult {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function numericId(value: unknown): number | null {
  const record = objectRecord(value);
  return typeof record?.['id'] === 'number' ? record['id'] : null;
}

function stringArrayContainsExact(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.some((item) => item === expected);
}

function hasExactTermKey(value: unknown, expectedKey: string): boolean {
  const record = objectRecord(value);
  if (record === null) {
    return false;
  }

  return (
    record['key'] === expectedKey ||
    record['context'] === expectedKey ||
    record['source'] === expectedKey ||
    stringArrayContainsExact(record['source'], expectedKey)
  );
}

function exactResultId(value: unknown, expectedKey: string): number | null {
  const record = objectRecord(value);
  const results = record?.['results'];

  if (!Array.isArray(results)) {
    return null;
  }

  const exactResult = results.find((result) => hasExactTermKey(result, expectedKey));
  return exactResult === undefined ? null : numericId(exactResult);
}

/**
 * Executes an HTTP request with retry logic.
 *
 * Retries are performed only for:
 * - Network/connection errors (fetch throws)
 * - Timeout errors (AbortController signal fires)
 * - HTTP 5xx responses
 *
 * 4xx responses are NOT retried.
 *
 * @param options  Request parameters.
 * @returns        The successful (non-5xx) response, or throws after all attempts fail.
 */
async function fetchWithRetry(options: FetchOptions): Promise<FetchResult> {
  // node-fetch v3 is ESM-only; use dynamic import for CommonJS compatibility.
  const { default: fetch } = await import('node-fetch');

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Do not retry 4xx — return immediately so callers can handle them.
      if (!isServerError(response.status)) {
        return response;
      }

      // 5xx — record and retry (unless this was the last attempt).
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      // Network error or timeout (AbortError).
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_ATTEMPTS) {
      await delay(RETRY_DELAY_MS);
    }
  }

  // All attempts exhausted.
  throw lastError ?? new Error('All retry attempts failed');
}

// ---------------------------------------------------------------------------
// WeblateHttpClient
// ---------------------------------------------------------------------------

/**
 * HTTP client for the Weblate REST API.
 *
 * Handles creation, lookup, and editing of translation units (terms) with
 * built-in retry logic for transient failures.
 */
export class WeblateHttpClient {
  private readonly config: WeblateConfiguration;
  private readonly languageCode: string;

  constructor(config: WeblateConfiguration, languageCode: string) {
    this.config = config;
    this.languageCode = languageCode;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Returns the base Authorization header value for all requests. */
  private get authHeader(): string {
    return `Token ${this.config.authToken}`;
  }

  /** Builds the base URL for translation unit endpoints. */
  private get translationsBaseUrl(): string {
    const { serverUrl, project, component } = this.config;
    return `${serverUrl}/api/translations/${project}/${component}/${this.languageCode}/units/`;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Creates a source key with its primary-language value.
   *
   * @param key    The translation key to create.
   * @param value  The primary-language value for the key.
   * @returns      A discriminated union describing the outcome.
   */
  async createKey(key: string, value: string): Promise<KeyCreationResult> {
    const url = this.translationsBaseUrl;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
    const body = JSON.stringify({
      key,
      value: [value],
      state: STATE_TRANSLATED,
    });

    let response: FetchResult;
    try {
      response = await fetchWithRetry({ method: 'POST', url, headers, body });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'error', statusCode: 0, message };
    }

    if (response.status === 200 || response.status === 201) {
      return { kind: 'created' };
    }

    if (response.status === 400) {
      try {
        const data = await response.json();
        const duplicateMessage = duplicateKeyMessage(data);
        if (duplicateMessage !== null) {
          return { kind: 'already_exists', message: duplicateMessage };
        }
        return { kind: 'error', statusCode: 400, message: JSON.stringify(data) };
      } catch {
        return { kind: 'error', statusCode: 400, message: 'Bad request' };
      }
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: 'auth_error' };
    }

    let message = `Unexpected status ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch {
      // ignore
    }
    return { kind: 'error', statusCode: response.status, message };
  }

  /**
   * Searches for an existing term by exact key and returns its unit ID.
   *
   * @param key  The translation key to search for.
   * @returns    The unit ID of the exact matching result, or `null` if not found.
   */
  async findTermId(key: string): Promise<number | null> {
    const url = `${this.translationsBaseUrl}?q=${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    };

    let response: FetchResult;
    try {
      response = await fetchWithRetry({ method: 'GET', url, headers });
    } catch {
      return null;
    }

    if (response.status !== 200) {
      return null;
    }

    try {
      const data = await response.json();
      return exactResultId(data, key);
    } catch {
      // ignore parse errors
    }

    return null;
  }

  /**
   * Edits an existing translation unit via PATCH.
   *
   * @param unitId  The Weblate unit ID to update.
   * @param value   The new translated value.
   * @returns       A discriminated union describing the outcome.
   */
  async editTerm(unitId: number, value: string): Promise<TermEditResult> {
    const url = `${this.config.serverUrl}/api/units/${unitId}/`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
    const body = JSON.stringify({
      target: [value],
      state: STATE_TRANSLATED,
    });

    let response: FetchResult;
    try {
      response = await fetchWithRetry({ method: 'PATCH', url, headers, body });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'error', statusCode: 0, message };
    }

    if (response.status === 200) {
      return { kind: 'success' };
    }

    if (response.status === 404) {
      return { kind: 'not_found' };
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: 'auth_error' };
    }

    // Any other status code.
    let message = `Unexpected status ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch {
      // ignore
    }
    return { kind: 'error', statusCode: response.status, message };
  }
}
