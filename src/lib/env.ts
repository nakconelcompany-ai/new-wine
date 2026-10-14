function need(name: string, minLength = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLength) {
    throw new HttpError(503, 'The server is not fully configured yet. Please contact the administrator.', `Missing or too-short env var ${name}`);
  }
  return v;
}

export class HttpError extends Error {
  status: number;
  publicMessage: string;
  extra?: Record<string, unknown>;
  constructor(status: number, publicMessage: string, internal?: string, extra?: Record<string, unknown>) {
    super(internal ?? publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
    this.extra = extra;
  }
}

export const env = {
  get databaseUrl() { return need('DATABASE_URL'); },
  get adminEmail() { return need('ADMIN_EMAIL').trim().toLowerCase(); },
  get adminPasswordHash() { return need('ADMIN_PASSWORD_HASH'); },
  get sessionSecret() { return need('ADMIN_SESSION_SECRET', 32); },
  get votePepper() { return need('VOTE_CODE_PEPPER', 32); },
};
