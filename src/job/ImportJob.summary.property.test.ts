import * as fc from 'fast-check';
import { ImportJob } from './ImportJob';
import type {
  Term,
  WeblateConfiguration,
  TermEditResult,
} from '../types/index';

type TermOutcome = 'onlyEdited' | 'error';

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

const termArb: fc.Arbitrary<Term> = fc.record({
  key: nonBlankTextArb,
  value: nonBlankTextArb,
  sourceRow: fc.integer({ min: 3, max: 10_000 }),
});

const runCaseArb: fc.Arbitrary<Array<{ term: Term; outcome: TermOutcome }>> = fc.uniqueArray(
  fc.record({
    term: termArb,
    outcome: fc.constantFrom<TermOutcome>('onlyEdited', 'error'),
  }),
  { minLength: 0, maxLength: 30, selector: (item) => item.term.key },
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

function countOutcomes(
  runCase: Array<{ outcome: TermOutcome }>,
  outcome: TermOutcome,
): number {
  return runCase.filter((item) => item.outcome === outcome).length;
}

describe('Property 7: Correção do resumo final', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('created + onlyEdited + errors === total e cada Term pertence a uma categoria', async () => {
    await fc.assert(
      fc.asyncProperty(runCaseArb, async (runCase) => {
        mockClient.findTermId.mockReset();
        mockClient.listTermIds.mockReset();
        mockClient.editTerm.mockReset();

        mockClient.listTermIds.mockResolvedValue(new Map(
          runCase
            .filter((item) => item.outcome === 'onlyEdited')
            .map((item, index) => [item.term.key, index + 1]),
        ));
        mockClient.editTerm.mockResolvedValue({ kind: 'success' });

        const terms = runCase.map(({ term }) => term);
        const summary = await new ImportJob().run(createJobOptions(terms));

        expect(summary).toEqual({
          total: runCase.length,
          created: 0,
          onlyEdited: countOutcomes(runCase, 'onlyEdited'),
          errors: countOutcomes(runCase, 'error'),
          failedKeys: runCase
            .filter((item) => item.outcome === 'error')
            .map((item) => item.term.key)
            .filter((key, index, keys) => keys.indexOf(key) === index),
        });
        expect(summary.created + summary.onlyEdited + summary.errors).toBe(summary.total);
        expect(mockClient.editTerm).toHaveBeenCalledTimes(
          summary.onlyEdited,
        );
      }),
      { numRuns: 100 },
    );
  });
});
