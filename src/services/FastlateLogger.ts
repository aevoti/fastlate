import * as vscode from 'vscode';
import type { ParserLogger } from '../parser/CsvParser';

/**
 * Logger for the Fastlate extension.
 *
 * Writes timestamped, level-prefixed messages to the dedicated "Fastlate"
 * Output Channel in the VSCode Output panel.
 *
 * Implements `ParserLogger` so it can be passed directly to `CsvParser`.
 *
 * Log format: `[YYYY-MM-DD HH:MM:SS] [LEVEL] message`
 *
 * Requirements: 3.3, 3.4, 6.4, 7.2
 */
export class FastlateLogger implements ParserLogger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Fastlate');
  }

  // ---------------------------------------------------------------------------
  // Public logging methods
  // ---------------------------------------------------------------------------

  /** Logs an informational message. */
  info(message: string): void {
    this.channel.appendLine(`${this.timestamp()} [INFO] ${message}`);
  }

  /** Logs a warning message. */
  warn(message: string): void {
    this.channel.appendLine(`${this.timestamp()} [WARN] ${message}`);
  }

  /** Logs an error message. */
  error(message: string): void {
    this.channel.appendLine(`${this.timestamp()} [ERROR] ${message}`);
  }

  // ---------------------------------------------------------------------------
  // Channel management
  // ---------------------------------------------------------------------------

  /** Reveals the Output Channel in the VSCode UI. */
  show(): void {
    this.channel.show();
  }

  /** Disposes the Output Channel, releasing its resources. */
  dispose(): void {
    this.channel.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the current local date/time formatted as `YYYY-MM-DD HH:MM:SS`.
   */
  private timestamp(): string {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    return `[${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}]`;
  }
}
