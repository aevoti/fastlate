import { ImportJob } from './ImportJob';
import { AuthenticationError } from '../types/errors';
import type {
  Term,
  WeblateConfiguration,
  TermEditResult,
} from '../types/index';
import type { FastlateLogger } from '../services/FastlateLogger';

const mockClient = {
  findTermId: jest.fn<Promise<number | null>, [string]>(),
  listTermIds: jest.fn<Promise<Map<string, number>>, []>(),
  editTerm: jest.fn<Promise<TermEditResult>, [number, string]>(),
};

jest.mock('../http/WeblateHttpClient', () => ({
  WeblateHttpClient: jest.fn(() => mockClient),
}));

const config: WeblateConfiguration = {
  serverUrl: 'https://weblate.example.com',
  authToken: 'secret-token',
  project: 'project-slug',
  component: 'component-slug',
  defaultLanguage: 'pt_BR',
};

const terms: Term[] = [
  { key: 'button.save', value: 'Salvar', sourceRow: 3 },
  { key: 'button.cancel', value: 'Cancelar', sourceRow: 4 },
  { key: 'button.ok', value: 'OK', sourceRow: 5 },
];

function createLogger(): jest.Mocked<Pick<FastlateLogger, 'info' | 'warn' | 'error'>> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createProgress(): { report: jest.Mock } {
  return { report: jest.fn() };
}

function createCancellationToken(isCancellationRequested = false): { isCancellationRequested: boolean } {
  return { isCancellationRequested };
}

function runJob(options: {
  inputTerms?: Term[];
  cancellationToken?: { isCancellationRequested: boolean };
  progress?: { report: jest.Mock };
  logger?: jest.Mocked<Pick<FastlateLogger, 'info' | 'warn' | 'error'>>;
} = {}) {
  const job = new ImportJob();
  return job.run({
    config,
    languageCode: 'pt',
    terms: options.inputTerms ?? terms,
    cancellationToken: options.cancellationToken as never ?? createCancellationToken() as never,
    progress: options.progress as never ?? createProgress() as never,
    logger: options.logger as never ?? createLogger() as never,
  });
}

describe('ImportJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.findTermId
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(102)
      .mockResolvedValueOnce(103);
  });

  it('looks up each term by key and edits all found terms', async () => {
    mockClient.editTerm.mockResolvedValue({ kind: 'success' });

    const progress = createProgress();
    const summary = await runJob({ progress });

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 3,
      errors: 0,
      failedKeys: [],
    });
    expect(mockClient.listTermIds).not.toHaveBeenCalled();
    expect(mockClient.findTermId).toHaveBeenCalledTimes(3);
    expect(mockClient.findTermId).toHaveBeenNthCalledWith(1, 'button.save');
    expect(mockClient.findTermId).toHaveBeenNthCalledWith(2, 'button.cancel');
    expect(mockClient.findTermId).toHaveBeenNthCalledWith(3, 'button.ok');
    expect(mockClient.editTerm).toHaveBeenCalledTimes(3);
    expect(progress.report).toHaveBeenCalledTimes(3);
  });

  it('edits existing terms and reports onlyEdited = N', async () => {
    mockClient.findTermId
      .mockReset()
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202)
      .mockResolvedValueOnce(203);
    mockClient.editTerm.mockResolvedValue({ kind: 'success' });

    const summary = await runJob();

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 3,
      errors: 0,
      failedKeys: [],
    });
    expect(mockClient.listTermIds).not.toHaveBeenCalled();
    expect(mockClient.findTermId).toHaveBeenCalledTimes(3);
    expect(mockClient.editTerm).toHaveBeenCalledTimes(3);
  });

  it('uses looked up unit ids when editing terms without creating', async () => {
    mockClient.findTermId
      .mockReset()
      .mockResolvedValueOnce(301)
      .mockResolvedValueOnce(302)
      .mockResolvedValueOnce(303);
    mockClient.editTerm.mockResolvedValue({ kind: 'success' });

    const job = new ImportJob();
    const summary = await job.run({
      config,
      languageCode: 'en',
      terms,
      cancellationToken: createCancellationToken() as never,
      progress: createProgress() as never,
      logger: createLogger() as never,
    });

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 3,
      errors: 0,
      failedKeys: [],
    });
    expect(mockClient.listTermIds).not.toHaveBeenCalled();
    expect(mockClient.findTermId).toHaveBeenCalledTimes(3);
    expect(mockClient.editTerm).toHaveBeenCalledTimes(3);
  });

  it('counts missing unit ids and continues with the next term', async () => {
    mockClient.findTermId
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(102)
      .mockResolvedValueOnce(103);
    mockClient.editTerm.mockResolvedValue({ kind: 'success' });

    const logger = createLogger();
    const summary = await runJob({ logger });

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 2,
      errors: 1,
      failedKeys: ['button.save'],
    });
    expect(mockClient.findTermId).toHaveBeenCalledTimes(3);
    expect(mockClient.editTerm).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('interrupts immediately on authentication errors', async () => {
    mockClient.editTerm
      .mockResolvedValueOnce({ kind: 'success' })
      .mockResolvedValueOnce({ kind: 'auth_error' });

    const progress = createProgress();
    await expect(runJob({ progress })).rejects.toBeInstanceOf(AuthenticationError);

    expect(mockClient.editTerm).toHaveBeenCalledTimes(2);
    expect(progress.report).toHaveBeenCalledTimes(1);
  });

  it('returns a partial summary when cancelled before the next term', async () => {
    const cancellationToken = createCancellationToken(false);
    mockClient.editTerm.mockImplementation(async () => {
      cancellationToken.isCancellationRequested = true;
      return { kind: 'success' };
    });

    const summary = await runJob({ cancellationToken });

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 1,
      errors: 0,
      failedKeys: [],
    });
    expect(mockClient.editTerm).toHaveBeenCalledTimes(1);
  });

  it('does not load unit ids when cancelled before processing starts', async () => {
    const summary = await runJob({ cancellationToken: createCancellationToken(true) });

    expect(summary).toEqual({
      total: 3,
      created: 0,
      onlyEdited: 0,
      errors: 0,
      failedKeys: [],
    });
    expect(mockClient.findTermId).not.toHaveBeenCalled();
    expect(mockClient.listTermIds).not.toHaveBeenCalled();
    expect(mockClient.editTerm).not.toHaveBeenCalled();
  });

  it('reports progress after each processed term', async () => {
    mockClient.editTerm.mockResolvedValue({ kind: 'success' });

    const progress = createProgress();
    await runJob({ progress });

    expect(progress.report).toHaveBeenNthCalledWith(1, {
      message: '1/3 terms processed',
      increment: 100 / 3,
    });
    expect(progress.report).toHaveBeenNthCalledWith(2, {
      message: '2/3 terms processed',
      increment: 100 / 3,
    });
    expect(progress.report).toHaveBeenNthCalledWith(3, {
      message: '3/3 terms processed',
      increment: 100 / 3,
    });
  });
});
