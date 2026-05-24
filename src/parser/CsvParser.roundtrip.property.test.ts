/**
 * Property 1: Round-trip de parsing CSV
 *
 * Para qualquer lista de Terms com chaves e valores arbitrários (incluindo
 * caracteres especiais, espaços internos, Unicode e quebras de linha),
 * serializar os Terms em formato CSV e depois fazer o parsing do resultado
 * deve produzir uma lista de Terms com chaves e valores idênticos byte a byte
 * aos originais.
 *
 * **Validates: Requirements 8.1, 8.2, 2.2, 2.3, 3.1**
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as fc from 'fast-check';
import * as Papa from 'papaparse';
import { CsvParser } from './CsvParser';
import type { Term } from '../types/index';

// ---------------------------------------------------------------------------
// Helper: CSV serializer
// ---------------------------------------------------------------------------

/**
 * Serializes a list of Terms into a CSV string that the CsvParser can parse.
 *
 * CSV structure:
 *   Row 1: ,<langName>   (column A unused, column B = language name)
 *   Row 2: ,<langCode>   (column A unused, column B = language code)
 *   Row 3+: <key>,<value>
 *
 * Uses papaparse.unparse to ensure correct RFC 4180 quoting for cells that
 * contain commas, double-quotes, or newlines.
 */
function serializeTermsToCsv(
  terms: Array<{ key: string; value: string }>,
  langName = 'TestLang',
  langCode = 'tl',
): string {
  const rows: string[][] = [
    ['', langName],
    ['', langCode],
    ...terms.map((t) => [t.key, t.value]),
  ];

  return Papa.unparse(rows, { newline: '\n' });
}

/**
 * Writes `content` to a temporary file and returns its path.
 * The caller is responsible for deleting the file afterwards.
 */
function writeTempFile(content: string): string {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `fastlate-roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(tmpFile, content, 'utf-8');
  return tmpFile;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a non-empty string that:
 *   - Has no leading or trailing whitespace (the parser trims cells)
 *   - Has at least one non-whitespace character (so it survives the empty check)
 *
 * Allows internal spaces, Unicode characters, special characters, and
 * internal newlines — all of which papaparse handles via quoting.
 */
const nonEmptyTrimmedString: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  // Ensure the string is non-empty after trimming
  .filter((s) => s.trim().length > 0)
  // Ensure no leading/trailing whitespace (parser trims, so round-trip must match)
  .map((s) => s.trim());

/**
 * Generates a single Term-like object with non-empty trimmed key and value.
 */
const termArbitrary: fc.Arbitrary<{ key: string; value: string }> = fc.record({
  key: nonEmptyTrimmedString,
  value: nonEmptyTrimmedString,
});

/**
 * Generates a non-empty list of Terms (1–20 items).
 */
const termListArbitrary: fc.Arbitrary<Array<{ key: string; value: string }>> = fc.array(
  termArbitrary,
  { minLength: 1, maxLength: 20 },
);

// ---------------------------------------------------------------------------
// Property 1: Round-trip de parsing CSV
// ---------------------------------------------------------------------------

describe('CsvParser — Property 1: Round-trip de parsing CSV', () => {
  const parser = new CsvParser();

  /**
   * **Validates: Requirements 8.1, 8.2, 2.2, 2.3, 3.1**
   *
   * For any list of Terms with arbitrary keys and values (Unicode, spaces,
   * special characters), serializing to CSV and parsing back must produce
   * Terms whose keys and values are identical byte-for-byte to the originals.
   */
  it('Property 1: serializar em CSV e fazer parsing preserva chaves e valores byte a byte', () => {
    fc.assert(
      fc.property(termListArbitrary, (terms) => {
        const csv = serializeTermsToCsv(terms);
        const tmpFile = writeTempFile(csv);

        try {
          const result = parser.parseFile(tmpFile);

          // The parse must succeed
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const parsedTerms: Term[] = result.value.terms;

          // The number of parsed terms must equal the number of input terms
          expect(parsedTerms.length).toBe(terms.length);

          // Each term's key and value must be identical byte-for-byte
          for (let i = 0; i < terms.length; i++) {
            expect(parsedTerms[i].key).toBe(terms[i].key);
            expect(parsedTerms[i].value).toBe(terms[i].value);
          }
        } finally {
          // Clean up temp file
          try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        }
      }),
      { numRuns: 100, verbose: true },
    );
  });
});
