import * as fs from 'fs';
import * as Papa from 'papaparse';
import type { ParseResult, ParseError, Result, Term, LanguageHeader, TermValue } from '../types/index';

/** Optional logger interface for warnings during parsing. */
export interface ParserLogger {
  warn(message: string): void;
}

/**
 * Parses a CSV file into a `ParseResult` containing `LanguageHeader[]` and
 * a list of `Term[]`.
 *
 * CSV structure:
 *   With key column:
 *     Row 1 (index 0): language names  → LanguageHeader.name  (columns B+)
 *     Row 2 (index 1): language codes  → LanguageHeader.code  (columns B+)
 *     Row 3+ (index 2+): terms         → key (col A), values (columns B+)
 *
 *   Without key column:
 *     Row 1 (index 0): language names  → LanguageHeader.name  (columns A+)
 *     Row 2 (index 1): language codes  → LanguageHeader.code  (columns A+)
 *     Row 3+ (index 2+): terms         → values (columns A+), key = default language value
 */
export class CsvParser {
  /**
   * Reads and parses a CSV file at `filePath`.
   *
   * @param filePath - Absolute or relative path to the CSV file.
   * @param logger   - Optional logger; receives `warn()` calls for skipped rows.
   * @returns `{ ok: true, value: ParseResult }` on success, or
   *          `{ ok: false, error: ParseError }` on failure.
   */
  parseFile(
    filePath: string,
    logger?: ParserLogger,
    defaultLanguage?: string,
  ): Result<ParseResult, ParseError> {
    // -----------------------------------------------------------------------
    // 1. Read the file
    // -----------------------------------------------------------------------
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { kind: 'file_error', message } };
    }

    // -----------------------------------------------------------------------
    // 2. Strip UTF-8 BOM if present (Requirement 8.3)
    // -----------------------------------------------------------------------
    if (raw.startsWith('\uFEFF')) {
      raw = raw.slice(1);
    }

    // -----------------------------------------------------------------------
    // 3. Parse with papaparse
    //    - dynamicTyping: false  → all cells remain strings (Req 8.1, 8.2)
    //    - delimiter: ''         → auto-detect comma vs semicolon (Req 2.4)
    //    - skipEmptyLines: false → we handle empty lines ourselves so that
    //                             row numbers stay accurate
    // -----------------------------------------------------------------------
    const parsed = Papa.parse<string[]>(raw, {
      dynamicTyping: false,
      delimiter: '',
      skipEmptyLines: false,
    });

    const rows: string[][] = parsed.data;

    // -----------------------------------------------------------------------
    // 4. Check minimum column count across all non-empty rows (Req 3.2)
    //    A row is "non-empty" when it has at least one non-blank cell.
    // -----------------------------------------------------------------------
    for (const row of rows) {
      const hasContent = row.some((cell) => cell.trim() !== '');
      if (hasContent && row.length < 2) {
        return { ok: false, error: { kind: 'insufficient_columns' } };
      }
    }

    // -----------------------------------------------------------------------
    // 5. Extract Language_Header from rows 1 and 2 (Req 2.3, 2.9)
    //    In the legacy format, columns B+ hold language metadata and column A
    //    is the key. In value-only CSVs, columns A+ hold language metadata.
    // -----------------------------------------------------------------------
    const rawRow1 = rows[0] ?? [];
    const row2 = rows[1] ?? [];
    const languageStartColumn = this._looksLikeLanguageCode(row2[0] ?? '') ? 0 : 1;
    const row1 = this._expandCommaSeparatedLanguageNames(
      rawRow1,
      row2,
      languageStartColumn,
    );

    const languageHeaders: LanguageHeader[] = [];
    const headerColumnCount = Math.max(row1.length, row2.length);

    for (let columnIndex = languageStartColumn; columnIndex < headerColumnCount; columnIndex++) {
      const langName = (row1[columnIndex] ?? '').trim();
      const langCode = (row2[columnIndex] ?? '').trim();

      if (langName === '' && langCode === '') {
        continue;
      }

      if (langName === '' || langCode === '') {
        return { ok: false, error: { kind: 'missing_language_header' } };
      }

      languageHeaders.push({ name: langName, code: langCode });
    }

    if (languageHeaders.length === 0) {
      return { ok: false, error: { kind: 'missing_language_header' } };
    }

    const languageHeader = languageHeaders[0];
    const primaryLanguageIndex = this._findPrimaryLanguageIndex(languageHeaders, defaultLanguage);
    if (primaryLanguageIndex < 0) {
      return {
        ok: false,
        error: {
          kind: 'missing_default_language_column',
          languageCode: defaultLanguage ?? '',
        },
      };
    }

    // -----------------------------------------------------------------------
    // 6. Process data rows (row 3+, index 2+) into Terms (Req 3.1, 3.3, 3.4)
    // -----------------------------------------------------------------------
    const terms: Term[] = [];

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const sourceRow = i + 1; // 1-based row number

      // Skip completely empty rows silently
      const hasContent = row.some((cell) => (cell ?? '').trim() !== '');
      if (!hasContent) {
        continue;
      }

      const values: TermValue[] = languageHeaders
        .map((language, languageIndex) => ({
          language,
          value: (row[languageStartColumn + languageIndex] ?? '').trim(),
        }));

      const key =
        languageStartColumn === 0
          ? values[primaryLanguageIndex]?.value ?? values[0]?.value ?? ''
          : (row[0] ?? '').trim();

      if (key === '') {
        logger?.warn(`Row ${sourceRow}: skipping — key is empty.`);
        continue;
      }

      if (values.every(({ value }) => value === '')) {
        logger?.warn(`Row ${sourceRow}: skipping — value columns are empty.`);
        continue;
      }

      const primaryValue = values[primaryLanguageIndex]?.value ?? values[0]?.value ?? '';

      terms.push({ key, value: primaryValue, values, sourceRow });
    }

    // -----------------------------------------------------------------------
    // 7. Require at least one valid term (Req 2.6)
    // -----------------------------------------------------------------------
    if (terms.length === 0) {
      return { ok: false, error: { kind: 'empty_spreadsheet' } };
    }

    return { ok: true, value: { languageHeader, languageHeaders, terms } };
  }

  private _looksLikeLanguageCode(value: string): boolean {
    return /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(value.trim());
  }

  private _findPrimaryLanguageIndex(
    languageHeaders: LanguageHeader[],
    defaultLanguage?: string,
  ): number {
    if (!defaultLanguage) {
      const portugueseIndex = languageHeaders.findIndex((language) => {
        const normalized = language.code.trim().toLowerCase().replace('-', '_');
        return normalized === 'pt' || normalized === 'pt_br';
      });

      return portugueseIndex >= 0 ? portugueseIndex : 0;
    }

    const normalizedDefaultLanguage = defaultLanguage.trim().toLowerCase().replace('-', '_');
    return languageHeaders.findIndex(
      (language) =>
        language.code.trim().toLowerCase().replace('-', '_') === normalizedDefaultLanguage,
    );
  }

  private _expandCommaSeparatedLanguageNames(
    row1: string[],
    row2: string[],
    languageStartColumn: number,
  ): string[] {
    if (row1.length >= row2.length) {
      return row1;
    }

    const expanded = [...row1];

    for (let i = languageStartColumn; i < expanded.length && expanded.length < row2.length; i++) {
      const cell = expanded[i] ?? '';
      if (!cell.includes(',')) {
        continue;
      }

      const names = cell
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');

      if (names.length <= 1) {
        continue;
      }

      expanded.splice(i, 1, ...names);
    }

    return expanded;
  }
}
