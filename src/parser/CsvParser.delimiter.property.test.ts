/**
 * Property-Based Test: semicolon delimiter support.
 *
 * For any list of safe terms, serializing as a semicolon-delimited CSV should
 * parse back into equivalent terms.
 */

import * as fc from 'fast-check';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CsvParser } from './CsvParser';
import type { Term } from '../types/index';

function serializeCsv(terms: Term[]): string {
  const header1 = ';Português';
  const header2 = ';pt';
  const dataRows = terms.map((t) => `${t.key};${t.value}`);
  return [header1, header2, ...dataRows].join('\n');
}

function writeTempFile(content: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `fastlate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function deleteTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

const safeStringArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter(
    (s) =>
      s.trim().length > 0 &&
      !s.includes(';') &&
      !s.includes('"') &&
      !s.includes('\n') &&
      !s.includes('\r'),
  )
  .map((s) => s.trim());

const safeTermArb = fc.record({
  key: safeStringArb,
  value: safeStringArb,
  sourceRow: fc.integer({ min: 3, max: 1000 }),
});

const safeTermListArb = fc.array(safeTermArb, { minLength: 1, maxLength: 20 });

describe('CsvParser - Property 2: semicolon delimiter', () => {
  const parser = new CsvParser();

  it('parse(serializeSemicolon(terms)) preserves terms', () => {
    fc.assert(
      fc.property(safeTermListArb, (terms) => {
        const csv = serializeCsv(terms);
        const file = writeTempFile(csv);

        try {
          const result = parser.parseFile(file);

          expect(result.ok).toBe(true);
          if (!result.ok) {
            return false;
          }

          expect(result.value.terms).toHaveLength(terms.length);

          for (let i = 0; i < terms.length; i++) {
            expect(result.value.terms[i].key).toBe(terms[i].key);
            expect(result.value.terms[i].value).toBe(terms[i].value);
          }

          return true;
        } finally {
          deleteTempFile(file);
        }
      }),
      { numRuns: 100 },
    );
  });
});
