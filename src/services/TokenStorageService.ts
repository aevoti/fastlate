import * as vscode from 'vscode';

export const AUTH_TOKEN_SECRET_KEY = 'fastlate.authToken';

export type StoredTokenResult = {
  token: string | undefined;
};

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export class TokenStorageService {
  private tokenOverride: string | undefined;
  private hasTokenOverride = false;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getToken(): Promise<StoredTokenResult> {
    if (this.hasTokenOverride) {
      return { token: this.tokenOverride };
    }

    const secretToken = await this.secrets.get(AUTH_TOKEN_SECRET_KEY);

    if (typeof secretToken === 'string' && !isBlank(secretToken)) {
      return { token: secretToken.trim() };
    }

    return { token: undefined };
  }

  async hasToken(): Promise<boolean> {
    if (this.hasTokenOverride) {
      return !isBlank(this.tokenOverride);
    }

    const secretToken = await this.secrets.get(AUTH_TOKEN_SECRET_KEY);
    if (typeof secretToken === 'string' && !isBlank(secretToken)) {
      return true;
    }

    return false;
  }

  async storeToken(token: string): Promise<void> {
    const trimmedToken = token.trim();
    await this.secrets.store(AUTH_TOKEN_SECRET_KEY, trimmedToken);
    this.tokenOverride = trimmedToken;
    this.hasTokenOverride = true;
  }

  async deleteToken(): Promise<void> {
    await this.secrets.delete(AUTH_TOKEN_SECRET_KEY);
    this.tokenOverride = undefined;
    this.hasTokenOverride = true;
  }
}
