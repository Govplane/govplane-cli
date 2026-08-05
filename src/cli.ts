import { rootOptions } from './args/options.js';
import { parseArgv, readBoolean, readString } from './args/parser.js';
import type { OptionSpec, ParsedOptions } from './args/types.js';
import {
  allOptionSpecs, commandNames, commands, findCommandIn, mergeCommands,
} from './commands/registry.js';
import { renderCommandHelp, renderGeneralHelp, suggestCommand } from './commands/helpText.js';
import type { CommandDefinition } from './commands/types.js';
import { systemClock, type Clock } from './core/clock.js';
import { isSupportedNodeVersion, unsupportedNodeMessage } from './core/environment.js';
import { CliError, invalidArguments, isCliError } from './core/errors.js';
import { ExitCode, type ExitCodeValue } from './core/exitCodes.js';
import { detectToolkit, type ResolvedToolkit } from './core/toolkit.js';
import { loadToolkit } from './core/toolkitBridge.js';
import { supportsColor } from './core/color.js';
import {
  Reporter, type OutputFormat, type ReadableLike, type WritableLike,
} from './core/reporter.js';

export interface CliStreams {
  stdout: WritableLike & { isTTY?: boolean };
  stderr: WritableLike & { isTTY?: boolean };
  /**
   * Input for commands that prompt. Optional because almost no command needs
   * it, and a command that prompts must check `isTTY` before assuming a person
   * is there to answer.
   */
  stdin?: ReadableLike;
}

export interface RunOptions {
  streams?: CliStreams;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Overrides the time source, so time-dependent output can be pinned in tests. */
  now?: Clock;
  /**
   * Commands contributed by the CLI Toolkit. The `govplane` launcher discovers
   * them with `loadToolkit()`; the toolkit's own launcher and the test suite
   * pass them directly.
   */
  extraCommands?: CommandDefinition[];
  /**
   * Kit presence for this invocation. Supplied by whoever loaded the toolkit,
   * since a loaded toolkit is better evidence than a manifest on disk.
   */
  toolkit?: ResolvedToolkit;
}

/** Options accepted by every command, regardless of its own option list. */
const UNIVERSAL_OPTIONS = new Set(['help', 'quiet', 'verbose']);

const mergeSpecs = (...groups: OptionSpec[][]): OptionSpec[] => {
  const seen = new Map<string, OptionSpec>();
  groups.flat().forEach((option) => {
    if (!seen.has(option.name)) {
      seen.set(option.name, option);
    }
  });
  return [...seen.values()];
};

/**
 * Finds the command name in argv, before any option is interpreted.
 *
 * Only the root options are understood at this point, because they are the ones
 * that may legitimately appear before the command; their values are skipped so
 * that `govplane -w build validate` does not mistake the folder for a command.
 * Everything else is scanned for the first token that names a known command.
 */
const findCommandName = (
  argv: string[],
  available: CommandDefinition[],
): string | undefined => {
  const names = new Set(available.map((command) => command.name));
  const rootValueOptions = new Set(
    rootOptions.filter((option) => option.type === 'string').flatMap(
      (option) => [`--${option.name}`, ...(option.alias === undefined ? [] : [`-${option.alias}`])],
    ),
  );

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;

    if (token === '--') {
      return undefined;
    }
    if (rootValueOptions.has(token)) {
      index += 1;
    } else if (!token.startsWith('-') && names.has(token)) {
      return token;
    }
  }

  return undefined;
};

/**
 * Parses argv, pointing an argument error at the command that was being run.
 *
 * Options are scoped to the resolved command, so one belonging to a different
 * command is simply unknown here. Naming the command turns "unknown option"
 * into something the reader can act on.
 */
const parseWithCommandContext = (
  argv: string[],
  specs: OptionSpec[],
  command: CommandDefinition | undefined,
): ReturnType<typeof parseArgv> => {
  try {
    return parseArgv(argv, specs);
  } catch (error) {
    if (command === undefined || !isCliError(error)) {
      throw error;
    }
    throw new CliError(`${error.message} (running "govplane ${command.name}")`, {
      code: error.code,
      exitCode: error.exitCode,
      details: [
        '',
        'See the supported options with:',
        `  govplane help ${command.name}`,
      ],
    });
  }
};

const assertOptionsAllowed = (command: CommandDefinition, options: ParsedOptions): void => {
  const allowed = new Set(command.options.map((option) => option.name));
  Object.keys(options).forEach((name) => {
    if (!allowed.has(name) && !UNIVERSAL_OPTIONS.has(name)) {
      throw invalidArguments(
        `Option --${name} is not supported by "govplane ${command.name}".`,
        ['', 'See the supported options with:', `  govplane help ${command.name}`],
      );
    }
  });
};

const printInstallKitGuidance = (
  reporter: Reporter,
  env: NodeJS.ProcessEnv,
  kit: ResolvedToolkit,
): ExitCodeValue => {
  if (kit.installed) {
    reporter.line(
      `Govplane CLI Toolkit is already installed (${kit.version ?? 'unknown version'}).`,
    );
    reporter.line();
    reporter.line('Activate it — free, and only needs an email address:');
    reporter.line('  govplane activate');
    reporter.line();
    reporter.line('Check the current status with:');
    reporter.line('  govplane license');
    return ExitCode.Success;
  }

  reporter.debug(`Kit manifest looked for at: ${detectToolkit(env).manifestPath}`);

  reporter.line('The Govplane CLI Toolkit is free and runs locally.');
  reporter.line();
  reporter.line('Install it with:');
  reporter.line('  npm install --global @govplane/toolkit');
  reporter.line();
  reporter.line('The basic CLI commands — validate, inspect, version, help and working-folder —');
  reporter.line('never require the CLI Toolkit, an account or network access.');
  return ExitCode.Success;
};

