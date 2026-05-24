import * as fc from 'fast-check';
import { PreviewPanel } from './PreviewPanel';
import type { LanguageHeader, Term } from '../types/index';

type PreviewPanelHtmlBuilder = {
  _buildHtml(languageHeaders: LanguageHeader[], terms: Term[]): string;
};

interface PreviewRenderingCase {
  languageHeaders: LanguageHeader[];
  terms: Term[];
}

function buildPreviewHtml(
  languageHeaders: LanguageHeader[],
  terms: Term[],
): string {
  const panel = new PreviewPanel();
  const buildHtml = (panel as unknown as PreviewPanelHtmlBuilder)._buildHtml.bind(panel);
  return buildHtml(languageHeaders, terms);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const displayTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((value) => value.length > 0);

const languageHeaderArb: fc.Arbitrary<LanguageHeader> = fc.record({
  name: displayTextArb,
  code: displayTextArb,
});

const previewRenderingCaseArb: fc.Arbitrary<PreviewRenderingCase> = fc
  .array(languageHeaderArb, { minLength: 1, maxLength: 5 })
  .chain((languageHeaders) =>
    fc.record({
      languageHeaders: fc.constant(languageHeaders),
      terms: fc.array(
        fc.record({
          key: displayTextArb,
          values: fc
            .array(displayTextArb, {
              minLength: languageHeaders.length,
              maxLength: languageHeaders.length,
            })
            .map((values) =>
              values.map((value, index) => ({
                language: languageHeaders[index],
                value,
              })),
            ),
          sourceRow: fc.integer({ min: 3, max: 1000 }),
        }).map((term) => ({
          ...term,
          value: term.values[0]?.value ?? '',
        })),
        { minLength: 0, maxLength: 20 },
      ),
    }),
  );

describe('Property 9: Preview renderiza todos os dados lidos', () => {
  it('HTML gerado contem idioma, codigo, total e todos os termos', () => {
    fc.assert(
      fc.property(previewRenderingCaseArb, ({ languageHeaders, terms }) => {
        const html = buildPreviewHtml(languageHeaders, terms);

        expect(html).toContain(`Total de terms: ${terms.length}`);

        for (const language of languageHeaders) {
          expect(html).toContain(escapeHtml(language.name));
          expect(html).toContain(escapeHtml(language.code));
        }

        for (const term of terms) {
          expect(html).toContain(escapeHtml(term.key));
          for (const value of term.values ?? []) {
            expect(html).toContain(escapeHtml(value.value));
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
