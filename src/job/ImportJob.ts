import * as vscode from 'vscode';
import type { Term, ImportSummary, WeblateConfiguration } from '../types/index';
import type { FastlateLogger } from '../services/FastlateLogger';
import { WeblateHttpClient } from '../http/WeblateHttpClient';
import { AuthenticationError } from '../types/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options passed to `ImportJob.run()`. */
export interface ImportJobOptions {
  /** Weblate connection configuration. */
  config: WeblateConfiguration;
  /** Target language code read from the spreadsheet Language_Header. */
  languageCode: string;
  /** List of terms to import. */
  terms: Term[];
  /** VSCode cancellation token — checked before each Term. */
  cancellationToken: vscode.CancellationToken;
  /** VSCode progress reporter — updated after each Term. */
  progress: vscode.Progress<{ message?: string; increment?: number }>;
  /** Logger for warnings and errors. */
  logger: FastlateLogger;
}

// ---------------------------------------------------------------------------
// ImportJob
// ---------------------------------------------------------------------------

/**
 * Orchestrates the sequential import of translation terms into Weblate.
 *
 * The job:
 *  1. Looks up each term by exact key in the target language
 *  2. PATCHes the term with the translation value when the unit exists
 *  3. Updates `vscode.Progress` after each Term
 *  4. Respects `cancellationToken` — checked before each Term
 *
 * Returns an `ImportSummary` with `total`, `created`, `onlyEdited`, `errors`.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.5
 */
export class ImportJob {
  /**
   * Runs the import job.
   *
   * @param options  Job configuration, terms, progress reporter, and logger.
   * @returns        Aggregated counts of created, onlyEdited, and error terms.
   * @throws         `AuthenticationError` if Weblate returns HTTP 401 or 403.
   */
  async run(options: ImportJobOptions): Promise<ImportSummary> {
    const {
      config,
      languageCode,
      terms,
      cancellationToken,
      progress,
      logger,
    } = options;
    const client = new WeblateHttpClient(config, languageCode);

    const summary: ImportSummary = {
      total: terms.length,
      created: 0,
      onlyEdited: 0,
      errors: 0,
      failedKeys: [],
    };

    const increment = terms.length > 0 ? 100 / terms.length : 0;
    if (cancellationToken.isCancellationRequested) {
      return summary;
    }

    for (let i = 0; i < terms.length; i++) {
      // Requirement 6.5: respect cancellation — check before each Term.
      if (cancellationToken.isCancellationRequested) {
        break;
      }

      const term = terms[i];

      const unitId = await client.findTermId(term.key);
      if (unitId === null) {
        logger.error(
          `[row ${term.sourceRow}] key="${term.key}": exact term not found in language "${languageCode}" — skipping edit`
        );
        summary.errors++;
        this.recordFailedKey(summary, term.key);
        this.reportProgress(progress, i + 1, terms.length, increment);
        continue;
      }

      // -----------------------------------------------------------------------
      // Step 6: Edit the term via PATCH
      // -----------------------------------------------------------------------
      const editResult = await client.editTerm(unitId, term.value);

      if (editResult.kind === 'success') {
        // Requirement 5.3: HTTP 200 → term imported successfully
        summary.onlyEdited++;
      } else if (editResult.kind === 'auth_error') {
        // Requirement 5.5: HTTP 401/403 during edit → abort immediately
        throw new AuthenticationError(401);
      } else if (editResult.kind === 'not_found') {
        // Requirement 5.4: HTTP 404 → log, count as error, continue
        logger.error(
          `[row ${term.sourceRow}] key="${term.key}": edit failed — unit ${unitId} not found (HTTP 404)`
        );
        summary.errors++;
        this.recordFailedKey(summary, term.key);
      } else {
        // Requirement 5.6: HTTP 400 or other unexpected status → log, count as error, continue
        logger.error(
          `[row ${term.sourceRow}] key="${term.key}": edit failed (HTTP ${editResult.statusCode}) — ${editResult.message}`
        );
        summary.errors++;
        this.recordFailedKey(summary, term.key);
      }

      // Requirement 6.2: update progress after all API steps for this Term
      this.reportProgress(progress, i + 1, terms.length, increment);
    }

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reports progress to the VSCode Progress indicator.
   *
   * @param progress   The VSCode progress reporter.
   * @param processed  Number of terms processed so far.
   * @param total      Total number of terms.
   * @param increment  Percentage increment per term.
   */
  private reportProgress(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    processed: number,
    total: number,
    increment: number
  ): void {
    progress.report({
      message: `${processed}/${total} terms processed`,
      increment,
    });
  }

  private recordFailedKey(summary: ImportSummary, key: string): void {
    if (!summary.failedKeys.includes(key)) {
      summary.failedKeys.push(key);
    }
  }
}
