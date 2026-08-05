import { helpOption } from '../args/options.js';
import type { OptionSpec } from '../args/types.js';
import { CliError } from '../core/errors.js';
import { ExitCode, type ExitCodeValue } from '../core/exitCodes.js';
import { toolkitRequiredMessage } from '../core/toolkit.js';
import { renderCommandHelp, renderGeneralHelp } from './helpText.js';
import { inspectCommand } from './inspect.js';
import type { CommandContext, CommandDefinition } from './types.js';
import { validateCommand } from './validate.js';
import { versionCommand } from './version.js';
import { workingFolderCommand } from './workingFolder.js';

/**
 * Placeholder for a command provided by the Govplane CLI Toolkit.
 *
 * The basic CLI knows these commands exist so it can document them and explain
 * how to enable them, but it never installs anything on its own.
 */
const toolkitCommand = (
  name: string,
  summary: string,
  usage: string,
): CommandDefinition => ({
  name,
  summary,
  usage,
  description: `${summary}. Provided by the Govplane CLI Toolkit.`,
  requiresToolkit: true,
  options: [helpOption],
  run: (context: CommandContext): ExitCodeValue => {
    const kit = context.toolkit;
    if (!kit.installed) {
      context.reporter.errorLines(toolkitRequiredMessage(name, kit.failure));
      if (kit.resolutionDetail) {
        context.reporter.debug(`Resolution: ${kit.resolutionDetail}`);
      }
      return ExitCode.ToolkitUnavailable;
    }

    // The kit is installed but has not contributed this command, so it is not
    // implemented in the installed version. Saying "install the CLI Toolkit"
    // here would send the user in a circle.
    context.reporter.errorLines([
      `The installed CLI Toolkit (${kit.version ?? 'unknown version'}) does not provide `
        + `"${name}" yet.`,
      '',
      'Update it with:',
      '  npm install --global @govplane/toolkit@latest',
    ]);
    return ExitCode.ToolkitUnavailable;
  },
});

export const toolkitCommands: CommandDefinition[] = [
  toolkitCommand(
    'analyze',
    'Analyse the codebase for policy evaluation points',
    'govplane analyze [options]',
  ),
  toolkitCommand('build', 'Build a policy bundle from drafts', 'govplane build [options]'),
  toolkitCommand('sign', 'Sign a policy bundle', 'govplane sign [options]'),
  toolkitCommand(
    'simulate',
    'Simulate policy evaluations locally',
    'govplane simulate [options]',
  ),
  toolkitCommand(
    'policies',
    'Manage local policy drafts',
    'govplane policies <subcommand> [options]',
  ),
];

export function findCommandIn(
  list: CommandDefinition[],
  name: string,
): CommandDefinition | undefined {
  return list.find((command) => command.name === name);
}

/**
 * `help` documents the whole registry, including itself and any commands the
 * CLI Toolkit contributed, so it reads the resolved command list from the
 * invocation context rather than from module state.
 */
const helpCommand: CommandDefinition = {
  name: 'help',
  summary: 'Display CLI documentation',
  usage: 'govplane help [command]',
  description: 'Display Govplane CLI documentation. Works entirely offline.',
  requiresToolkit: false,
  arguments: [{ name: 'command', description: 'Command to document' }],
  options: [helpOption],
  examples: ['govplane help', 'govplane help validate'],
  run: (context: CommandContext): ExitCodeValue => {
    const requested = context.positionals[0];

    if (requested === undefined) {
      renderGeneralHelp(context.reporter, context.commands);
      return ExitCode.Success;
    }

    const command = findCommandIn(context.commands, requested);
    if (command === undefined) {
      throw new CliError(`Unknown command: ${requested}`, {
        code: 'UNKNOWN_COMMAND',
        exitCode: ExitCode.InvalidArguments,
        details: ['', 'Run:', '  govplane help'],
      });
    }

    renderCommandHelp(context.reporter, command);
    return ExitCode.Success;
  },
};

/** Every command the basic CLI ships, in the order help displays them. */
export const commands: CommandDefinition[] = [
  validateCommand,
  inspectCommand,
  versionCommand,
  helpCommand,
  workingFolderCommand,
  ...toolkitCommands,
];

export const commandNames = (list: CommandDefinition[] = commands): string[] => (
  list.map((command) => command.name)
);

export const findCommand = (name: string): CommandDefinition | undefined => (
  findCommandIn(commands, name)
);

/**
 * Merges commands contributed by the CLI Toolkit into the basic registry.
 *
 * A kit command replaces the built-in placeholder of the same name — that is how
 * `build` stops saying "requires the CLI Toolkit" and starts building. Genuinely
 * new commands, such as `activate`, are appended.
 */
export const mergeCommands = (
  base: CommandDefinition[],
  extra: CommandDefinition[],
): CommandDefinition[] => {
  const replaced = base.map((command) => findCommandIn(extra, command.name) ?? command);
  const names = new Set(replaced.map((command) => command.name));
  return [...replaced, ...extra.filter((command) => !names.has(command.name))];
};

/**
 * Union of every option the resolved command set understands.
 *
 * The parser needs to know which flags take values before it can tell which
 * token is the command name, so tokenisation uses the union and per-command
 * validation rejects options that do not belong to the resolved command.
 */
export const allOptionSpecs = (list: CommandDefinition[] = commands): OptionSpec[] => {
  const seen = new Map<string, OptionSpec>();
  list.forEach((command) => {
    command.options.forEach((option) => {
      if (!seen.has(option.name)) {
        seen.set(option.name, option);
      }
    });
  });
  return [...seen.values()];
};
