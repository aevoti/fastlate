import * as fc from 'fast-check';
import { ImportJob } from './ImportJob';
import type {
  Term,
  WeblateConfiguration,
  TermEditResult,
} from '../types/index';

const mockClient = {
  findTermId: jest.fn<Promise<number | null>, [string]>(),
  listTermIds: jest.fn<Promise<Map<string, number>>, []>(),
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
  defaultLanguage: 'pt_BR',
};

const nonBlankTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((value) => value.trim().length > 0);

const termsArb: fc.Arbitrary<Term[]> = fc.uniqueArray(
  fc.record({
    key: nonBlankTextArb,
    value: nonBlankTextArb,
    sourceRow: fc.integer({ min: 3, max: 10_000 }),
  }),
  { minLength: 0, maxLength: 30, selector: (term) => term.key },
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

describe('Property 6: correct API call sequence per Term', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('performs one exact key lookup and one edit for each found term', async () => {
    await fc.assert(
      fc.asyncProperty(termsArb, async (terms) => {
        mockClient.findTermId.mockReset();
        mockClient.listTermIds.mockReset();
        mockClient.editTerm.mockReset();

        mockClient.findTermId.mockImplementation(async (key) => {
          const index = terms.findIndex((term) => term.key === key);
          return index === -1 ? null : index + 1;
        });
        mockClient.editTerm.mockResolvedValue({ kind: 'success' });

        const summary = await new ImportJob().run(createJobOptions(terms));

        expect(summary).toMatchObject({
          total: terms.length,
          created: 0,
          onlyEdited: terms.length,
          errors: 0,
        });
        expect(mockClient.listTermIds).not.toHaveBeenCalled();
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
