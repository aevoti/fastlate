/**
 * Property 3: Filtragem de linhas inválidas
 *
 * Validates: Requirements 3.3, 3.4, 2.7
 *
 * Propriedade: dado um CSV com mix de linhas válidas (chave não-vazia E valor
 * não-vazio) e linhas inválidas (chave vazia, valor vazio ou ambos), o parser
 * deve retornar exatamente `countValidRows(csv)` termos — nem mais, nem menos.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fc from 'fast-check';
import { CsvParser } from './CsvParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes a CSV cell value (wraps in quotes if it contains delimiter or quotes). */
function escapeCell(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes(delimiter) || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialises a single row to a CSV line. */
function rowToCsvLine(col1: string, col2: string, delimiter: string): string {
  return `${escapeCell(col1, delimiter)}${delimiter}${escapeCell(col2, delimiter)}`;
}

/** Writes content to a temp file and returns its path. */
function writeTempCsv(content: string): string {
  const tmpFile = path.join(os.tmpdir(), `fastlate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
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
 * Generates a non-empty string that is safe to use as a CSV cell value.
 * Avoids delimiters and quoting characters so this property focuses only on
 * invalid row filtering, not CSV delimiter detection or escaping behavior.
 */
const nonEmptyCellArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 40 }).filter(
  (s) =>
    s.trim().length > 0 &&
    !s.includes(',') &&
    !s.includes(';') &&
    !s.includes('"') &&
    !s.includes('\n') &&
    !s.includes('\r'),
);

/**
 * Represents a data row (after the Language_Header).
 * `kind` determines whether the row is valid or invalid:
 *   - 'valid'       → key non-empty AND value non-empty  (should be kept)
 *   - 'empty_key'   → key empty, value non-empty         (should be skipped)
 *   - 'empty_value' → key non-empty, value empty         (should be skipped)
 *   - 'both_empty'  → key empty AND value empty          (should be skipped)
 */
type RowKind = 'valid' | 'empty_key' | 'empty_value' | 'both_empty';

interface DataRow {
  kind: RowKind;
  key: string;
  value: string;
}

interface MixedRowsCase {
  langName: string;
  langCode: string;
  rowsBefore: DataRow[];
  rowsAfter: DataRow[];
}

interface EmptyKeyCase {
  langName: string;
  langCode: string;
  validValues: string[];
  emptyKeyValues: string[];
}

interface EmptyValueCase {
  langName: string;
  langCode: string;
  validKeys: string[];
  emptyValueKeys: string[];
}

const dataRowArb: fc.Arbitrary<DataRow> = fc.oneof(
  // valid row
  fc.record({
    kind: fc.constant<RowKind>('valid'),
    key: nonEmptyCellArb,
    value: nonEmptyCellArb,
  }),
  // empty key
  fc.record({
    kind: fc.constant<RowKind>('empty_key'),
    key: fc.constant(''),
    value: nonEmptyCellArb,
  }),
  // empty value
  fc.record({
    kind: fc.constant<RowKind>('empty_value'),
    key: nonEmptyCellArb,
    value: fc.constant(''),
  }),
  // both empty
  fc.record({
    kind: fc.constant<RowKind>('both_empty'),
    key: fc.constant(''),
    value: fc.constant(''),
  }),
);

// ---------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------

describe('Property 3: Filtragem de linhas inválidas', () => {
  const parser = new CsvParser();

  /**
   * **Validates: Requirements 3.3, 3.4, 2.7**
   *
   * Para qualquer mix de linhas válidas e inválidas, o número de termos
   * retornados deve ser igual ao número de linhas com chave E valor não-vazios.
   */
  it('result.terms.length === countValidRows(csv) para qualquer mix de linhas válidas e inválidas', () => {
    fc.assert(
      fc.property(
        fc.record({
          langName: nonEmptyCellArb,
          langCode: nonEmptyCellArb,
          rowsBefore: fc.array(dataRowArb, { minLength: 0, maxLength: 20 }),
          rowsAfter: fc.array(dataRowArb, { minLength: 0, maxLength: 20 }),
        }),
        ({ langName, langCode, rowsBefore, rowsAfter }: MixedRowsCase) => {
          // Ensure there is at least one valid row so the parser succeeds
          const validRow: DataRow = { kind: 'valid', key: 'key1', value: 'value1' };
          const allRows: DataRow[] = [...rowsBefore, validRow, ...rowsAfter];

          const delimiter = ';';

          // Build CSV:
          //   Row 1: language name in column B
          //   Row 2: language code in column B
          //   Row 3+: data rows
          const headerRow1 = rowToCsvLine('', langName, delimiter);
          const headerRow2 = rowToCsvLine('', langCode, delimiter);
          const dataLines = allRows.map((r) => rowToCsvLine(r.key, r.value, delimiter));

          const csvContent = [headerRow1, headerRow2, ...dataLines].join('\n');

          // Count expected valid rows: key.trim() !== '' AND value.trim() !== ''
          const expectedCount = allRows.filter(
            (r) => r.key.trim() !== '' && r.value.trim() !== '',
          ).length;

          const tmpFile = writeTempCsv(csvContent);
          try {
            const result = parser.parseFile(tmpFile);

            // The parser must succeed (we always have at least one valid row)
            expect(result.ok).toBe(true);
            if (!result.ok) return;

            // Core property: only valid rows are returned
            expect(result.value.terms.length).toBe(expectedCount);
          } finally {
            removeTempFile(tmpFile);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * Linhas com chave vazia são ignoradas independentemente do valor.
   */
  it('linhas com chave vazia são sempre ignoradas', () => {
    fc.assert(
      fc.property(
        fc.record({
          langName: nonEmptyCellArb,
          langCode: nonEmptyCellArb,
          validValues: fc.array(nonEmptyCellArb, { minLength: 1, maxLength: 10 }),
          emptyKeyValues: fc.array(nonEmptyCellArb, { minLength: 0, maxLength: 10 }),
        }),
        ({ langName, langCode, validValues, emptyKeyValues }: EmptyKeyCase) => {
          const delimiter = ';';

          const headerRow1 = rowToCsvLine('', langName, delimiter);
          const headerRow2 = rowToCsvLine('', langCode, delimiter);

          // Build valid rows (key = 'k<i>', value = validValues[i])
          const validLines = validValues.map((v, i) =>
            rowToCsvLine(`key${i}`, v, delimiter),
          );

          // Build empty-key rows
          const emptyKeyLines = emptyKeyValues.map((v) =>
            rowToCsvLine('', v, delimiter),
          );

          // Interleave: valid, empty-key, valid, empty-key, ...
          const dataLines: string[] = [];
          const maxLen = Math.max(validLines.length, emptyKeyLines.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < validLines.length) dataLines.push(validLines[i]);
            if (i < emptyKeyLines.length) dataLines.push(emptyKeyLines[i]);
          }

          const csvContent = [headerRow1, headerRow2, ...dataLines].join('\n');

          const tmpFile = writeTempCsv(csvContent);
          try {
            const result = parser.parseFile(tmpFile);

            expect(result.ok).toBe(true);
            if (!result.ok) return;

            // Only valid rows (with non-empty key) should appear
            expect(result.value.terms.length).toBe(validValues.length);

            // No term should have an empty key
            for (const term of result.value.terms) {
              expect(term.key.trim()).not.toBe('');
            }
          } finally {
            removeTempFile(tmpFile);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.4, 2.7**
   *
   * Linhas com valor vazio são ignoradas independentemente da chave.
   */
  it('linhas com valor vazio são sempre ignoradas', () => {
    fc.assert(
      fc.property(
        fc.record({
          langName: nonEmptyCellArb,
          langCode: nonEmptyCellArb,
          validKeys: fc.array(nonEmptyCellArb, { minLength: 1, maxLength: 10 }),
          emptyValueKeys: fc.array(nonEmptyCellArb, { minLength: 0, maxLength: 10 }),
        }),
        ({ langName, langCode, validKeys, emptyValueKeys }: EmptyValueCase) => {
          const delimiter = ';';

          const headerRow1 = rowToCsvLine('', langName, delimiter);
          const headerRow2 = rowToCsvLine('', langCode, delimiter);

          // Build valid rows (key = validKeys[i], value = 'v<i>')
          const validLines = validKeys.map((k, i) =>
            rowToCsvLine(k, `value${i}`, delimiter),
          );

          // Build empty-value rows
          const emptyValueLines = emptyValueKeys.map((k) =>
            rowToCsvLine(k, '', delimiter),
          );

          // Interleave
          const dataLines: string[] = [];
          const maxLen = Math.max(validLines.length, emptyValueLines.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < validLines.length) dataLines.push(validLines[i]);
            if (i < emptyValueLines.length) dataLines.push(emptyValueLines[i]);
          }

          const csvContent = [headerRow1, headerRow2, ...dataLines].join('\n');

          const tmpFile = writeTempCsv(csvContent);
          try {
            const result = parser.parseFile(tmpFile);

            expect(result.ok).toBe(true);
            if (!result.ok) return;

            // Only valid rows (with non-empty value) should appear
            expect(result.value.terms.length).toBe(validKeys.length);

            // No term should have an empty value
            for (const term of result.value.terms) {
              expect(term.value.trim()).not.toBe('');
            }
          } finally {
            removeTempFile(tmpFile);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
