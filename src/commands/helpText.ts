import type { OptionSpec } from '../args/types.js';
import type { Reporter } from '../core/reporter.js';
import type { CommandDefinition, CommandGroup } from './types.js';

const NAME_COLUMN = 18;
const OPTION_COLUMN = 30;

const pad = (value: string, width: number): string => (
  value.length >= width ? `${value}  ` : value.padEnd(width, ' ')
);

export const formatOptionFlags = (option: OptionSpec): string => {
  const alias = option.alias === undefined ? '    ' : `-${option.alias}, `;
  const placeholder = option.placeholder === undefined ? '' : ` ${option.placeholder}`;
  return `${alias}--${option.name}${placeholder}`;
};

const groupOf = (command: CommandDefinition): CommandGroup => {
  if (command.group !== undefined) {
    return command.group;
  }
  if (command.name === 'working-folder') {
    return 'working-folder';
  }
  return command.requiresToolkit ? 'toolkit' : 'basic';
};

const SECTION_TITLES: Record<CommandGroup, string> = {
  basic: 'Basic commands:',
  'working-folder': 'Working folder:',
  activation: 'Activation:',
  'toolkit': 'CLI Toolkit commands:',
};

const SECTION_ORDER: CommandGroup[] = ['basic', 'working-folder', 'activation', 'toolkit'];

/** Renders `govplane help`. */
export const renderGeneralHelp = (
  reporter: Reporter,
  commands: CommandDefinition[],
): void => {
  reporter.line(reporter.heading('Govplane CLI'));
  reporter.line();
  reporter.line('Usage:');
  reporter.line('  govplane <command> [options]');

  SECTION_ORDER.forEach((group) => {
    const section = commands.filter((command) => groupOf(command) === group);
    if (section.length === 0) {
      return;
    }

    reporter.line();
    reporter.line(SECTION_TITLES[group]);
    section.forEach((command) => {
      reporter.line(`  ${pad(command.name, NAME_COLUMN)}${command.summary}`);
    });

    if (group === 'toolkit') {
      reporter.line();
      reporter.line(reporter.muted(
        '  CLI Toolkit required. The CLI Toolkit is free and runs locally.',
      ));
    }
  });

  reporter.line();
  reporter.line('Global options:');
  reporter.line(
    '  -w, --working-folder <path>   Directory Govplane reads and writes project files in',
  );
  reporter.line('      --config <path>           Configuration file to use');
  reporter.line('      --format <text|json>      Output format');
  reporter.line('      --quiet                   Suppress non-essential output');
  reporter.line('      --verbose                 Display additional diagnostic information');
  reporter.line('  -h, --help                    Display help');
  reporter.line('  -v, --version                 Display the CLI version');
  reporter.line();
  reporter.line('Examples:');
  reporter.line('  govplane validate ./policy-bundle.json');
  reporter.line('  govplane inspect --policies');
  reporter.line('  govplane working-folder set ./governance');
  reporter.line();
  reporter.line('Run "govplane help <command>" for command documentation.');
};

/** Renders `govplane help <command>` and `govplane <command> --help`. */
export const renderCommandHelp = (reporter: Reporter, command: CommandDefinition): void => {
  reporter.line(command.description ?? command.summary);
  reporter.line();
  reporter.line('Usage:');
  reporter.line(`  ${command.usage}`);

  if (command.requiresToolkit) {
    reporter.line();
    reporter.line('CLI Toolkit required.');
  }

  if (command.subcommands !== undefined && command.subcommands.length > 0) {
    reporter.line();
    reporter.line('Subcommands:');
    command.subcommands.forEach((subcommand) => {
      reporter.line(`  ${pad(subcommand.name, NAME_COLUMN)}${subcommand.summary}`);
    });
  }

  if (command.arguments !== undefined && command.arguments.length > 0) {
    reporter.line();
    reporter.line('Arguments:');
    command.arguments.forEach((argument) => {
      reporter.line(`  ${pad(argument.name, NAME_COLUMN)}${argument.description}`);
    });
  }

  if (command.options.length > 0) {
    reporter.line();
    reporter.line('Options:');
    command.options.forEach((option) => {
      reporter.line(`  ${pad(formatOptionFlags(option), OPTION_COLUMN)}${option.description}`);
    });
  }

  if (command.examples !== undefined && command.examples.length > 0) {
    reporter.line();
    reporter.line('Examples:');
    command.examples.forEach((example) => reporter.line(`  ${example}`));
  }
};

const editDistance = (left: string, right: string): number => {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances: number[][] = Array.from(
    { length: rows },
    () => new Array<number>(columns).fill(0),
  );

  for (let row = 0; row < rows; row += 1) {
    (distances[row] as number[])[0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    (distances[0] as number[])[column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      (distances[row] as number[])[column] = Math.min(
        (distances[row - 1] as number[])[column] as number + 1,
        (distances[row] as number[])[column - 1] as number + 1,
        (distances[row - 1] as number[])[column - 1] as number + cost,
      );
    }
  }

  return (distances[rows - 1] as number[])[columns - 1] as number;
};

/** Suggests the closest known command name for a typo, when one is close enough. */
export const suggestCommand = (input: string, candidates: string[]): string | null => {
  const threshold = Math.max(2, Math.floor(input.length / 3));
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(input, candidate) }))
    .filter((entry) => entry.distance <= threshold)
    .sort((left, right) => left.distance - right.distance);

  return ranked.length > 0 ? (ranked[0] as { candidate: string }).candidate : null;
};
