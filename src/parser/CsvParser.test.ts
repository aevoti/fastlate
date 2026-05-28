import * as fs from 'fs';
import { CsvParser } from './CsvParser';
import type { ParseResult, ParseError, Result } from '../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal valid CSV string with the given rows (semicolon-delimited). */
function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.join(';')).join('\n');
}

/**
 * Standard valid CSV content:
 *   Row 1: language name header
 *   Row 2: language code header
 *   Row 3+: terms
 */
const VALID_ROWS = [
  ['label', 'Português'],
  ['code', 'pt'],
  ['button.save', 'Salvar'],
  ['button.cancel', 'Cancelar'],
];

// ---------------------------------------------------------------------------
// Mock fs.readFileSync
// ---------------------------------------------------------------------------

jest.mock('fs');
const mockReadFileSync = fs.readFileSync as jest.Mock;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CsvParser', () => {
  let parser: CsvParser;
  let warnMock: jest.Mock;

  beforeEach(() => {
    parser = new CsvParser();
    warnMock = jest.fn();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement 2.4 - Semicolon delimiter
  // -------------------------------------------------------------------------

  describe('delimiter handling (Requirement 2.4)', () => {
    it('parses a CSV with semicolon delimiter correctly', () => {
      const csv = buildCsv(VALID_ROWS);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeader.name).toBe('Português');
      expect(result.value.languageHeader.code).toBe('pt');
      expect(result.value.terms).toHaveLength(2);
      expect(result.value.terms[0]).toMatchObject({ key: 'button.save', value: 'Salvar', sourceRow: 3 });
      expect(result.value.terms[1]).toMatchObject({ key: 'button.cancel', value: 'Cancelar', sourceRow: 4 });
    });

    it('rejects a comma-delimited CSV as insufficient columns', () => {
      const csv = VALID_ROWS.map((row) => row.join(',')).join('\n');
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('insufficient_columns');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 8.3 — UTF-8 BOM handling
  // -------------------------------------------------------------------------

  describe('UTF-8 BOM handling (Requirement 8.3)', () => {
    it('strips the UTF-8 BOM and parses the file correctly', () => {
      const csv = '\uFEFF' + buildCsv(VALID_ROWS);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeader.name).toBe('Português');
      expect(result.value.languageHeader.code).toBe('pt');
      expect(result.value.terms).toHaveLength(2);
    });

    it('parses a file without BOM the same as one with BOM', () => {
      const csvWithBom = '\uFEFF' + buildCsv(VALID_ROWS);
      const csvWithoutBom = buildCsv(VALID_ROWS);

      mockReadFileSync.mockReturnValueOnce(csvWithBom);
      const resultWithBom = parser.parseFile('/fake/bom.csv');

      mockReadFileSync.mockReturnValueOnce(csvWithoutBom);
      const resultWithoutBom = parser.parseFile('/fake/nobom.csv');

      expect(resultWithBom.ok).toBe(true);
      expect(resultWithoutBom.ok).toBe(true);
      if (!resultWithBom.ok || !resultWithoutBom.ok) return;
      expect(resultWithBom.value).toEqual(resultWithoutBom.value);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.9 — Missing Language_Header (row 1 or row 2 empty)
  // -------------------------------------------------------------------------

  describe('missing Language_Header (Requirement 2.9)', () => {
    it('returns missing_language_header error when row 1 language name is empty', () => {
      const csv = buildCsv([
        ['label', ''],       // row 1: empty language name
        ['code', 'pt'],      // row 2: language code
        ['key1', 'value1'],  // row 3: term
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('missing_language_header');
    });

    it('returns missing_language_header error when row 2 language code is empty', () => {
      const csv = buildCsv([
        ['label', 'Português'], // row 1: language name
        ['code', ''],           // row 2: empty language code
        ['key1', 'value1'],     // row 3: term
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('missing_language_header');
    });

    it('returns missing_language_header error when both rows 1 and 2 are empty', () => {
      const csv = buildCsv([
        ['label', ''],      // row 1: empty
        ['code', ''],       // row 2: empty
        ['key1', 'value1'], // row 3: term
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('missing_language_header');
    });

    it('returns missing_language_header error when row 1 contains only whitespace', () => {
      const csv = buildCsv([
        ['label', '   '],   // row 1: whitespace only
        ['code', 'pt'],     // row 2: language code
        ['key1', 'value1'], // row 3: term
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('missing_language_header');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.6 — Empty spreadsheet (no terms after Language_Header)
  // -------------------------------------------------------------------------

  describe('empty spreadsheet — no terms (Requirement 2.6)', () => {
    it('returns empty_spreadsheet error when there are no data rows after the header', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        // no terms
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('empty_spreadsheet');
    });

    it('returns empty_spreadsheet error when all data rows have empty keys and values', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['', ''],   // row 3: completely empty
        ['', ''],   // row 4: completely empty
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('empty_spreadsheet');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 3.2 — Insufficient columns (fewer than 2)
  // -------------------------------------------------------------------------

  describe('insufficient columns (Requirement 3.2)', () => {
    it('returns insufficient_columns error when a non-empty row has only one column', () => {
      // Single-column CSV: papaparse will parse each row as a 1-element array
      const csv = ['Português', 'pt', 'button.save'].join('\n');
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('insufficient_columns');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 3.3 & 3.4 — Skip rows with empty key or empty value
  // -------------------------------------------------------------------------

  describe('skipping rows with empty key or value (Requirements 3.3, 3.4)', () => {
    it('skips a row with an empty key and logs a warning with the row number', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['', 'SomeValue'],      // row 3: empty key → skip
        ['button.save', 'Salvar'], // row 4: valid
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv', { warn: warnMock });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.terms).toHaveLength(1);
      expect(result.value.terms[0]).toMatchObject({ key: 'button.save', value: 'Salvar', sourceRow: 4 });
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock.mock.calls[0][0]).toContain('3'); // row number
      expect(warnMock.mock.calls[0][0]).toContain('key');
    });

    it('skips a row with an empty value and logs a warning with the row number', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['button.save', ''],       // row 3: empty value → skip
        ['button.cancel', 'Cancelar'], // row 4: valid
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv', { warn: warnMock });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.terms).toHaveLength(1);
      expect(result.value.terms[0]).toMatchObject({ key: 'button.cancel', value: 'Cancelar', sourceRow: 4 });
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock.mock.calls[0][0]).toContain('3'); // row number
      expect(warnMock.mock.calls[0][0]).toContain('value');
    });

    it('skips multiple rows with empty keys/values and continues processing', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['', 'NoKey'],             // row 3: empty key → skip
        ['button.save', ''],       // row 4: empty value → skip
        ['button.ok', 'OK'],       // row 5: valid
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv', { warn: warnMock });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.terms).toHaveLength(1);
      expect(result.value.terms[0]).toMatchObject({ key: 'button.ok', value: 'OK', sourceRow: 5 });
      expect(warnMock).toHaveBeenCalledTimes(2);
    });

    it('does not call logger when no rows are skipped', () => {
      const csv = buildCsv(VALID_ROWS);
      mockReadFileSync.mockReturnValue(csv);

      parser.parseFile('/fake/file.csv', { warn: warnMock });

      expect(warnMock).not.toHaveBeenCalled();
    });

    it('works without a logger when rows are skipped (no crash)', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['', 'NoKey'],
        ['button.save', 'Salvar'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      expect(() => parser.parseFile('/fake/file.csv')).not.toThrow();
      const result = parser.parseFile('/fake/file.csv');
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.5 — Corrupted / inaccessible file
  // -------------------------------------------------------------------------

  describe('corrupted or inaccessible file (Requirement 2.5)', () => {
    it('returns file_error when fs.readFileSync throws an Error', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = parser.parseFile('/fake/missing.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('file_error');
      expect((result.error as { kind: 'file_error'; message: string }).message).toContain('ENOENT');
    });

    it('returns file_error when fs.readFileSync throws a non-Error value', () => {
      mockReadFileSync.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'permission denied';
      });

      const result = parser.parseFile('/fake/noperm.csv');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('file_error');
      expect((result.error as { kind: 'file_error'; message: string }).message).toContain('permission denied');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2.3 — Language_Header extraction
  // -------------------------------------------------------------------------

  describe('Language_Header extraction (Requirement 2.3)', () => {
    it('reads language name from column B of row 1 and code from column B of row 2', () => {
      const csv = buildCsv([
        ['ignored_label', 'English'],
        ['ignored_code', 'en'],
        ['greeting', 'Hello'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeader).toEqual({ name: 'English', code: 'en' });
    });

    it('reads all language names and codes from columns B onwards', () => {
      const csv = buildCsv([
        ['ignored_label', 'Português', 'English', 'Español'],
        ['ignored_code', 'pt', 'en', 'es'],
        ['greeting', 'Olá', 'Hello', 'Hola'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeaders).toEqual([
        { name: 'Português', code: 'pt' },
        { name: 'English', code: 'en' },
        { name: 'Español', code: 'es' },
      ]);
      expect(result.value.terms[0].values).toEqual([
        { language: { name: 'Português', code: 'pt' }, value: 'Olá' },
        { language: { name: 'English', code: 'en' }, value: 'Hello' },
        { language: { name: 'Español', code: 'es' }, value: 'Hola' },
      ]);
    });

    it('reads language names and codes from column A when the CSV has no key column', () => {
      const csv = buildCsv([
        ['Português', 'Inglês', 'Espanhol', 'Francês'],
        ['pt_BR', 'en', 'es', 'fr'],
        ['bola', 'ball', 'pelota', 'balle'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeaders).toEqual([
        { name: 'Português', code: 'pt_BR' },
        { name: 'Inglês', code: 'en' },
        { name: 'Espanhol', code: 'es' },
        { name: 'Francês', code: 'fr' },
      ]);
      expect(result.value.terms[0]).toMatchObject({
        key: 'bola',
        value: 'bola',
        sourceRow: 3,
      });
      expect(result.value.terms[0].values).toEqual([
        { language: { name: 'Português', code: 'pt_BR' }, value: 'bola' },
        { language: { name: 'Inglês', code: 'en' }, value: 'ball' },
        { language: { name: 'Espanhol', code: 'es' }, value: 'pelota' },
        { language: { name: 'Francês', code: 'fr' }, value: 'balle' },
      ]);
    });

    it('returns missing_default_language_column when configured default language is absent', () => {
      const csv = buildCsv([
        ['label', 'English', 'EspaÃ±ol'],
        ['code', 'en', 'es'],
        ['button.save', 'Save', 'Guardar'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv', undefined, 'pt_BR');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toEqual({
        kind: 'missing_default_language_column',
        languageCode: 'pt_BR',
      });
    });

    it('splits comma-separated language names when semicolon rows provide more language codes', () => {
      const csv = [
        'Português; Inglês, Espanhol, Frances',
        'pt_BR;en;es;fr',
        'bola;ball;pelota;balle',
      ].join('\n');
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.languageHeaders).toEqual([
        { name: 'Português', code: 'pt_BR' },
        { name: 'Inglês', code: 'en' },
        { name: 'Espanhol', code: 'es' },
        { name: 'Frances', code: 'fr' },
      ]);
      expect(result.value.terms[0]).toMatchObject({
        key: 'bola',
        value: 'bola',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 8.1 / 8.2 — Value preservation (no transformation)
  // -------------------------------------------------------------------------

  describe('value preservation (Requirements 8.1, 8.2)', () => {
    it('preserves special characters in keys and values', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['key.with.dots', 'Value with spaces & special chars: <>"\''],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.terms[0].key).toBe('key.with.dots');
      expect(result.value.terms[0].value).toBe('Value with spaces & special chars: <>"\'');
    });
  });

  // -------------------------------------------------------------------------
  // sourceRow accuracy
  // -------------------------------------------------------------------------

  describe('sourceRow accuracy', () => {
    it('assigns correct 1-based sourceRow numbers to terms', () => {
      const csv = buildCsv([
        ['label', 'Português'],
        ['code', 'pt'],
        ['key1', 'val1'],
        ['key2', 'val2'],
        ['key3', 'val3'],
      ]);
      mockReadFileSync.mockReturnValue(csv);

      const result = parser.parseFile('/fake/file.csv');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.terms[0].sourceRow).toBe(3);
      expect(result.value.terms[1].sourceRow).toBe(4);
      expect(result.value.terms[2].sourceRow).toBe(5);
    });
  });
});
