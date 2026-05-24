/**
 * Error class hierarchy for the Fastlate extension.
 *
 * All errors thrown by Fastlate extend `FastlateError` so callers can
 * distinguish extension errors from unexpected runtime errors with a single
 * `instanceof` check.
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Base class for all errors originating from the Fastlate extension. */
export class FastlateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FastlateError';
    // Restore the prototype chain (required when extending built-in Error in TS).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Configuration errors
// ---------------------------------------------------------------------------

/** Thrown when a required configuration field is absent or blank. */
export class MissingFieldError extends FastlateError {
  constructor(public readonly field: string) {
    super(`Missing required configuration field: "${field}"`);
    this.name = 'MissingFieldError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the configured server URL is not a valid HTTP/HTTPS URL. */
export class InvalidUrlError extends FastlateError {
  constructor(public readonly value: string) {
    super(`Invalid server URL: "${value}". Must start with http:// or https:// and contain a non-empty host.`);
    this.name = 'InvalidUrlError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Groups all configuration-related errors.
 * Subclasses: `MissingFieldError`, `InvalidUrlError`.
 */
export class ConfigurationError extends FastlateError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

/** Thrown when the spreadsheet file cannot be read (e.g. corrupted or missing). */
export class FileReadError extends FastlateError {
  constructor(public readonly cause: string) {
    super(`Failed to read spreadsheet file: ${cause}`);
    this.name = 'FileReadError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when rows 1 or 2 of the spreadsheet are empty (Language_Header absent). */
export class MissingLanguageHeaderError extends FastlateError {
  constructor() {
    super('The spreadsheet is missing the language header (rows 1 and 2 must contain the language name and code).');
    this.name = 'MissingLanguageHeaderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the spreadsheet contains no terms after the Language_Header. */
export class EmptySpreadsheetError extends FastlateError {
  constructor() {
    super('The spreadsheet contains no translation terms (rows 3+ are empty).');
    this.name = 'EmptySpreadsheetError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the spreadsheet has fewer than two columns. */
export class InsufficientColumnsError extends FastlateError {
  constructor() {
    super('The spreadsheet must have at least two columns (key and value).');
    this.name = 'InsufficientColumnsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Groups all spreadsheet-parsing errors.
 * Subclasses: `FileReadError`, `MissingLanguageHeaderError`,
 * `EmptySpreadsheetError`, `InsufficientColumnsError`.
 */
export class ParseError extends FastlateError {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// HTTP / API errors
// ---------------------------------------------------------------------------

/** Thrown when the Weblate API returns HTTP 401 or 403. */
export class AuthenticationError extends FastlateError {
  constructor(public readonly statusCode: 401 | 403) {
    super(`Authentication failed (HTTP ${statusCode}). Check your Weblate auth token.`);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a network request fails due to timeout or connection error. */
export class NetworkError extends FastlateError {
  constructor(public readonly cause: string) {
    super(`Network error: ${cause}`);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the Weblate API returns an unexpected HTTP status code. */
export class UnexpectedStatusError extends FastlateError {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Unexpected HTTP status ${statusCode}: ${body}`);
    this.name = 'UnexpectedStatusError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Groups all HTTP/API errors.
 * Subclasses: `AuthenticationError`, `NetworkError`, `UnexpectedStatusError`.
 */
export class HttpError extends FastlateError {
  constructor(message: string) {
    super(message);
    this.name = 'HttpError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Import errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the import job is aborted due to an unrecoverable error
 * (e.g. authentication failure mid-job).
 */
export class ImportError extends FastlateError {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
