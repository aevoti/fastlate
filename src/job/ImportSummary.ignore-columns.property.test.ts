// Feature: ignore-columns, Property 7: Summary message correctly includes or omits ignored columns line
import * as fc from 'fast-check';
import { buildSummaryMessage } from '../extension';
import type { ImportSummary } from '../types/index';

/**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Property 7: For any ImportSummary and ignoredColumns array, when ignoredColumns is non-empty
 * the summary message ends with a newline followed by the i18n label and column names joined
 * by ", " in original order. When empty, the summary is identical to the standard format.
 */

const nonBlankStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const importSummaryArb: fc.Arbitrary<ImportSummary> = fc.record({
  total: fc.integer({ min: 0, max: 10_000 }),
  created: fc.integer({ min: 0, max: 5_000 }),
  onlyEdited: fc.integer({ min: 0, max: 5_000 }),
  errors: fc.integer({ min: 0, max: 5_000 }),
  failedKeys: fc.array(nonBlankStringArb, { minLength: 0, maxLength: 10 }),
});

const ignoredColumnsArb: fc.Arbitrary<string[]> = fc.array(nonBlankStringArb, {
  minLength: 1,
  maxLength: 10,
});

describe('Property 7: Summary message correctly includes or omits ignored columns line', () => {
  it('when ignoredColumns is non-empty, summary ends with newline + label + joined names', () => {
    fc.assert(
      fc.property(importSummaryArb, ignoredColumnsArb, (summary, ignoredColumns) => {
        const message = buildSummaryMessage(summary, ignoredColumns);
        const expectedSuffix = '\n' + 'Colunas ignoradas' + ': ' + ignoredColumns.join(', ');

        expect(message).toContain(expectedSuffix);
        expect(message.endsWith(expectedSuffix)).toBe(true);
      }),
      { numRuns: 100, verbose: true },
    );
  });

  it('when ignoredColumns is empty, summary matches standard format without extra text', () => {
    fc.assert(
      fc.property(importSummaryArb, (summary) => {
        const messageWithEmpty = buildSummaryMessage(summary, []);
        const messageWithUndefined = buildSummaryMessage(summary, undefined);
        const messageWithoutParam = buildSummaryMessage(summary);

        // All three should produce the same output
        expect(messageWithEmpty).toBe(messageWithUndefined);
        expect(messageWithEmpty).toBe(messageWithoutParam);

        // Should not contain a newline (the ignored columns line would add one)
        expect(messageWithEmpty).not.toContain('\nColunas ignoradas');
        expect(messageWithEmpty).not.toContain('\nIgnored columns');
      }),
      { numRuns: 100, verbose: true },
    );
  });

  it('ignored columns preserve original order in the summary', () => {
    fc.assert(
      fc.property(importSummaryArb, ignoredColumnsArb, (summary, ignoredColumns) => {
        const message = buildSummaryMessage(summary, ignoredColumns);
        const lines = message.split('\n');
        const lastLine = lines[lines.length - 1];

        // The last line should contain columns joined with ", " in the same order
        const expectedJoined = ignoredColumns.join(', ');
        expect(lastLine).toContain(expectedJoined);
      }),
      { numRuns: 100, verbose: true },
    );
  });
});
