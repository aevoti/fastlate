import * as fc from 'fast-check';
import fetch from 'node-fetch';
import { WeblateHttpClient } from './WeblateHttpClient';
import type { WeblateConfiguration } from '../types/index';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFetch = fetch as unknown as jest.Mock;

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

function retryDelayCalls(timeoutSpy: jest.SpyInstance): unknown[][] {
  return timeoutSpy.mock.calls.filter(([, delayMs]) => delayMs === 2_000);
}

describe('Property 8: Comportamento de retry para falhas de rede', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('falhas de rede realizam exatamente 3 tentativas com intervalo de 2 segundos', async () => {
    await fc.assert(
    fc.asyncProperty(nonBlankTextArb, async (value) => {
        jest.useFakeTimers();
        const timeoutSpy = jest.spyOn(global, 'setTimeout');
        const client = new WeblateHttpClient(config, 'pt');

        mockFetch.mockReset();
        mockFetch.mockRejectedValue(new Error('network unavailable'));

        const resultPromise = client.editTerm(123, value);
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toMatchObject({
          kind: 'error',
          statusCode: 0,
          message: 'network unavailable',
        });
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(retryDelayCalls(timeoutSpy)).toHaveLength(2);

        jest.useRealTimers();
        timeoutSpy.mockRestore();
      }),
      { numRuns: 100 },
    );
  });
});
