export class HttpError extends Error {
  statusCode: number;
  code: string;
  retryAfterSeconds?: number;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { retryAfterSeconds?: number }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}
