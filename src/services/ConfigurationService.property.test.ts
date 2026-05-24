/**
 * Property-based tests for ConfigurationService.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4**
 *
 * Property 4: Validação de configuração rejeita entradas inválidas
 * - Configurações com pelo menos um campo ausente, branco ou URL inválida
 *   devem sempre resultar em `{ ok: false }`.
 */

import * as fc from 'fast-check';
import { workspace } from 'vscode';
import { ConfigurationService } from './ConfigurationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arbitrary that produces blank strings (empty or only whitespace). */
const blankString: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.constant('  \t  \n  '),
);

/** Arbitrary that produces a non-blank, non-empty string. */
const nonBlankString: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0);

/** Arbitrary that produces invalid URLs (no http/https prefix, wrong scheme, empty host, etc.). */
const invalidUrl: fc.Arbitrary<string> = fc.oneof(
  // No scheme at all
  fc.constant('weblate.example.com'),
  fc.constant('example.com/path'),
  // Wrong scheme
  fc.constant('ftp://weblate.example.com'),
  fc.constant('ws://weblate.example.com'),
  fc.constant('file:///etc/passwd'),
  // http/https but empty host
  fc.constant('http://'),
  fc.constant('https://'),
  // Completely arbitrary non-URL strings
  nonBlankString.filter(
    (s) => !s.startsWith('http://') && !s.startsWith('https://'),
  ),
);

/** Arbitrary that produces valid URLs (http or https with a non-empty host). */
const validUrl: fc.Arbitrary<string> = fc.oneof(
  fc.constant('http://weblate.example.com'),
  fc.constant('https://weblate.example.com'),
  fc.constant('http://localhost:8080'),
  fc.constant('https://translate.mycompany.org/weblate'),
);

/** The configuration field names in order. */
const CONFIG_FIELDS = ['serverUrl', 'authToken', 'project', 'component', 'defaultLanguage'] as const;
type ConfigField = (typeof CONFIG_FIELDS)[number];

/**
 * Builds a mock `config.get` function that returns the provided values.
 */
function buildGetMock(values: Record<ConfigField, string | undefined>) {
  return jest.fn((key: string) => values[key as ConfigField]);
}

// ---------------------------------------------------------------------------
// Property 4: Validação de configuração rejeita entradas inválidas
// ---------------------------------------------------------------------------

describe('ConfigurationService — Property 4: rejeita entradas inválidas', () => {
  let service: ConfigurationService;
  let mockGet: jest.Mock;

  beforeEach(() => {
    service = new ConfigurationService();
    mockGet = jest.fn();
    (workspace.getConfiguration as jest.Mock).mockReturnValue({ get: mockGet });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 4a: Campo ausente (undefined) em qualquer posição → erro missing_field
  // -------------------------------------------------------------------------
  it('4a: retorna erro quando qualquer campo obrigatório está ausente (undefined)', () => {
    fc.assert(
      fc.property(
        // Pick which field will be absent
        fc.constantFrom<ConfigField>(...CONFIG_FIELDS),
        // Valid values for all other fields
        nonBlankString,
        nonBlankString,
        nonBlankString,
        nonBlankString,
        (absentField, v1, v2, v3, v4) => {
          // Build a full set of valid values, then remove one
          const otherValues = [v1, v2, v3, v4];
          const values: Record<ConfigField, string | undefined> = {
            serverUrl: 'http://weblate.example.com',
            authToken: 'token-abc',
            project: 'my-project',
            component: 'my-component',
            defaultLanguage: 'pt_BR',
          };

          // Replace the other fields with generated values (keep serverUrl valid)
          const nonAbsentFields = CONFIG_FIELDS.filter((f) => f !== absentField);
          nonAbsentFields.forEach((field, idx) => {
            if (field === 'serverUrl') {
              values[field] = 'http://weblate.example.com';
            } else {
              values[field] = otherValues[idx] ?? 'fallback';
            }
          });

          // Mark the chosen field as absent
          values[absentField] = undefined;

          mockGet.mockImplementation((key: string) => values[key as ConfigField]);

          const result = service.readConfiguration(mockGet('authToken'));

          return result.ok === false && result.error.kind === 'missing_field';
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // 4b: Campo em branco em qualquer posição → erro missing_field
  // -------------------------------------------------------------------------
  it('4b: retorna erro quando qualquer campo obrigatório está em branco', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONFIG_FIELDS),
        blankString,
        (blankField, blank) => {
          const values: Record<ConfigField, string | undefined> = {
            serverUrl: 'http://weblate.example.com',
            authToken: 'token-abc',
            project: 'my-project',
            component: 'my-component',
            defaultLanguage: 'pt_BR',
          };

          values[blankField] = blank;

          mockGet.mockImplementation((key: string) => values[key as ConfigField]);

          const result = service.readConfiguration(mockGet('authToken'));

          return result.ok === false && result.error.kind === 'missing_field';
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // 4c: URL inválida com todos os outros campos válidos → erro invalid_url
  // -------------------------------------------------------------------------
  it('4c: retorna erro quando serverUrl é inválida e todos os outros campos são válidos', () => {
    fc.assert(
      fc.property(
        invalidUrl,
        nonBlankString,
        nonBlankString,
        nonBlankString,
        nonBlankString,
        (badUrl, authToken, project, component, defaultLanguage) => {
          const values: Record<ConfigField, string | undefined> = {
            serverUrl: badUrl,
            authToken,
            project,
            component,
            defaultLanguage,
          };

          mockGet.mockImplementation((key: string) => values[key as ConfigField]);

          const result = service.readConfiguration(mockGet('authToken'));

          return result.ok === false && result.error.kind === 'invalid_url';
        },
      ),
      { numRuns: 200 },
    );
  });

  // -------------------------------------------------------------------------
  // 4d: Configuração com múltiplos campos inválidos → sempre retorna erro
  // -------------------------------------------------------------------------
  it('4d: retorna erro quando múltiplos campos são inválidos simultaneamente', () => {
    fc.assert(
      fc.property(
        // At least one field will be blank
        blankString,
        blankString,
        (blank1, blank2) => {
          const values: Record<ConfigField, string | undefined> = {
            serverUrl: blank1,
            authToken: blank2,
            project: 'my-project',
            component: 'my-component',
            defaultLanguage: 'pt_BR',
          };

          mockGet.mockImplementation((key: string) => values[key as ConfigField]);

          const result = service.readConfiguration(mockGet('authToken'));

          return result.ok === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // 4e: Configuração completamente válida → sempre retorna ok (sanity check)
  // -------------------------------------------------------------------------
  it('4e: retorna ok para configuração completamente válida (sanity check)', () => {
    fc.assert(
      fc.property(
        validUrl,
        nonBlankString,
        nonBlankString,
        nonBlankString,
        nonBlankString,
        (serverUrl, authToken, project, component, defaultLanguage) => {
          const values: Record<ConfigField, string | undefined> = {
            serverUrl,
            authToken,
            project,
            component,
            defaultLanguage,
          };

          mockGet.mockImplementation((key: string) => values[key as ConfigField]);

          const result = service.readConfiguration(mockGet('authToken'));

          return result.ok === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
