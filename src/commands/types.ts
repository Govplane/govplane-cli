import type { OptionSpec, ParsedOptions } from '../args/types.js';
import type { Clock } from '../core/clock.js';
import type { ExitCodeValue } from '../core/exitCodes.js';
import type { ReadableLike, Reporter } from '../core/reporter.js';
import type { ResolvedRuntimeKit } from '../core/runtimeKit.js';

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
   * the Runtime Kit contributed. `help` renders from this, so its output always
   * matches what the parser will accept.
   */
  commands: CommandDefinition[];
  /**
   * Whether the Runtime Kit is available to this invocation. Resolved from the
   * loaded toolkit when there is one, and from the local manifest otherwise.
   */
  runtimeKit: ResolvedRuntimeKit;
}

export interface CommandArgument {
  name: string;
  description: string;
}

/** Section a command appears under in `govplane help`. */
export type CommandGroup = 'basic' | 'working-folder' | 'activation' | 'runtime-kit';

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  description?: string;
  /** Runtime Kit commands are listed in help but are not part of the basic CLI. */
  requiresRuntimeKit: boolean;
  /** Defaults to `runtime-kit` when `requiresRuntimeKit` is set, otherwise `basic`. */
  group?: CommandGroup;
  options: OptionSpec[];
  arguments?: CommandArgument[];
  examples?: string[];
  subcommands?: { name: string; summary: string }[];
  run(context: CommandContext): Promise<ExitCodeValue> | ExitCodeValue;
}
