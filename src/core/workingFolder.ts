import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileError } from './errors.js';

export const WORKING_FOLDER_ENV = 'GOVPLANE_WORKING_FOLDER';

export type WorkingFolderSource =
  | 'command-flag'
  | 'environment-variable'
  | 'persisted-configuration'
  | 'current-directory';

export const WORKING_FOLDER_SOURCE_LABEL: Record<WorkingFolderSource, string> = {
  'command-flag': 'Command flag',
  'environment-variable': `Environment variable (${WORKING_FOLDER_ENV})`,
  'persisted-configuration': 'Persisted CLI configuration',
  'current-directory': 'Current terminal directory',
};

export interface ResolvedWorkingFolder {
  path: string;
  source: WorkingFolderSource;
}

export interface WorkingFolderInput {
  flag?: string | undefined;
  env?: NodeJS.ProcessEnv;
  persisted?: string | undefined;
  cwd: string;
}

/** Resolves a possibly relative path against the terminal's current directory. */
export const resolvePath = (path: string, cwd: string): string => (
  isAbsolute(path) ? resolve(path) : resolve(cwd, path)
);

/**
 * Applies the documented working-folder precedence:
 *
 *   1. `--working-folder` / `-w`
 *   2. `GOVPLANE_WORKING_FOLDER`
 *   3. persisted CLI configuration
 *   4. the current terminal directory
 */
export const resolveWorkingFolder = (input: WorkingFolderInput): ResolvedWorkingFolder => {
  const env = input.env ?? process.env;

  if (input.flag !== undefined && input.flag.trim() !== '') {
    return { path: resolvePath(input.flag, input.cwd), source: 'command-flag' };
  }

  const fromEnv = env[WORKING_FOLDER_ENV];
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return { path: resolvePath(fromEnv, input.cwd), source: 'environment-variable' };
  }

  if (input.persisted !== undefined && input.persisted.trim() !== '') {
    return { path: resolvePath(input.persisted, input.cwd), source: 'persisted-configuration' };
  }

  return { path: resolve(input.cwd), source: 'current-directory' };
};

export interface WorkingFolderCheck {
  /** Commands that create or modify files must also be able to write. */
  requireWritable?: boolean;
}

/**
 * Verifies the working folder before a command touches anything, so that write
 * commands fail up front instead of half way through.
 */
export const assertUsableWorkingFolder = (
  folder: string,
  options: WorkingFolderCheck = {},
): void => {
  let stats;
  try {
    stats = statSync(folder);
  } catch {
    throw fileError('Working folder does not exist.', 'WORKING_FOLDER_NOT_FOUND', [
      '',
      'Path:',
      `  ${folder}`,
      '',
      'Create the directory or specify another path with:',
      '  govplane --working-folder <path>',
    ]);
  }

  if (!stats.isDirectory()) {
    throw fileError('Working folder is not a directory.', 'WORKING_FOLDER_NOT_A_DIRECTORY', [
      '',
      'Path:',
      `  ${folder}`,
    ]);
  }

  try {
    accessSync(folder, constants.R_OK);
  } catch {
    throw fileError('Working folder is not readable.', 'WORKING_FOLDER_NOT_READABLE', [
      '',
      'Path:',
      `  ${folder}`,
    ]);
  }

  if (options.requireWritable) {
    try {
      accessSync(folder, constants.W_OK);
    } catch {
      throw fileError('Working folder is not writable.', 'WORKING_FOLDER_NOT_WRITABLE', [
        '',
        'Path:',
        `  ${folder}`,
      ]);
    }
  }
};
