/**
 * Services throw ApiError instead of returning HTTP responses — same
 * {code, message} payload as the FastAPI contract. The app catches it and
 * shows `code`/`message` however it likes.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function apiError(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
