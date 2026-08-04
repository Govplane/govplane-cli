/**
 * Process exit codes shared by every Govplane CLI command.
 *
 * The numeric values are part of the CLI's public contract: automation and CI
 * pipelines depend on them, so they must never be reordered.
 *
 * `Compatibility` (4) is command-scoped by design:
 *   - `validate` uses it for unsupported schema/compatibility errors.
 *   - `inspect`  uses it for signature verification failures.
 */
export const ExitCode = {
  Success: 0,
  Failure: 1,
  FileError: 2,
  InvalidArguments: 3,
  Compatibility: 4,
  InternalError: 5,
  /**
   * Runtime Kit commands: a command-specific conflict, such as a duplicate
   * policy key. Shares the numeric slot the basic CLI uses for internal errors,
   * because the toolkit reports those as `ToolkitInternalError` instead.
   */
  Conflict: 5,
  /** Runtime Kit commands: a write, report or versioning failure. */
  WriteError: 6,
  /** Runtime Kit commands: the runtime engine failed to evaluate. */
  RuntimeEvaluationError: 6,
  /** Reserved for Runtime Kit commands: the kit is not installed or not active. */
  RuntimeKitUnavailable: 7,
  /** Runtime Kit commands: unexpected internal error. The basic CLI uses 5. */
  ToolkitInternalError: 8,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
