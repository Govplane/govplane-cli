import { ExitCode, type ExitCodeValue } from './exitCodes.js';

export interface CliErrorOptions {
  /** Stable machine-readable code, e.g. `WORKING_FOLDER_NOT_FOUND`. */
  code: string;
  /** Process exit code to use when the error reaches the top level. */
  exitCode?: ExitCodeValue;
  /** Additional lines printed under the message (hints, paths, suggestions). */
  details?: string[];
  cause?: unknown;
}

/**
 * Error type used for every condition the CLI knows how to explain to a user.
 * Anything else bubbles up as an internal error.
 */
export class CliError extends Error {
  readonly code: string;

  readonly exitCode: ExitCodeValue;

  readonly details: string[];

  constructor(message: string, options: CliErrorOptions) {
    super(message);
    this.name = 'CliError';
    this.code = options.code;
    this.exitCode = options.exitCode ?? ExitCode.Failure;
    this.details = options.details ?? [];
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  /** Attaches the underlying failure while keeping the call site readable. */
  withCause(cause: unknown): this {
    this.cause = cause;
    return this;
  }
}

export const isCliError = (value: unknown): value is CliError => value instanceof CliError;

export const invalidArguments = (message: string, details?: string[]): CliError => new CliError(
  message,
  { code: 'INVALID_ARGUMENTS', exitCode: ExitCode.InvalidArguments, details },
);

export const fileError = (
  message: string,
  code: string,
  details?: string[],
): CliError => new CliError(message, { code, exitCode: ExitCode.FileError, details });
