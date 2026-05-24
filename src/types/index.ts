/**
 * Shared types and interfaces for the Fastlate VSCode extension.
 */

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** A discriminated union representing either a successful value or an error. */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Connection settings read from VSCode settings.json (Fastlate, fastlate.* namespace). */
export interface WeblateConfiguration {
  /** Base URL of the Weblate server (e.g. https://weblate.example.com). */
  serverUrl: string;
  /** Weblate API authentication token. */
  authToken: string;
  /** Weblate project slug. */
  project: string;
  /** Weblate component slug. */
  component: string;
}

/** Errors that can occur while reading or validating the configuration. */
export type ConfigurationError =
  | { kind: 'missing_field'; field: string }
  | { kind: 'invalid_url'; value: string };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * A language column declared by the two-row language header at the top of every
 * spreadsheet. Row 1 = language name, row 2 = language code.
 */
export interface LanguageHeader {
  /** Human-readable language name (row 1), e.g. "Português". */
  name: string;
  /** BCP-47 language code (row 2), e.g. "pt". */
  code: string;
}

/** A translated value associated with one language column. */
export interface TermValue {
  /** Language metadata for the column this value came from. */
  language: LanguageHeader;
  /** Translated value for the term in this language. */
  value: string;
}

/** A single translation term extracted from the spreadsheet. */
export interface Term {
  /** Translation key (column A, row 3+). */
  key: string;
  /** Translated value from the first language column, preserved for import compatibility. */
  value: string;
  /** Translated values from language columns B+, in the same order as languageHeaders. */
  values?: TermValue[];
  /** 1-based row number in the original file (used for log messages). */
  sourceRow: number;
}

/** Successful result of parsing a spreadsheet file. */
export interface ParseResult {
  /** First language metadata from the first two rows, preserved for import compatibility. */
  languageHeader: LanguageHeader;
  /** All language metadata read from columns B+. */
  languageHeaders: LanguageHeader[];
  /** All valid terms extracted from row 3 onwards. */
  terms: Term[];
}

/** Errors that can occur while parsing a spreadsheet file. */
export type ParseError =
  | { kind: 'missing_language_header' }
  | { kind: 'insufficient_columns' }
  | { kind: 'empty_spreadsheet' }
  | { kind: 'file_error'; message: string };

// ---------------------------------------------------------------------------
// HTTP / Weblate API
// ---------------------------------------------------------------------------

/** Result of attempting to create a source key via POST. */
export type KeyCreationResult =
  | { kind: 'created' }
  | { kind: 'already_exists'; message?: string }
  | { kind: 'auth_error' }
  | { kind: 'error'; statusCode: number; message: string };

/** Result of attempting to edit a term via PATCH. */
export type TermEditResult =
  | { kind: 'success' }
  | { kind: 'not_found' }
  | { kind: 'auth_error' }
  | { kind: 'error'; statusCode: number; message: string };

// ---------------------------------------------------------------------------
// Import Job
// ---------------------------------------------------------------------------

/** Aggregated counts reported at the end of an import job. */
export interface ImportSummary {
  /** Total number of terms that were processed. */
  total: number;
  /** Source keys successfully created before translation patching. */
  created: number;
  /** Terms found by exact lookup and edited (PATCH 200). */
  onlyEdited: number;
  /** Terms that could not be created or edited due to a definitive error. */
  errors: number;
  /** Unique translation keys that had definitive errors. */
  failedKeys: string[];
}
