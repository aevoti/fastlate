import { workspace } from 'vscode';
import { ConfigurationService } from './ConfigurationService';

// The vscode mock is mapped via jest.config.ts moduleNameMapper.
// `workspace.getConfiguration` returns a mock whose `get` can be configured per test.

describe('ConfigurationService', () => {
  let getMock: jest.Mock;
  let service: ConfigurationService;

  /** Helper: build a complete valid configuration map. */
  const validConfig: Record<string, string> = {
    serverUrl: 'https://weblate.example.com',
    authToken: 'my-secret-token',
    project: 'my-project',
    component: 'my-component',
    defaultLanguage: 'pt_BR',
  };

  beforeEach(() => {
    getMock = jest.fn();
    (workspace.getConfiguration as jest.Mock).mockReturnValue({ get: getMock });
    service = new ConfigurationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Helper: configure the mock to return a full valid config, optionally
  // overriding specific fields.
  // -------------------------------------------------------------------------
  function setupConfig(overrides: Partial<Record<string, string | undefined>> = {}): void {
    const merged = { ...validConfig, ...overrides };
    getMock.mockImplementation((key: string) => merged[key]);
  }

  // -------------------------------------------------------------------------
  // Requirement 1.1 — reads configuration from VSCode settings
  // -------------------------------------------------------------------------

  it('reads configuration from the "Fastlate" namespace', () => {
    setupConfig();
    service.readConfiguration(getMock('authToken'));
    expect(workspace.getConfiguration).toHaveBeenCalledWith('fastlate');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2 — valid complete configuration returns ok: true
  // -------------------------------------------------------------------------

  it('returns ok:true with all fields when configuration is complete and valid', () => {
    setupConfig();

    const result = service.readConfiguration(getMock('authToken'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        serverUrl: 'https://weblate.example.com',
        authToken: 'my-secret-token',
        project: 'my-project',
        component: 'my-component',
        defaultLanguage: 'pt_BR',
      });
    }
  });

  it('trims configured values before returning the Weblate configuration', () => {
    setupConfig({
      serverUrl: '  https://weblate.example.com  ',
      authToken: '  my-secret-token  ',
      project: '  my-project  ',
      component: '\tmy-component\n',
      defaultLanguage: '  pt_BR  ',
    });

    const result = service.readConfiguration(getMock('authToken'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        serverUrl: 'https://weblate.example.com',
        authToken: 'my-secret-token',
        project: 'my-project',
        component: 'my-component',
        defaultLanguage: 'pt_BR',
      });
    }
  });

  it('reads settings from full fastlate.* keys when scoped values are empty', () => {
    const scopedGet = jest.fn((key: string) => (key === 'serverUrl' ? '' : undefined));
    const rootValues: Record<string, string> = {
      'fastlate.serverUrl': 'https://weblate.example.com',
      'fastlate.project': 'my-project',
      'fastlate.component': 'my-component',
      'fastlate.defaultLanguage': 'pt_BR',
    };
    const rootGet = jest.fn((key: string) => rootValues[key]);
    (workspace.getConfiguration as jest.Mock).mockImplementation((section?: string) =>
      section === 'fastlate' ? { get: scopedGet } : { get: rootGet },
    );

    const result = service.readConfiguration('my-secret-token');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        serverUrl: 'https://weblate.example.com',
        authToken: 'my-secret-token',
        project: 'my-project',
        component: 'my-component',
        defaultLanguage: 'pt_BR',
      });
    }
  });

  it('accepts http:// URLs as valid', () => {
    setupConfig({ serverUrl: 'http://weblate.internal' });

    const result = service.readConfiguration(getMock('authToken'));

    expect(result.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2 — missing fields
  // -------------------------------------------------------------------------

  const requiredFields = ['serverUrl', 'authToken', 'project', 'component', 'defaultLanguage'] as const;

  describe.each(requiredFields)('missing field: %s', (field) => {
    it(`returns ok:false with missing_field error when "${field}" is absent`, () => {
      setupConfig({ [field]: undefined });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_field');
        expect((result.error as { kind: 'missing_field'; field: string }).field).toBe(field);
      }
    });

    it(`returns ok:false with missing_field error when "${field}" is null`, () => {
      setupConfig({ [field]: null as unknown as string });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_field');
      }
    });

    it(`returns ok:false with missing_field error when "${field}" is empty string`, () => {
      setupConfig({ [field]: '' });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_field');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2 — whitespace-only fields
  // -------------------------------------------------------------------------

  describe.each(requiredFields)('whitespace-only field: %s', (field) => {
    it(`returns ok:false with missing_field error when "${field}" contains only spaces`, () => {
      setupConfig({ [field]: '   ' });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_field');
        expect((result.error as { kind: 'missing_field'; field: string }).field).toBe(field);
      }
    });

    it(`returns ok:false with missing_field error when "${field}" contains only tabs and newlines`, () => {
      setupConfig({ [field]: '\t\n\r' });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing_field');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2 — validation order: missing fields are reported before URL
  // -------------------------------------------------------------------------

  it('reports missing_field for serverUrl before checking URL format', () => {
    setupConfig({ serverUrl: '' });

    const result = service.readConfiguration(getMock('authToken'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_field');
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 / 1.4 — invalid URLs
  // -------------------------------------------------------------------------

  const invalidUrls = [
    { label: 'no protocol', url: 'weblate.example.com' },
    { label: 'ftp protocol', url: 'ftp://weblate.example.com' },
    { label: 'empty string after protocol', url: 'https://' },
    { label: 'protocol only with slash', url: 'http://' },
    { label: 'file protocol', url: 'file:///etc/hosts' },
    { label: 'relative path', url: '/api/v1' },
    { label: 'just a word', url: 'localhost' },
  ];

  describe.each(invalidUrls)('invalid URL: $label', ({ url }) => {
    it(`returns ok:false with invalid_url error for "${url}"`, () => {
      setupConfig({ serverUrl: url });

      const result = service.readConfiguration(getMock('authToken'));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('invalid_url');
        expect((result.error as { kind: 'invalid_url'; value: string }).value).toBe(url);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 — valid URLs are accepted
  // -------------------------------------------------------------------------

  const validUrls = [
    'https://weblate.example.com',
    'http://weblate.example.com',
    'https://weblate.example.com/api/v1',
    'https://weblate.example.com:8080',
    'http://192.168.1.1',
    'https://sub.domain.example.com',
  ];

  it.each(validUrls)('accepts valid URL: %s', (url) => {
    setupConfig({ serverUrl: url });

    const result = service.readConfiguration(getMock('authToken'));

    expect(result.ok).toBe(true);
  });
});