const reportError = (reporter: Reporter, error: unknown): ExitCodeValue => {
  if (isCliError(error)) {
    reporter.error(`${reporter.failure('Error:')} ${error.message}`);
    reporter.errorLines(error.details);
    // The stable code closes the message, so a log or a CI job can match on
    // something that will not change when the wording is improved.
    reporter.error('');
    reporter.error(reporter.muted(error.code));
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  reporter.error(`${reporter.failure('Unexpected error:')} ${message}`);
  if (reporter.verbose && error instanceof Error && error.stack !== undefined) {
    reporter.error(error.stack);
  } else {
    reporter.error('Run the command again with --verbose for more detail.');
  }
  return ExitCode.InternalError;
};

/**
 * Parses argv, resolves the command and runs it.
 *
 * Returns the process exit code instead of calling `process.exit`, so the CLI
 * can also be driven programmatically and from tests.
 */
export const run = async (argv: string[], options: RunOptions = {}): Promise<number> => {
  const streams: CliStreams = options.streams
    ?? { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin };
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const now = options.now ?? systemClock;
  const toolkit: ResolvedToolkit = options.toolkit
    ?? ((): ResolvedToolkit => {
      const detected = detectToolkit(env);
      return { installed: detected.installed, version: detected.version };
    })();

  // A reporter with defaults, used until the real options are known.
  let reporter = new Reporter({
    stdout: streams.stdout,
    stderr: streams.stderr,
    color: supportsColor({ isTty: streams.stdout.isTTY === true, env }),
  });

  if (!isSupportedNodeVersion()) {
    reporter.error(unsupportedNodeMessage());
    return ExitCode.Compatibility;
  }

  try {
    const available = mergeCommands(commands, options.extraCommands ?? []);

    // The command is identified before parsing, so options are interpreted with
    // that command's own specs. Two commands may legitimately give the same
    // name different meanings — `--context` lists context fields for `inspect`
    // and carries a JSON payload for `simulate` — and a merged option table
    // would silently apply whichever was registered first.
    const known = findCommandName(argv, available);
    const resolved = known === undefined ? undefined : findCommandIn(available, known);
    // With no recognised command — none given, or a typo — fall back to the
    // union so that argv still parses well enough to report the problem.
    const specs = mergeSpecs(rootOptions, resolved?.options ?? allOptionSpecs(available));
    const parsed = parseWithCommandContext(argv, specs, resolved);

    const format = (readString(parsed.options, 'format') ?? 'text') as OutputFormat;
    reporter = new Reporter({
      stdout: streams.stdout,
      stderr: streams.stderr,
      format,
      quiet: readBoolean(parsed.options, 'quiet'),
      verbose: readBoolean(parsed.options, 'verbose'),
      color: format === 'text' && supportsColor({ isTty: streams.stdout.isTTY === true, env }),
    });

    if (readBoolean(parsed.options, 'install-kit')) {
      return printInstallKitGuidance(reporter, env, toolkit);
    }

    const name = known ?? parsed.positionals[0];
    const commandIndex = name === undefined ? -1 : parsed.positionals.indexOf(name);
    const rest = commandIndex === -1
      ? parsed.positionals
      : parsed.positionals.slice(commandIndex + 1);

    if (name === undefined) {
      if (readBoolean(parsed.options, 'version')) {
        const version = findCommandIn(available, 'version') as CommandDefinition;
        return await version.run({
          positionals: [],
          options: parsed.options,
          cwd,
          env,
          reporter,
          now,
          commands: available,
          toolkit,
        });
      }
      renderGeneralHelp(reporter, available);
      return ExitCode.Success;
    }

    const command = resolved ?? findCommandIn(available, name);
    if (command === undefined) {
      const suggestion = suggestCommand(name, commandNames(available));
      throw new CliError(`Unknown command: ${name}`, {
        code: 'UNKNOWN_COMMAND',
        exitCode: ExitCode.InvalidArguments,
        details: [
          ...(suggestion === null ? [] : ['', 'Did you mean?', `  ${suggestion}`]),
          '',
          'Run:',
          '  govplane help',
        ],
      });
    }

    if (readBoolean(parsed.options, 'help')) {
      renderCommandHelp(reporter, command);
      return ExitCode.Success;
    }

    assertOptionsAllowed(command, parsed.options);

    return await command.run({
      positionals: rest,
      options: parsed.options,
      cwd,
      env,
      reporter,
      now,
      commands: available,
      toolkit,
      ...(streams.stdin === undefined ? {} : { stdin: streams.stdin }),
    });
  } catch (error) {
    return reportError(reporter, error);
  }
};

/**
 * Entry point used by `bin/govplane.js`.
 *
 * This is where the CLI Toolkit is discovered: when the toolkit is installed
 * alongside the CLI its commands take over the built-in placeholders, and when
 * it is not, the basic CLI behaves exactly as before.
 */
export const main = async (argv: string[]): Promise<number> => {
  // Named `loaded` rather than `toolkit` so it does not read as the `toolkit`
  // option it feeds: one is the bridge's load result, the other the resolved
  // availability the commands see.
  const loaded = await loadToolkit();
  return run(argv, {
    extraCommands: loaded.commands,
    ...(loaded.commands.length > 0
      ? { toolkit: { installed: true, version: loaded.version } }
      : {
        toolkit: {
          installed: false,
          version: null,
          failure: loaded.failure,
          resolutionDetail: loaded.resolutionDetail,
        },
      }),
  });
};
