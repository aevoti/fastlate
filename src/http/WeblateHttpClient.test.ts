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

function response(
  status: number,
  jsonBody: unknown = {},
  textBody = '',
): { status: number; json: jest.Mock; text: jest.Mock } {
  return {
    status,
    json: jest.fn().mockResolvedValue(jsonBody),
    text: jest.fn().mockResolvedValue(textBody),
  };
}

describe('WeblateHttpClient', () => {
  let client: WeblateHttpClient;

  beforeEach(() => {
    client = new WeblateHttpClient(config, 'pt');
    mockFetch.mockReset();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createKey', () => {
    it.each([200, 201])('returns created for HTTP %i', async (status) => {
      mockFetch.mockResolvedValue(response(status));

      await expect(client.createKey('button.save', 'Salvar')).resolves.toEqual({
        kind: 'created',
      });
    });

    it('returns already_exists for HTTP 400 duplicate key errors', async () => {
      mockFetch.mockResolvedValue(response(400, { key: ['This key already exists.'] }));

      await expect(client.createKey('button.save', 'Salvar')).resolves.toMatchObject({
        kind: 'already_exists',
        message: 'This key already exists.',
      });
    });

    it('returns already_exists for HTTP 400 messages containing already exist', async () => {
      mockFetch.mockResolvedValue(response(400, {
        error: 'Weblate says this value may already exist in the component.',
      }));

      await expect(client.createKey('button.save', 'Salvar')).resolves.toMatchObject({
        kind: 'already_exists',
        message: 'Weblate says this value may already exist in the component.',
      });
    });

    it('returns already_exists for nested HTTP 400 messages containing already exist', async () => {
      mockFetch.mockResolvedValue(response(400, {
        errors: [
          { message: 'This string seems already exist' },
        ],
      }));

      await expect(client.createKey('button.save', 'Salvar')).resolves.toMatchObject({
        kind: 'already_exists',
        message: 'This string seems already exist',
      });
    });

    it('sends the key and primary value in the POST body', async () => {
      mockFetch.mockResolvedValue(response(201));

      await client.createKey('button.save', 'Salvar');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://weblate.example.com/api/translations/project-slug/component-slug/pt/units/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            key: 'button.save',
            value: ['Salvar'],
            state: 20,
          }),
        }),
      );
    });
  });

  describe('editTerm', () => {
    it('returns success for HTTP 200', async () => {
      mockFetch.mockResolvedValue(response(200));

      await expect(client.editTerm(123, 'Salvar')).resolves.toEqual({ kind: 'success' });
    });

    it('returns not_found for HTTP 404', async () => {
      mockFetch.mockResolvedValue(response(404));

      await expect(client.editTerm(123, 'Salvar')).resolves.toEqual({ kind: 'not_found' });
    });

    it.each([401, 403])('returns auth_error for HTTP %i', async (status) => {
      mockFetch.mockResolvedValue(response(status));

      await expect(client.editTerm(123, 'Salvar')).resolves.toEqual({ kind: 'auth_error' });
    });

    it('sends Authorization header on PATCH requests', async () => {
      mockFetch.mockResolvedValue(response(200));

      await client.editTerm(123, 'Salvar');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Token secret-token',
          }),
        }),
      );
    });
  });

  describe('findTermId', () => {
    it('uses Weblate exact key search syntax in the q query parameter', async () => {
      mockFetch.mockResolvedValue(response(200, { results: [] }));

      await client.findTermId('button.save');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://weblate.example.com/api/translations/project-slug/component-slug/pt/units/?q=key%3A%3D%22button.save%22',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('escapes quotes in exact key search queries', async () => {
      mockFetch.mockResolvedValue(response(200, { results: [] }));

      await client.findTermId('button."save"');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://weblate.example.com/api/translations/project-slug/component-slug/pt/units/?q=key%3A%3D%22button.%5C%22save%5C%22%22',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns the id for an exact key match in search results', async () => {
      mockFetch.mockResolvedValue(response(200, {
        results: [
          { id: 111, key: 'button.save.more' },
          { id: 123, key: 'button.save' },
        ],
      }));

      await expect(client.findTermId('button.save')).resolves.toBe(123);
    });

    it('returns null when search results do not contain an exact key match', async () => {
      mockFetch.mockResolvedValue(response(200, {
        results: [
          { id: 111, key: 'button.save.more' },
          { id: 112, source: ['button.save.more'] },
        ],
      }));

      await expect(client.findTermId('button.save')).resolves.toBeNull();
    });
  });

  describe('retry behavior', () => {
    it('retries HTTP 5xx exactly 3 times before returning an error', async () => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValue(response(500, {}, 'server error'));

      const resultPromise = client.editTerm(123, 'Salvar');
      await jest.runAllTimersAsync();

      await expect(resultPromise).resolves.toMatchObject({
        kind: 'error',
        statusCode: 0,
        message: 'HTTP 500',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries timeout-like request failures exactly 3 times before returning an error', async () => {
      jest.useFakeTimers();
      mockFetch.mockRejectedValue(Object.assign(new Error('The operation was aborted.'), {
        name: 'AbortError',
      }));

      const resultPromise = client.editTerm(123, 'Salvar');
      await jest.runAllTimersAsync();

      await expect(resultPromise).resolves.toMatchObject({
        kind: 'error',
        statusCode: 0,
        message: 'The operation was aborted.',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
