import { window } from 'vscode';
import { FastlateLogger } from './FastlateLogger';

// The vscode mock is mapped via jest.config.ts moduleNameMapper.
// `window.createOutputChannel` returns a mock with appendLine/show/dispose.

describe('FastlateLogger', () => {
  let appendLine: jest.Mock;
  let show: jest.Mock;
  let dispose: jest.Mock;
  let logger: FastlateLogger;

  beforeEach(() => {
    appendLine = jest.fn();
    show = jest.fn();
    dispose = jest.fn();

    (window.createOutputChannel as jest.Mock).mockReturnValue({
      appendLine,
      show,
      dispose,
    });

    logger = new FastlateLogger();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  it('creates an output channel named "Fastlate"', () => {
    expect(window.createOutputChannel).toHaveBeenCalledWith('Fastlate');
  });

  // -------------------------------------------------------------------------
  // Log format helpers
  // -------------------------------------------------------------------------

  /** Extracts the log line written to appendLine. */
  function lastLine(): string {
    return appendLine.mock.calls[appendLine.mock.calls.length - 1][0] as string;
  }

  /** Matches the timestamp prefix `[YYYY-MM-DD HH:MM:SS]`. */
  const TIMESTAMP_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;

  // -------------------------------------------------------------------------
  // info()
  // -------------------------------------------------------------------------

  it('info() writes a line with [INFO] prefix and the message', () => {
    logger.info('server started');

    expect(appendLine).toHaveBeenCalledTimes(1);
    const line = lastLine();
    expect(line).toMatch(TIMESTAMP_RE);
    expect(line).toContain('[INFO]');
    expect(line).toContain('server started');
  });

  it('info() line matches the full format [timestamp] [INFO] message', () => {
    logger.info('hello');
    expect(lastLine()).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[INFO\] hello$/);
  });

  // -------------------------------------------------------------------------
  // warn()
  // -------------------------------------------------------------------------

  it('warn() writes a line with [WARN] prefix and the message', () => {
    logger.warn('missing value');

    expect(appendLine).toHaveBeenCalledTimes(1);
    const line = lastLine();
    expect(line).toMatch(TIMESTAMP_RE);
    expect(line).toContain('[WARN]');
    expect(line).toContain('missing value');
  });

  it('warn() line matches the full format [timestamp] [WARN] message', () => {
    logger.warn('oops');
    expect(lastLine()).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[WARN\] oops$/);
  });

  // -------------------------------------------------------------------------
  // error()
  // -------------------------------------------------------------------------

  it('error() writes a line with [ERROR] prefix and the message', () => {
    logger.error('connection refused');

    expect(appendLine).toHaveBeenCalledTimes(1);
    const line = lastLine();
    expect(line).toMatch(TIMESTAMP_RE);
    expect(line).toContain('[ERROR]');
    expect(line).toContain('connection refused');
  });

  it('error() line matches the full format [timestamp] [ERROR] message', () => {
    logger.error('boom');
    expect(lastLine()).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[ERROR\] boom$/);
  });

  // -------------------------------------------------------------------------
  // show() / dispose()
  // -------------------------------------------------------------------------

  it('show() delegates to the output channel show()', () => {
    logger.show();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('dispose() delegates to the output channel dispose()', () => {
    logger.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // ParserLogger interface compatibility
  // -------------------------------------------------------------------------

  it('satisfies the ParserLogger interface (has warn method)', () => {
    // Structural check: FastlateLogger can be used wherever ParserLogger is expected.
    const parserLogger: { warn(msg: string): void } = logger;
    parserLogger.warn('Row 5: skipping — key is empty.');
    expect(appendLine).toHaveBeenCalledTimes(1);
    expect(lastLine()).toContain('[WARN]');
    expect(lastLine()).toContain('Row 5: skipping — key is empty.');
  });

  // -------------------------------------------------------------------------
  // Multiple calls
  // -------------------------------------------------------------------------

  it('each log call appends a separate line', () => {
    logger.info('first');
    logger.warn('second');
    logger.error('third');

    expect(appendLine).toHaveBeenCalledTimes(3);
  });
});
