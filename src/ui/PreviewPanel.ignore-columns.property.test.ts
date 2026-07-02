import * as fc from 'fast-check';
import { PreviewPanel } from './PreviewPanel';
import { t } from '../i18n';
import type { LanguageHeader, Term } from '../types/index';

// Feature: ignore-columns

type PreviewPanelHtmlBuilder = {
  _buildHtml(
    languageHeaders: LanguageHeader[],
    terms: Term[],
    state: { kind: string },
    ignoredColumns: string[],
  ): string;
};

function buildPreviewHtmlWithIgnored(ignoredColumns: string[]): string {
  const panel = new PreviewPanel();
  const builder = panel as unknown as PreviewPanelHtmlBuilder;
  const buildHtml = builder._buildHtml.bind(panel);
  return buildHtml(
    [{ name: 'English', code: 'en' }],
    [],
    { kind: 'ready' },
    ignoredColumns,
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Arbitrary for generating non-empty column name strings.
 * Avoids strings that are empty after trimming. Excludes newlines to keep <li> parsing simple.
 */
const columnNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(/[\n\r]/g, '').trim())
  .filter((s) => s.length > 0);

/**
 * Arbitrary for column names that contain at least one HTML special character.
 */
const htmlSpecialColumnNameArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 10 }).map((s) => s.replace(/[\n\r]/g, '')),
    fc.constantFrom('&', '<', '>', '"', "'"),
    fc.string({ minLength: 0, maxLength: 10 }).map((s) => s.replace(/[\n\r]/g, '')),
  )
  .map(([prefix, special, suffix]) => `${prefix}${special}${suffix}`)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Feature: ignore-columns, Property 3: Ignored-columns section renders with correct content when present
describe('Property 3: Ignored-columns section renders with correct content when present', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any ParseResult with a non-empty ignoredColumns array (up to 50 items),
   * the PreviewPanel HTML output contains a heading with the localized label
   * and lists each column name as a separate item in the same order as the array.
   */
  it('HTML contains the localized heading and all column names in correct order', () => {
    fc.assert(
      fc.property(
        fc.array(columnNameArb, { minLength: 1, maxLength: 50 }),
        (ignoredColumns) => {
          const html = buildPreviewHtmlWithIgnored(ignoredColumns);

          // Section must be present with correct class and localized heading
          expect(html).toContain('class="ignored-columns"');
          expect(html).toContain(escapeHtml(t('preview.ignoredColumns')));

          // Each column name must appear as an <li> item, HTML-escaped
          for (const col of ignoredColumns) {
            expect(html).toContain(`<li>${escapeHtml(col)}</li>`);
          }

          // Verify order: extract all <li> contents and check they match
          const liRegex = /<li>(.*?)<\/li>/g;
          const rendered: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = liRegex.exec(html)) !== null) {
            rendered.push(match[1]);
          }

          const expected = ignoredColumns.map((c) => escapeHtml(c));
          expect(rendered).toEqual(expected);
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});

// Feature: ignore-columns, Property 4: Ignored-columns section is absent when list is empty
describe('Property 4: Ignored-columns section is absent when list is empty', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any ParseResult with an empty ignoredColumns array, the PreviewPanel HTML
   * does not contain the ignored-columns section heading or any related markup.
   */
  it('HTML does NOT contain the ignored-columns section when ignoredColumns is empty', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            code: fc.string({ minLength: 2, maxLength: 5 }).filter((s) => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            value: fc.string({ minLength: 0, maxLength: 40 }),
            sourceRow: fc.integer({ min: 3, max: 100 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (languageHeaders, terms) => {
          const panel = new PreviewPanel();
          const builder = panel as unknown as PreviewPanelHtmlBuilder;
          const buildHtml = builder._buildHtml.bind(panel);

          const fullTerms: Term[] = terms.map((t) => ({
            ...t,
            values: languageHeaders.map((lang) => ({
              language: lang,
              value: t.value,
            })),
          }));

          const html = buildHtml(
            languageHeaders,
            fullTerms,
            { kind: 'ready' },
            [], // empty ignoredColumns
          );

          expect(html).not.toContain('class="ignored-columns"');
          expect(html).not.toContain(t('preview.ignoredColumns'));
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});

// Feature: ignore-columns, Property 5: HTML special characters in column names are escaped
describe('Property 5: HTML special characters in column names are escaped', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any column name containing HTML special characters (& < > " '),
   * when rendered in the ignored-columns section, the output contains only the
   * escaped entity equivalents and never the raw special characters within data content.
   */
  it('rendered HTML contains only escaped equivalents for special characters in <li> items', () => {
    fc.assert(
      fc.property(
        fc.array(htmlSpecialColumnNameArb, { minLength: 1, maxLength: 10 }),
        (ignoredColumns) => {
          const html = buildPreviewHtmlWithIgnored(ignoredColumns);

          // Section must be present
          expect(html).toContain('class="ignored-columns"');

          // Each column name should appear only in escaped form within <li> tags
          for (const col of ignoredColumns) {
            const escaped = escapeHtml(col);
            expect(html).toContain(`<li>${escaped}</li>`);

            // The raw unescaped value should NOT appear as <li> content
            // (unless it happens to be the same as the escaped version, which won't happen
            // since our arbitrary guarantees at least one special char)
            if (col !== escaped) {
              expect(html).not.toContain(`<li>${col}</li>`);
            }
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});

// Feature: ignore-columns, Property 6: Truncation at 50 with remaining count indicator
describe('Property 6: Truncation at 50 with remaining count indicator', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For arrays with length > 50, the PreviewPanel HTML renders exactly the first
   * 50 column names and displays a "+N more" indicator (where N = length - 50).
   * For arrays with length ≤ 50, all names are rendered without a truncation indicator.
   */
  it('arrays > 50 show first 50 + "+N more"; arrays ≤ 50 show all without indicator', () => {
    fc.assert(
      fc.property(
        fc.array(columnNameArb, { minLength: 1, maxLength: 100 }),
        (ignoredColumns) => {
          const html = buildPreviewHtmlWithIgnored(ignoredColumns);

          // Extract all <li> contents
          const liRegex = /<li>(.*?)<\/li>/g;
          const rendered: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = liRegex.exec(html)) !== null) {
            rendered.push(match[1]);
          }

          if (ignoredColumns.length <= 50) {
            // All items rendered, no truncation indicator
            const expected = ignoredColumns.map((c) => escapeHtml(c));
            expect(rendered).toEqual(expected);
            expect(html).not.toMatch(/\+\d+ more/);
          } else {
            // First 50 items rendered + "+N more" indicator
            const expectedVisible = ignoredColumns.slice(0, 50).map((c) => escapeHtml(c));
            const remaining = ignoredColumns.length - 50;
            const moreIndicator = `+${remaining} more`;

            // 50 column names + 1 "+N more" indicator = 51 items
            expect(rendered.length).toBe(51);
            expect(rendered.slice(0, 50)).toEqual(expectedVisible);
            expect(rendered[50]).toBe(moreIndicator);
          }
        },
      ),
      { numRuns: 100, verbose: true },
    );
  });
});
