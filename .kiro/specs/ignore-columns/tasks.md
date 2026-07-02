# Implementation Plan: Ignore Columns

## Overview

Extend the Fastlate CSV parser to recognize and skip metadata columns ("Local" and "Seção"), surface ignored column names in the PreviewPanel and ImportSummary, and add i18n support for en/pt-BR. Implementation uses TypeScript with fast-check for property-based tests and Jest as the test runner.

## Tasks

- [x] 1. Extend types and add i18n keys
  - [x] 1.1 Add `ignoredColumns` field to ParseResult interface
    - Add `ignoredColumns: string[]` to `ParseResult` in `src/types/index.ts`
    - Add JSDoc comment: "Column names from row 1 that were recognized as metadata and excluded."
    - _Requirements: 1.3, 1.4_

  - [x] 1.2 Add i18n keys for ignored columns
    - Add `'preview.ignoredColumns'` and `'summary.ignoredColumns'` to the `MessageKey` union type in `src/i18n.ts`
    - Add English translations: `'preview.ignoredColumns': 'Ignored columns'` and `'summary.ignoredColumns': 'Ignored columns'`
    - Add Portuguese translations: `'preview.ignoredColumns': 'Colunas ignoradas'` and `'summary.ignoredColumns': 'Colunas ignoradas'`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Implement CsvParser column filtering
  - [x] 2.1 Add ignored column detection and filtering to CsvParser
    - Define `const IGNORED_COLUMN_NAMES: readonly string[] = ['local', 'seção']` at module level in `src/parser/CsvParser.ts`
    - In `parseFile()`, after the header extraction loop: for each column from `languageStartColumn`, check if `header.trim().toLowerCase()` matches an entry in `IGNORED_COLUMN_NAMES`
    - Track matched columns in an `ignoredColumns: string[]` array (storing the original trimmed header value) and a `ignoredIndices: Set<number>` for positional exclusion
    - Exclude matched columns from `languageHeaders` array
    - When building `Term.values` arrays, skip indices in `ignoredIndices`
    - Return `ignoredColumns` in the `ParseResult` (empty array when no matches)
    - If all non-key columns are ignored and `languageHeaders` is empty, return `{ kind: 'missing_language_header' }` error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 Write property test: ignored columns excluded from output (Property 1)
    - **Property 1: Ignored columns are excluded from parsing output**
    - Create `src/parser/CsvParser.ignore-columns.property.test.ts`
    - Generate CSVs with random ignored columns (varied casing/whitespace/position) among valid language columns
    - Verify `ParseResult.languageHeaders` does not contain headers for ignored columns and `Term.values` omits their positions
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 1.1, 1.2, 1.5**

  - [x] 2.3 Write property test: ignoredColumns array correctness (Property 2)
    - **Property 2: ignoredColumns array contains correct names in CSV order**
    - Add to `src/parser/CsvParser.ignore-columns.property.test.ts`
    - Generate CSVs with N columns where some are ignored and at least one valid language column remains
    - Verify `ParseResult.ignoredColumns` contains exactly the original trimmed header values in left-to-right CSV order; empty when none match
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 1.3, 1.4**

- [x] 3. Checkpoint - Ensure parser tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update PreviewPanel to display ignored columns
  - [x] 4.1 Add ignored-columns section rendering to PreviewPanel
    - In `src/ui/PreviewPanel.ts`, update `_buildHtml()` to accept or read `ignoredColumns` from the `ParseResult`
    - Store `ignoredColumns` alongside `languageHeaders` and `terms` in the class state
    - After the `#import-status` div, conditionally render an ignored-columns section when `ignoredColumns.length > 0`
    - Section heading uses `t('preview.ignoredColumns')`
    - List each column name as a separate `<li>` element, escaped via `_escapeHtml()`
    - If `ignoredColumns.length > 50`, render only the first 50 and append a "+N more" text indicator (where N = `ignoredColumns.length - 50`)
    - Do NOT render the section at all when `ignoredColumns` is empty
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Write property test: ignored-columns section renders correctly (Property 3)
    - **Property 3: Ignored-columns section renders with correct content when present**
    - Create `src/ui/PreviewPanel.ignore-columns.property.test.ts`
    - Generate random `ParseResult` objects with 1–50 ignored column names
    - Verify HTML contains the localized heading and all names in correct order
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.3 Write property test: section absent when empty (Property 4)
    - **Property 4: Ignored-columns section is absent when list is empty**
    - Add to `src/ui/PreviewPanel.ignore-columns.property.test.ts`
    - Generate `ParseResult` with empty `ignoredColumns`
    - Verify HTML does NOT contain the ignored-columns section heading or any related markup
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 2.3**

  - [x] 4.4 Write property test: HTML escaping in column names (Property 5)
    - **Property 5: HTML special characters in column names are escaped**
    - Add to `src/ui/PreviewPanel.ignore-columns.property.test.ts`
    - Generate column names containing HTML special characters (& < > " ')
    - Verify rendered HTML contains only escaped equivalents (&amp; &lt; &gt; &quot; &#39;) and never raw special characters within data content
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 2.4**

  - [x] 4.5 Write property test: truncation at 50 (Property 6)
    - **Property 6: Truncation at 50 with remaining count indicator**
    - Add to `src/ui/PreviewPanel.ignore-columns.property.test.ts`
    - Generate arrays of 1–100 column names
    - Verify: arrays ≤ 50 render all names without indicator; arrays > 50 render exactly first 50 names plus "+N more" text
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 2.5**

- [x] 5. Checkpoint - Ensure PreviewPanel tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update ImportSummary message builder
  - [x] 6.1 Extend `buildSummaryMessage` to include ignored columns
    - In `src/extension.ts`, modify `buildSummaryMessage()` to accept an optional `ignoredColumns: string[]` parameter
    - When `ignoredColumns` is non-empty, append `'\n' + t('summary.ignoredColumns') + ': ' + ignoredColumns.join(', ')` to the summary message
    - When `ignoredColumns` is empty or undefined, produce the standard `summary.done` message unchanged
    - Update the call site in `runImportCommand()` to pass `parseResult.value.ignoredColumns` to `buildSummaryMessage()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.2 Write property test: summary message format (Property 7)
    - **Property 7: Summary message correctly includes or omits ignored columns line**
    - Create `src/job/ImportSummary.ignore-columns.property.test.ts`
    - Generate random `ImportSummary` objects and `ignoredColumns` arrays
    - Verify: when non-empty, summary ends with newline + i18n label + column names joined by ", " in original order; when empty, summary is identical to standard `summary.done` format
    - Config: `{ numRuns: 100, verbose: true }`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Jest 29.7.0 with fast-check ^4.8.0 for property-based testing
- All property test files follow the naming convention `<Component>.<aspect>.property.test.ts`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "6.2"] }
  ]
}
```
