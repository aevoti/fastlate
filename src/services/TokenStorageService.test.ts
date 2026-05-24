import { AUTH_TOKEN_SECRET_KEY, TokenStorageService } from './TokenStorageService';

function createSecrets() {
  return {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  };
}

describe('TokenStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the auth token from VSCode SecretStorage', async () => {
    const secrets = createSecrets();
    secrets.get.mockResolvedValue(' secret-token ');

    const result = await new TokenStorageService(secrets as never).getToken();

    expect(secrets.get).toHaveBeenCalledWith(AUTH_TOKEN_SECRET_KEY);
    expect(result).toEqual({
      token: 'secret-token',
    });
  });

  it('returns undefined when no token exists in SecretStorage', async () => {
    const secrets = createSecrets();
    secrets.get.mockResolvedValue(undefined);

    const result = await new TokenStorageService(secrets as never).getToken();

    expect(secrets.store).not.toHaveBeenCalled();
    expect(result).toEqual({ token: undefined });
  });

  it('stores and deletes the auth token through SecretStorage', async () => {
    const secrets = createSecrets();
    const service = new TokenStorageService(secrets as never);

    await service.storeToken(' new-token ');
    await service.deleteToken();

    expect(secrets.store).toHaveBeenCalledWith(AUTH_TOKEN_SECRET_KEY, 'new-token');
    expect(secrets.delete).toHaveBeenCalledWith(AUTH_TOKEN_SECRET_KEY);
  });

  it('reflects token deletion immediately even if SecretStorage still returns the old value', async () => {
    const secrets = createSecrets();
    secrets.get.mockResolvedValue('old-token');
    const service = new TokenStorageService(secrets as never);

    await expect(service.hasToken()).resolves.toBe(true);

    await service.deleteToken();

    await expect(service.hasToken()).resolves.toBe(false);
    await expect(service.getToken()).resolves.toEqual({ token: undefined });
  });

  it('reflects token storage immediately even if SecretStorage reads are stale', async () => {
    const secrets = createSecrets();
    secrets.get.mockResolvedValue(undefined);
    const service = new TokenStorageService(secrets as never);

    await service.storeToken('fresh-token');

    await expect(service.hasToken()).resolves.toBe(true);
    await expect(service.getToken()).resolves.toEqual({ token: 'fresh-token' });
  });

  it('reports missing token when SecretStorage is empty', async () => {
    const secrets = createSecrets();
    secrets.get.mockResolvedValue(undefined);

    await expect(new TokenStorageService(secrets as never).hasToken()).resolves.toBe(false);

    expect(secrets.store).not.toHaveBeenCalled();
  });
});
