import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { commonOptions, formatOption } from '../args/options.js';
import { readBoolean, readString } from '../args/parser.js';
import { fileTimestamp } from '../core/clock.js';
import { CliError, fileError, invalidArguments } from '../core/errors.js';
import { ExitCode, type ExitCodeValue } from '../core/exitCodes.js';
import {
  atomicWriteFile, backupFile, ensureDirectory, isDirectory,
} from '../core/files.js';
import { stringifyJson } from '../core/json.js';
import { CONFIG_FILE_NAME, DEFAULT_DRAFT_FILE } from '../core/projectConfig.js';
import { projectStatePath } from '../core/paths.js';
import type { Reporter } from '../core/reporter.js';
import {
  clearPersistedWorkingFolder, readUserConfig, setPersistedWorkingFolder,
} from '../core/userConfig.js';
import {
  assertUsableWorkingFolder, resolvePath, resolveWorkingFolder, WORKING_FOLDER_SOURCE_LABEL,
} from '../core/workingFolder.js';
import type { CommandContext, CommandDefinition } from './types.js';

const SUBCOMMANDS = ['set', 'reset', 'init'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const INITIAL_CONFIG = {
  schemaVersion: 1,
  draft: { path: DEFAULT_DRAFT_FILE },
  bundle: { path: 'policy-bundle.json' },
};

const initialDraft = (generatedAt: string) => ({
  schemaVersion: '1.0',
  generatedAt,
  policies: [],
});

const showWorkingFolder = (context: CommandContext): ExitCodeValue => {
  const { reporter } = context;
  const resolved = resolveWorkingFolder({
    flag: readString(context.options, 'working-folder'),
    env: context.env,
    persisted: readUserConfig(context.env).workingFolder,
    cwd: context.cwd,
  });

  if (reporter.format === 'json') {
    reporter.json({
      workingFolder: resolved.path,
      source: resolved.source,
      sourceLabel: WORKING_FOLDER_SOURCE_LABEL[resolved.source],
      exists: isDirectory(resolved.path),
    });
    return ExitCode.Success;
  }

  if (reporter.verbose) {
    reporter.line('Working folder:');
    reporter.line(`  ${resolved.path}`);
    reporter.line();
    reporter.line('Source:');
    reporter.line(`  ${WORKING_FOLDER_SOURCE_LABEL[resolved.source]}`);
  } else {
    reporter.line(resolved.path);
  }

  return ExitCode.Success;
};

const setWorkingFolder = (context: CommandContext): ExitCodeValue => {
  const { reporter } = context;
  const target = context.positionals[1];

  if (target === undefined) {
    throw invalidArguments('A path is required.', [
      '',
      'Usage:',
      '  govplane working-folder set <path> [--create]',
    ]);
  }

  const resolved = resolvePath(target, context.cwd);
  const create = readBoolean(context.options, 'create');

  if (!existsSync(resolved)) {
    if (!create) {
      throw fileError('Working folder does not exist.', 'WORKING_FOLDER_NOT_FOUND', [
        '',
        'Path:',
        `  ${resolved}`,
        '',
        'Create it automatically with:',
        '  govplane working-folder set <path> --create',
      ]);
    }
    ensureDirectory(resolved);
    reporter.debug(`Created directory: ${resolved}`);
  }

  assertUsableWorkingFolder(resolved);
  const configPath = setPersistedWorkingFolder(resolved, context.env);
  reporter.debug(`Configuration file: ${configPath}`);

  if (reporter.format === 'json') {
    reporter.json({ success: true, workingFolder: resolved, configFile: configPath });
    return ExitCode.Success;
  }

  reporter.line('Govplane working folder updated:');
  reporter.line();
  reporter.line(`  ${resolved}`);
  return ExitCode.Success;
};

const resetWorkingFolder = (context: CommandContext): ExitCodeValue => {
  const { reporter } = context;
  const removed = clearPersistedWorkingFolder(context.env);

  if (reporter.format === 'json') {
    reporter.json({ success: true, removed });
    return ExitCode.Success;
  }

  if (removed) {
    reporter.line('Persisted working folder removed.');
  } else {
    reporter.line('No persisted working folder was configured.');
  }
  reporter.line();
  reporter.line('Govplane will use the current terminal directory by default.');
  return ExitCode.Success;
};

interface InitialisedFile {
  path: string;
  action: 'created' | 'skipped' | 'replaced';
  backup?: string;
}

const writeInitialFile = (
  path: string,
  content: string,
  force: boolean,
  timestamp: string,
): InitialisedFile => {
  if (!existsSync(path)) {
    atomicWriteFile(path, content);
    return { path, action: 'created' };
  }

  if (!force) {
    return { path, action: 'skipped' };
  }

  const backup = backupFile(path, timestamp);
  atomicWriteFile(path, content);
  return { path, action: 'replaced', backup };
};

const printInitResult = (reporter: Reporter, files: InitialisedFile[]): void => {
  files.forEach((file) => {
    if (file.action === 'created') {
      reporter.line(`${reporter.success('created')}  ${file.path}`);
    } else if (file.action === 'replaced') {
      reporter.line(`${reporter.warning('replaced')} ${file.path}`);
      if (file.backup !== undefined) {
        reporter.line(`          backup: ${file.backup}`);
      }
    } else {
      reporter.line(`${reporter.muted('skipped')}  ${file.path}`);
    }
  });

  const skipped = files.filter((file) => file.action === 'skipped');
  if (skipped.length > 0) {
    reporter.line();
    skipped.forEach((file) => reporter.line(`${basename(file.path)} already exists.`));
    reporter.line();
    reporter.line('Use --force to replace generated files.');
  }
};

const initWorkingFolder = (context: CommandContext): ExitCodeValue => {
  const { reporter } = context;
  const resolved = resolveWorkingFolder({
    flag: readString(context.options, 'working-folder'),
    env: context.env,
    persisted: readUserConfig(context.env).workingFolder,
    cwd: context.cwd,
  });

  assertUsableWorkingFolder(resolved.path, { requireWritable: true });

  const force = readBoolean(context.options, 'force');
  const startedAt = context.now();
  const timestamp = fileTimestamp(startedAt);

  const files: InitialisedFile[] = [
    writeInitialFile(
      join(resolved.path, CONFIG_FILE_NAME),
      stringifyJson(INITIAL_CONFIG),
      force,
      timestamp,
    ),
    writeInitialFile(
      join(resolved.path, DEFAULT_DRAFT_FILE),
      stringifyJson(initialDraft(startedAt.toISOString())),
      force,
      timestamp,
    ),
  ];

  const stateDirectory = projectStatePath(resolved.path);
  ['cache', 'logs', 'temp'].forEach((child) => ensureDirectory(join(stateDirectory, child)));

  if (reporter.format === 'json') {
    reporter.json({
      success: true,
      workingFolder: resolved.path,
      stateDirectory,
      files: files.map((file) => ({
        path: file.path,
        action: file.action,
        ...(file.backup === undefined ? {} : { backup: file.backup }),
      })),
    });
    return ExitCode.Success;
  }

  reporter.line(`Initialising Govplane files in ${resolved.path}`);
  reporter.line();
  printInitResult(reporter, files);
  return ExitCode.Success;
};

const run = (context: CommandContext): ExitCodeValue => {
  const subcommand = context.positionals[0];

  if (subcommand === undefined) {
    return showWorkingFolder(context);
  }

  if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    throw new CliError(`Unknown working-folder subcommand: ${subcommand}`, {
      code: 'UNKNOWN_SUBCOMMAND',
      exitCode: ExitCode.InvalidArguments,
      details: ['', `Available subcommands: ${SUBCOMMANDS.join(', ')}`],
    });
  }

  const handlers: Record<Subcommand, (input: CommandContext) => ExitCodeValue> = {
    set: setWorkingFolder,
    reset: resetWorkingFolder,
    init: initWorkingFolder,
  };

  return handlers[subcommand as Subcommand](context);
};

export const workingFolderCommand: CommandDefinition = {
  name: 'working-folder',
  summary: 'Show or configure the working folder',
  usage: 'govplane working-folder [set <path> | reset | init] [options]',
  description: 'Show the resolved working folder, persist a default one, or initialise '
    + 'Govplane files inside it.',
  requiresRuntimeKit: false,
  subcommands: [
    { name: 'set', summary: 'Persist a default working folder' },
    { name: 'reset', summary: 'Remove the persisted working folder' },
    { name: 'init', summary: 'Create Govplane files in the working folder' },
  ],
  options: [
    {
      name: 'create',
      type: 'boolean',
      description: 'Create the directory when it is missing (set)',
    },
    { name: 'force', type: 'boolean', description: 'Replace existing generated files (init)' },
    formatOption,
    ...commonOptions,
  ],
  examples: [
    'govplane working-folder',
    'govplane working-folder --verbose',
    'govplane working-folder set ./governance --create',
    'govplane working-folder init',
    'govplane working-folder reset',
  ],
  run,
};
