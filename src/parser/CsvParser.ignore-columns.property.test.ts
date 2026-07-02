/**
 * Property-based tests for ignore-columns feature in CsvParser.
 *
 * Feature: ignore-columns
 * Tests Properties 1 and 2 from the design document.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fc from 'fast-check';
import { CsvParser } from './CsvParser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The ignored column names (lowercase) as defined in CsvParser. */
const IGNORED_NAMES_LOWER = ['local', 'seção'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes a CSV cell value for semicolon-delimited CSV. */
function escapeCell(value: string): string {
  if (value.includes('"') || value.includes(';') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Writes content to a temp file and returns its path. */
function writeTempCsv(content: string): string {
  const tmpFile = path.join(
    os.tmpdir(),
    `fastlate-ignore-col-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
  );
  fs.writeFileSync(tmpFile, content, 'utf-8');
  return tmpFile;
}

/** Removes a temp file, ignoring errors. */
function removeTempFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a valid language name that does NOT match the ignored list.
 * Avoids characters that would break CSV parsing.
 */
const validLangNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 2, maxLength: 15 })
  .map((s) => s.replace(/[;"\n\r]/g, '').trim())
  .filter((s) => {
    const trimmedLower = s.toLowerCase();
    return s.length >= 2 && !IGNORED_NAMES_LOWER.includes(trimmedLower);
  });

/**
 * Generates a valid language code (e.g. 'en', 'pt-br', 'fr').
 */
const langCodeArb: fc.Arbitrary<string> = fc
  .constantFrom('en', 'fr', 'de', 'es', 'it', 'pt', 'pt-br', 'ja', 'ko', 'zh', 'ru', 'ar', 'nl');

/**
 * Generates a variation of an ignored column name with random casing and
 * optional leading/trailing whitespace.
 */
const ignoredColumnVariantArb: fc.Arbitrary<{ original: string; headerValue: string }> = fc
  .record({
    baseName: fc.constantFrom('local', 'seção'),
    leadingSpaces: fc.integer({ min: 0, max: 3 }),
    trailingSpaces: fc.integer({ min: 0, max: 3 }),
    casingMode: fc.constantFrom('lower', 'upper', 'mixed'),
  })
  .map(({ baseName, leadingSpaces, trailingSpaces, casingMode }) => {
    let cased: string;
    switch (casingMode) {
      case 'lower':
        cased = baseName.toLowerCase();
        break;
      case 'upper':
        cased = baseName.toUpperCase();
        break;
      case 'mixed':
        cased = baseName
          .split('')
          .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
          .join('');
        break;
      default:
        cased = baseName;
    }
    const headerValue = ' '.repeat(leadingSpaces) + cased + ' '.repeat(trailingSpaces);
    // The original trimmed value is what should appear in ignoredColumns
    const original = headerValue.trim();
    return { original, headerValue };
  });

/**
 * Generates a non-empty trimmed string suitable for data row values.
 */
const cellValueArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .map((s) => s.replace(/[;"\n\r]/g, '').trim())
  .filter((s) => s.length > 0);

/**
 * Represents a column definition for test CSV generation.
 */
interface ColumnDef {
  type: 'language' | 'ignored';
  headerName: string;   // Raw header value (row 1) - may contain whitespace
  headerCode: string;   // Row 2 value
  trimmedName: string;  // What the parser will store as the trimmed name
}

/**
 * Generates a CSV test case with a mix of language and ignored columns.
 * Ensures at least one valid language column exists.
 */
const csvWithIgnoredColumnsArb: fc.Arbitrary<{
  columns: ColumnDef[];
  dataRows: string[][];
}> = fc
  .record({
    // At least 1 valid language column
    langColumns: fc.array(
      fc.record({ name: validLangNameArb, code: langCodeArb }),
      { minLength: 1, maxLength: 4 },
    ),
    // 0 to 3 ignored columns
    ignoredColumns: fc.array(ignoredColumnVariantArb, { minLength: 0, maxLength: 3 }),
    // Number of data rows
    numDataRows: fc.integer({ min: 1, max: 5 }),
  })
  .chain(({ langColumns, ignoredColumns, numDataRows }) => {
    // Build column definitions - we'll shuffle them later
    const langDefs: ColumnDef[] = langColumns.map((lc) => ({
      type: 'language' as const,
      headerName: lc.name,
      headerCode: lc.code,
      trimmedName: lc.name.trim(),
    }));

    const ignoredDefs: ColumnDef[] = ignoredColumns.map((ic) => ({
      type: 'ignored' as const,
      headerName: ic.headerValue,
      headerCode: 'xx', // ignored columns have some value in row 2
      trimmedName: ic.original,
    }));

    const allDefs = [...langDefs, ...ignoredDefs];

    // Shuffle column positions
    return fc.shuffledSubarray(allDefs, { minLength: allDefs.length, maxLength: allDefs.length })
      .chain((shuffledDefs) => {
        // Generate data rows
        const dataRowsArb = fc.array(
          fc.array(cellValueArb, { minLength: shuffledDefs.length, maxLength: shuffledDefs.length }),
          { minLength: numDataRows, maxLength: numDataRows },
        );
        return dataRowsArb.map((dataRows) => ({
          columns: shuffledDefs,
          dataRows,
        }));
      });
  });

/**
 * Builds a semicolon-delimited CSV string from column definitions and data rows.
 * Includes key column (column A) in the format the parser expects.
 */
function buildCsvFromDefs(columns: ColumnDef[], dataRows: string[][]): string {
  const delimiter = ';';

  // Row 1: key placeholder + header names
  const row1 = ['', ...columns.map((c) => escapeCell(c.headerName))].join(delimiter);
  // Row 2: key placeholder + header codes
  const row2 = ['', ...columns.map((c) => escapeCell(c.headerCode))].join(delimiter);
  // Data rows: key + values
  const dataLines = dataRows.map((row, idx) =>
    [`key${idx}`, ...row.map((v) => escapeCell(v))].join(delimiter),
  );

  return [row1, row2, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Property 1: Ignored columns are excluded from parsing output
// Feature: ignore-columns, Property 1: Ignored columns excluded from output
// ---------------------------------------------------------------------------

describe('CsvParser — Property 1: Ignored columns are excluded from parsing output', () => {
  const parser = new CsvParser();

  /**
   * **Validates: Requirements 1.1, 1.2, 1.5**
   *
   * For any valid CSV containing columns whose row-1 header (after trim + lowercase)
   * matches an entry in the ignore list, the resulting ParseResult.languageHeaders
   * SHALL NOT contain a LanguageHeader for those columns, and no Term.values array
   * SHALL contain a TermValue at the position of those columns.
   */
  it('ignored columns do not appear in languageHeaders or Term.values', () => {
    fc.assert(
      fc.property(csvWithIgnoredColumnsArb, ({ columns, dataRows }) => {
        const csv = buildCsvFromDefs(columns, dataRows);
        const tmpFile = writeTempCsv(csv);

        try {
          const result = parser.parseFile(tmpFile);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { languageHeaders, terms } = result.value;

          // Determine which columns are ignored
          const expectedLangColumns = columns.filter((c) => c.type === 'language');
          const expectedIgnoredColumns = columns.filter((c) => c.type === 'ignored');

          // languageHeaders should only contain non-ignored columns
          expect(languageHeaders.length).toBe(expectedLangColumns.length);

          // No languageHeader name should match an ignored column's trimmed name
          for (const lh of languageHeaders) {
            const isIgnored = IGNORED_NAMES_LOWER.includes(lh.name.trim().toLowerCase());
            expect(isIgnored).toBe(false);
          }

          // Term.values arrays should have the same length as languageHeaders
          for (const term of terms) {
            expect(term.values!.length).toBe(languageHeaders.length);
            // No TermValue should reference an ignored column
            for (const tv of term.values!) {
              const isIgnored = IGNORED_NAMES_LOWER.includes(tv.language.name.trim().toLowerCase());
              expect(isIgnored).toBe(false);
            }
          }
        } finally {
          removeTempFile(tmpFile);
        }
      }),
      { numRuns: 100, verbose: true },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: ignoredColumns array contains correct names in CSV order
// Feature: ignore-columns, Property 2: ignoredColumns array correctness
// ---------------------------------------------------------------------------

describe('CsvParser — Property 2: ignoredColumns array contains correct names in CSV order', () => {
  const parser = new CsvParser();

  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * For any valid CSV with N columns (where some are ignored and at least one valid
   * language column remains), the ParseResult.ignoredColumns array SHALL contain
   * exactly the original trimmed header values of the matched columns, in the same
   * left-to-right order they appeared in the CSV. When no columns match, the array
   * SHALL be empty.
   */
  it('ignoredColumns contains the correct trimmed names in left-to-right CSV order', () => {
    fc.assert(
      fc.property(csvWithIgnoredColumnsArb, ({ columns, dataRows }) => {
        const csv = buildCsvFromDefs(columns, dataRows);
        const tmpFile = writeTempCsv(csv);

        try {
          const result = parser.parseFile(tmpFile);

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const { ignoredColumns } = result.value;

          // Expected ignored columns: those whose trimmed+lowercased name is in the list,
          // in left-to-right CSV order (same order as `columns` array)
          const expectedIgnored = columns
            .filter((c) => IGNORED_NAMES_LOWER.includes(c.trimmedName.toLowerCase()))
            .map((c) => c.trimmedName);

          // ignoredColumns should match exactly in count and order
          expect(ignoredColumns.length).toBe(expectedIgnored.length);
          expect(ignoredColumns).toEqual(expectedIgnored);
        } finally {
          removeTempFile(tmpFile);
        }
      }),
      { numRuns: 100, verbose: true },
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * When no columns match the ignored list, the ignoredColumns array is empty.
   */
  it('ignoredColumns is empty when no columns match the ignored list', () => {
    fc.assert(
      fc.property(
        fc.record({
          langColumns: fc.array(
            fc.record({ name: validLangNameArb, code: langCodeArb }),
            { minLength: 1, maxLength: 5 },
          ),
          numDataRows: fc.integer({ min: 1, max: 5 }),
        }),
        ({ langColumns, numDataRows }) => {
          // Build CSV with only valid language columns (no ignored ones)
          const columns: ColumnDef[] = langColumns.map((lc) => ({
            type: 'language' as const,
            headerName: lc.name,
            headerCode: lc.code,
            trimmedName: lc.name.trim(),
          }));

          // Generate simple data rows
          const dataRows: string[][] = Array.from({ length: numDataRows }, () =>
            columns.map(() => 'value'),
          );

          const csv = buildCsvFromDefs(columns, dataRows);
          const tmpFile = writeTempCsv(csv);

          try {
            const result = parser.parseFile(tmpFile);

            expect(result.ok).toBe(true);
            if (!result.ok) return;

            // ignoredColumns should be empty
            expect(result.value.ignoredColumns).toEqual([]);
          } finally {
            removeTempFile(tmpFile);
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});
