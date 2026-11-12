export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertFound<T>(value: T | null | undefined, code = 'NOT_FOUND', message = 'Data tidak ditemukan.'): T {
  if (value === null || value === undefined) throw new AppError(404, code, message);
  return value;
}
