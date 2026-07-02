# Requirements Document

## Introduction

A extensão Fastlate importa traduções de arquivos CSV para o Weblate. Alguns CSVs contêm colunas de metadados ("Local" e "Seção") que não representam idiomas e devem ser ignoradas durante o parsing. Esta feature faz o parser reconhecer e excluir essas colunas, e exibe quais colunas foram ignoradas na interface (preview panel e resumo final), com suporte completo a i18n (en/pt-BR).

## Glossary

- **CsvParser**: Componente responsável por ler e interpretar arquivos CSV semicolonados, extraindo cabeçalhos de idioma e termos de tradução.
- **Ignored_Column**: Coluna do CSV cujo header (linha 1) corresponde a um dos nomes pré-definidos ("Local", "Seção") e que é excluída do processamento de idiomas.
- **PreviewPanel**: Painel WebView do VSCode que exibe uma tabela com os termos parseados antes da importação e apresenta o resumo final.
- **ImportSummary**: Mensagem final exibida após a importação com contadores de termos processados, criados, editados e com erro.
- **i18n_Module**: Módulo `src/i18n.ts` que fornece traduções para todas as strings voltadas ao usuário via a função `t()`.

## Requirements

### Requirement 1: Exclusão de colunas ignoradas durante o parsing

**User Story:** As a translator, I want the CSV parser to automatically skip columns named "Local" and "Seção", so that metadata columns are not treated as language columns during import.

#### Acceptance Criteria

1. WHEN the CsvParser encounters a column whose row-1 header value matches "Local" after trimming leading and trailing whitespace and using case-insensitive comparison, THE CsvParser SHALL exclude that column from the resulting LanguageHeader list and SHALL omit the corresponding TermValue entry from all Term.values arrays.
2. WHEN the CsvParser encounters a column whose row-1 header value matches "Seção" after trimming leading and trailing whitespace and using case-insensitive comparison, THE CsvParser SHALL exclude that column from the resulting LanguageHeader list and SHALL omit the corresponding TermValue entry from all Term.values arrays.
3. WHEN ignored columns are detected, THE CsvParser SHALL return the list of ignored column names in the ParseResult as an ignoredColumns string array containing the original trimmed header values from row 1 in the order they appeared in the CSV.
4. WHEN no columns match the ignored list, THE CsvParser SHALL return an empty ignoredColumns array in the ParseResult.
5. THE CsvParser SHALL compare column header names against the ignored list using case-insensitive matching after trimming leading and trailing whitespace from the header value.
6. IF all non-key columns match the ignored list and no language columns remain after exclusion, THEN THE CsvParser SHALL return an error of kind 'missing_language_header'.

### Requirement 2: Exibição de colunas ignoradas no Preview Panel

**User Story:** As a translator, I want to see which columns were ignored below the import summary, so that I can confirm the correct columns were skipped.

#### Acceptance Criteria

1. WHEN the ParseResult contains one or more ignored column names, THE PreviewPanel SHALL display a section labeled "Ignored columns" (when locale is en) or "Colunas ignoradas" (when locale is pt-BR) below the import status area.
2. WHEN the ParseResult contains one or more ignored column names, THE PreviewPanel SHALL list each ignored column name as a separate text item within the ignored-columns section, in the same order they appear in the ParseResult ignored columns array.
3. WHEN the ParseResult contains an empty ignored columns list (zero items), THE PreviewPanel SHALL not render the ignored-columns section or any heading for it.
4. WHEN the ignored-columns section is displayed, THE PreviewPanel SHALL escape all column name characters that are special in HTML (ampersand, less-than, greater-than, double-quote, single-quote) before rendering them, preventing markup injection.
5. WHEN the ignored-columns section is displayed, THE PreviewPanel SHALL render the section with a maximum of 50 column names visible; IF the ignored columns count exceeds 50, THEN THE PreviewPanel SHALL display the first 50 names followed by a text indicator showing the remaining count.

### Requirement 3: Exibição de colunas ignoradas no resumo final

**User Story:** As a translator, I want to see the ignored columns in the final import summary message, so that I have a complete record of what was processed and what was skipped.

#### Acceptance Criteria

1. WHEN ignored columns exist, THE ImportSummary message SHALL append a line break followed by the label from i18n key `summary.ignoredColumns` and then the ignored column names separated by comma-space (", "), after the existing summary counters and after any failed-keys text.
2. IF no ignored columns exist, THEN THE ImportSummary message SHALL produce the same output as the current `summary.done` format with no additional text for ignored columns.
3. WHEN ignored columns exist, THE ImportSummary message SHALL preserve the original column names exactly as they appeared in row 1 of the CSV (preserving original casing and whitespace trimming applied by the CsvParser).
4. WHEN multiple ignored columns exist, THE ImportSummary message SHALL list them in the same left-to-right order they appeared in the CSV file.

### Requirement 4: Suporte i18n para as novas strings

**User Story:** As a translator using the extension in Portuguese or English, I want all new user-facing text related to ignored columns to appear in my configured language, so that the interface remains consistent.

#### Acceptance Criteria

1. THE i18n_Module SHALL contain an English translation for the "ignored columns" label with key `summary.ignoredColumns` whose value is "Ignored columns".
2. THE i18n_Module SHALL contain a Portuguese (pt-BR) translation for the "ignored columns" label with key `summary.ignoredColumns` whose value is "Colunas ignoradas".
3. THE i18n_Module SHALL provide parameterized message support so that the ignored column names can be interpolated into the displayed text using the existing `{paramName}` placeholder pattern.
