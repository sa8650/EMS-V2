/**
 * An error whose message is safe to show to the user. `status` follows HTTP
 * semantics so route handlers can reuse it; server actions show the message.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** Per-field messages for forms (field name → message). */
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(`${what} not found.`, 404);
export const forbidden = (message = 'You do not have permission to do that.') => new AppError(message, 403);
