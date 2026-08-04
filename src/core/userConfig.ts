import { existsSync } from 'node:fs';
import { atomicWriteFile, readTextFile } from './files.js';
import { parseJson, stringifyJson } from './json.js';
import { userConfigPath } from './paths.js';

export const USER_CONFIG_SCHEMA_VERSION = 1;

export interface UserConfig {
  schemaVersion: number;
  /** Persisted default working folder, stored as an absolute path. */
  workingFolder?: string;
}

const EMPTY_CONFIG: UserConfig = { schemaVersion: USER_CONFIG_SCHEMA_VERSION };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

/**
 * Reads the user-level CLI configuration.
 *
 * A missing or unreadable file is not an error: the CLI simply falls back to
 * its defaults, because persisted settings are a convenience, never a
 * requirement.
 */
export const readUserConfig = (env?: NodeJS.ProcessEnv): UserConfig => {
  const path = userConfigPath(env);
  if (!existsSync(path)) {
    return { ...EMPTY_CONFIG };
  }

  let parsed;
  try {
    parsed = parseJson(readTextFile(path));
  } catch {
    return { ...EMPTY_CONFIG };
  }

  if (!parsed.ok || !isRecord(parsed.value)) {
    return { ...EMPTY_CONFIG };
  }

  const {workingFolder} = parsed.value;
  const {schemaVersion} = parsed.value;

  return {
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : USER_CONFIG_SCHEMA_VERSION,
    ...(typeof workingFolder === 'string' ? { workingFolder } : {}),
  };
};

export const writeUserConfig = (config: UserConfig, env?: NodeJS.ProcessEnv): string => {
  const path = userConfigPath(env);
  atomicWriteFile(path, stringifyJson(config));
  return path;
};

export const setPersistedWorkingFolder = (folder: string, env?: NodeJS.ProcessEnv): string => {
  const current = readUserConfig(env);
  return writeUserConfig({ ...current, workingFolder: folder }, env);
};

/** Returns `true` when a persisted working folder was actually removed. */
export const clearPersistedWorkingFolder = (env?: NodeJS.ProcessEnv): boolean => {
  const current = readUserConfig(env);
  if (current.workingFolder === undefined) {
    return false;
  }

  writeUserConfig({ schemaVersion: current.schemaVersion }, env);
  return true;
};
