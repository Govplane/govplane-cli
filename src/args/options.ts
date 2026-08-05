import type { OptionSpec } from './types.js';

export const workingFolderOption: OptionSpec = {
  name: 'working-folder',
  alias: 'w',
  type: 'string',
  placeholder: '<path>',
  description: 'Directory Govplane reads and writes project files in',
};

export const configOption: OptionSpec = {
  name: 'config',
  type: 'string',
  placeholder: '<path>',
  description: 'Configuration file to use instead of govplane.config.json',
};

export const formatOption: OptionSpec = {
  name: 'format',
  type: 'string',
  placeholder: '<format>',
  choices: ['text', 'json'],
  description: 'Output format: text or json',
};

export const quietOption: OptionSpec = {
  name: 'quiet',
  type: 'boolean',
  description: 'Suppress non-essential output',
};

export const verboseOption: OptionSpec = {
  name: 'verbose',
  type: 'boolean',
  description: 'Display additional diagnostic information',
};

export const helpOption: OptionSpec = {
  name: 'help',
  alias: 'h',
  type: 'boolean',
  description: 'Display command help',
};

export const versionOption: OptionSpec = {
  name: 'version',
  alias: 'v',
  type: 'boolean',
  description: 'Display the CLI version',
};

export const installKitOption: OptionSpec = {
  name: 'install-kit',
  type: 'boolean',
  description: 'Show how to install the Govplane CLI Toolkit',
};

/** Options every command accepts, so behaviour and naming stay consistent. */
export const commonOptions: OptionSpec[] = [
  workingFolderOption,
  configOption,
  quietOption,
  verboseOption,
  helpOption,
];

/** Options the parser always recognises, wherever they appear in argv. */
export const rootOptions: OptionSpec[] = [
  workingFolderOption,
  configOption,
  formatOption,
  quietOption,
  verboseOption,
  helpOption,
  versionOption,
  installKitOption,
];
