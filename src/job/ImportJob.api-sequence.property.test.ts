import * as fc from 'fast-check';
import { ImportJob } from './ImportJob';
import type {
  Term,
  WeblateConfiguration,
  TermEditResult,
} from '../types/index';

const mockClient = {
  findTermId: jest.fn<Promise<number | null>, [string]>(),
  editTerm: jest.fn<Promise<TermEditResult>, [number, string]>(),
};

jest.mock('../http/WeblateHttpClient', () => ({
  WeblateHttpClient: jest.fn(() => mockClient),
}));

const config: WeblateConfiguration = {
  serverUrl: 'https://weblate.example.com',
  authToken: 'secret-token',
  project: 'project-slug',
  component: 'component-slug',
};

const nonBlankTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((value) => value.trim().length > 0);

const termsArb: fc.Arbitrary<Term[]> = fc.array(
  fc.record({
    key: nonBlankTextArb,
    value: nonBlankTextArb,
    sourceRow: fc.integer({ min: 3, max: 10_000 }),
  }),
  { minLength: 0, maxLength: 30 },
);

function createJobOptions(terms: Term[]) {
  return {
    config,
    languageCode: 'pt',
    terms,
    cancellationToken: { isCancellationRequested: false } as never,
    progress: { report: jest.fn() } as never,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never,
  };
}

describe('Property 6: Sequência correta de chamadas de API por Term', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('realiza exatamente N buscas e N chamadas de edição para N terms criados previamente', async () => {
    await fc.assert(
      fc.asyncProperty(termsArb, async (terms) => {
        mockClient.findTermId.mockReset();
        mockClient.editTerm.mockReset();

        mockClient.findTermId.mockImplementation(async () => mockClient.findTermId.mock.calls.length);
        mockClient.editTerm.mockResolvedValue({ kind: 'success' });

        const summary = await new ImportJob().run(createJobOptions(terms));

        expect(summary).toMatchObject({
          total: terms.length,
          created: 0,
          onlyEdited: terms.length,
          errors: 0,
        });
        expect(mockClient.findTermId).toHaveBeenCalledTimes(terms.length);
        expect(mockClient.editTerm).toHaveBeenCalledTimes(terms.length);

        terms.forEach((term, index) => {
          expect(mockClient.findTermId).toHaveBeenNthCalledWith(index + 1, term.key);
          expect(mockClient.editTerm).toHaveBeenNthCalledWith(
            index + 1,
            index + 1,
            term.value,
          );
        });
      }),
      { numRuns: 100 },
    );
  });
});
