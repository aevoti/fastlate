import * as fc from 'fast-check';
import fetch from 'node-fetch';
import { WeblateHttpClient } from './WeblateHttpClient';
import type { WeblateConfiguration, Term } from '../types/index';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFetch = fetch as unknown as jest.Mock;

function response(status: number, jsonBody: unknown = {}): {
  status: number;
  json: jest.Mock;
  text: jest.Mock;
} {
  return {
    status,
    json: jest.fn().mockResolvedValue(jsonBody),
    text: jest.fn().mockResolvedValue(''),
  };
}

const nonBlankTextArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((value) => value.trim().length > 0);

const slugArb: fc.Arbitrary<string> = fc
  .stringMatching(/[a-zA-Z0-9][a-zA-Z0-9_-]{0,20}/)
  .filter((value) => value.trim().length > 0);

const configArb: fc.Arbitrary<WeblateConfiguration> = fc.record({
  serverUrl: fc.webUrl(),
  authToken: nonBlankTextArb,
  project: slugArb,
  component: slugArb,
});

const termArb: fc.Arbitrary<Term> = fc.record({
  key: nonBlankTextArb,
  value: nonBlankTextArb,
  sourceRow: fc.integer({ min: 3, max: 10_000 }),
});

describe('Property 5: Cabeçalho de autorização presente em todas as requisições', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('POST, GET e PATCH incluem Authorization: Token {token}', async () => {
    await fc.assert(
      fc.asyncProperty(
        configArb,
        termArb,
        fc.integer({ min: 1, max: 10_000 }),
        async (config, term, unitId) => {
          const client = new WeblateHttpClient(config, 'pt');

          mockFetch.mockResolvedValueOnce(response(201));
          await client.createKey(term.key, term.value);

          mockFetch.mockResolvedValueOnce(response(200, {
            results: [{ id: unitId, key: term.key }],
          }));
          await client.findTermId(term.key);

          mockFetch.mockResolvedValueOnce(response(200));
          await client.editTerm(unitId, term.value);

          const calls = mockFetch.mock.calls.slice(-3);
          expect(calls).toHaveLength(3);

          for (const [, options] of calls) {
            expect(options).toEqual(
              expect.objectContaining({
                headers: expect.objectContaining({
                  Authorization: `Token ${config.authToken}`,
                }),
              }),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
