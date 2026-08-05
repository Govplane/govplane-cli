import type { OptionSpec, ParsedOptions } from '../args/types.js';
import type { Clock } from '../core/clock.js';
import type { ExitCodeValue } from '../core/exitCodes.js';
import type { ReadableLike, Reporter } from '../core/reporter.js';
import type { ResolvedToolkit } from '../core/toolkit.js';

export interface CommandContext {
  /** Positional arguments that follow the command name. */
  positionals: string[];
  options: ParsedOptions;
  cwd: string;
  env: NodeJS.ProcessEnv;
  reporter: Reporter;
  /** Input for commands that prompt. Absent when nothing supplied one. */
  stdin?: ReadableLike;
  /** Injected time source; commands never call `new Date()` directly. */
  now: Clock;
  /**
   * The command set resolved for this invocation: the basic CLI plus anything
   * the CLI Toolkit contributed. `help` renders from this, so its output always
   * matches what the parser will accept.
   */
  commands: CommandDefinition[];
  /**
   * Whether the CLI Toolkit is available to this invocation. Resolved from the
   * loaded toolkit when there is one, and from the local manifest otherwise.
   */
  toolkit: ResolvedToolkit;
}

export interface CommandArgument {
  name: string;
  description: string;
}

/** Section a command appears under in `govplane help`. */
export type CommandGroup = 'basic' | 'working-folder' | 'activation' | 'toolkit';

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  description?: string;
  /** CLI Toolkit commands are listed in help but are not part of the basic CLI. */
  requiresToolkit: boolean;
  /** Defaults to `toolkit` when `requiresToolkit` is set, otherwise `basic`. */
  group?: CommandGroup;
  options: OptionSpec[];
  arguments?: CommandArgument[];
  examples?: string[];
  subcommands?: { name: string; summary: string }[];
  run(context: CommandContext): Promise<ExitCodeValue> | ExitCodeValue;
}
