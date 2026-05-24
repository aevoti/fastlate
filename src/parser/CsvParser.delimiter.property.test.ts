/**
 * Property-Based Test: Invariância ao delimitador (Property 2)
 *
 * **Validates: Requirements 2.4**
 *
 * Para qualquer lista de Terms cujas chaves e valores não contenham vírgulas
 * nem ponto-e-vírgulas, serializar como CSV com delimitador vírgula e
 * serializar com delimitador ponto-e-vírgula devem produzir, após parsing,
 * listas de Terms equivalentes.
 *
 * Feature: Fastlate, Property 2: Invariância ao delimitador
 */

import * as fc from 'fast-check';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CsvParser } from './CsvParser';
import type { Term } from '../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serializes a list of Terms into a CSV string using the given delimiter.
 *
 * CSV structure:
 *   Row 1: <delimiter>Português   (language name in column B)
 *   Row 2: <delimiter>pt          (language code in column B)
 *   Row 3+: key<delimiter>value   (terms)
 */
function serializeCsv(terms: Term[], delimiter: ',' | ';'): string {
  const header1 = `${delimiter}Português`;
  const header2 = `${delimiter}pt`;
  const dataRows = terms.map((t) => `${t.key}${delimiter}${t.value}`);
  return [header1, header2, ...dataRows].join('\n');
}

/**
 * Writes content to a temp file and returns the file path.
 */
function writeTempFile(content: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `fastlate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Cleans up a temp file, ignoring errors.
 */
function deleteTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Arbitrary: strings without commas, semicolons, or newlines
// ---------------------------------------------------------------------------

/**
 * Generates a non-empty string that does not contain commas (,),
 * semicolons (;), quotes ("), or newline characters (\n, \r).
 * These constraints ensure the CSV can be parsed unambiguously with
 * either delimiter.
 */
const safeStringArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(
    (s) =>
      s.trim().length > 0 &&
      !s.includes(',') &&
      !s.includes(';') &&
      !s.includes('"') &&
      !s.includes('\n') &&
      !s.includes('\r'),
  );

/**
 * Generates a single Term with safe key and value strings.
 */
const safeTermArb = fc.record({
  key: safeStringArb,
  value: safeStringArb,
  sourceRow: fc.integer({ min: 3, max: 1000 }),
});

/**
 * Generates a non-empty list of safe Terms (1–20 terms).
 */
const safeTermListArb = fc.array(safeTermArb, { minLength: 1, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('CsvParser — Property 2: Invariância ao delimitador', () => {
  const parser = new CsvParser();

  /**
   * **Validates: Requirements 2.4**
   *
   * For any list of Terms whose keys and values contain no commas or
   * semicolons, parsing a comma-delimited CSV and parsing a
   * semicolon-delimited CSV must produce identical Term lists.
   */
  it('parse(serializeComma(terms)) ≡ parse(serializeSemicolon(terms))', () => {
    fc.assert(
      fc.property(safeTermListArb, (terms) => {
        const csvComma = serializeCsv(terms, ',');
        const csvSemicolon = serializeCsv(terms, ';');

        const fileComma = writeTempFile(csvComma);
        const fileSemicolon = writeTempFile(csvSemicolon);

        try {
          const resultComma = parser.parseFile(fileComma);
          const resultSemicolon = parser.parseFile(fileSemicolon);

          // Both parses must succeed
          expect(resultComma.ok).toBe(true);
          expect(resultSemicolon.ok).toBe(true);

          if (!resultComma.ok || !resultSemicolon.ok) {
            return false;
          }

          const termsComma = resultComma.value.terms;
          const termsSemicolon = resultSemicolon.value.terms;

          // Same number of terms
          expect(termsComma.length).toBe(termsSemicolon.length);

          // Each term must have identical key and value
          for (let i = 0; i < termsComma.length; i++) {
            expect(termsComma[i].key).toBe(termsSemicolon[i].key);
            expect(termsComma[i].value).toBe(termsSemicolon[i].value);
          }

          return true;
        } finally {
          deleteTempFile(fileComma);
          deleteTempFile(fileSemicolon);
        }
      }),
      { numRuns: 100 },
    );
  });
});
