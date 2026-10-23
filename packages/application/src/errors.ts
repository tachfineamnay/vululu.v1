export class ApplicationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function assertOwned<T>(value: T | null, code: string, message: string): T {
  if (value === null) {
    throw new ApplicationError(code, message, 404);
  }
  return value;
}
