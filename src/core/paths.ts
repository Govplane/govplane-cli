import { homedir } from 'node:os';
import { join } from 'node:path';

export const GOVPLANE_DIRECTORY = '.govplane';

/**
 * Location of the user-level Govplane directory.
 *
 * `GOVPLANE_HOME` takes precedence so that automation — and the test suite —
 * can isolate CLI state without touching the real user profile.
 */
export const resolveGovplaneHome = (env: NodeJS.ProcessEnv = process.env): string => {
  const override = env.GOVPLANE_HOME;
  if (override !== undefined && override.trim() !== '') {
    return override;
  }
  return join(homedir(), GOVPLANE_DIRECTORY);
};

export const userConfigPath = (env?: NodeJS.ProcessEnv): string => (
  join(resolveGovplaneHome(env), 'config.json')
);

/** Manifest written by the Runtime Kit installer once the toolkit is activated. */
export const runtimeKitManifestPath = (env?: NodeJS.ProcessEnv): string => (
  join(resolveGovplaneHome(env), 'kit', 'kit.json')
);

/** Per-project scratch directory: `<working-folder>/.govplane`. */
export const projectStatePath = (workingFolder: string): string => (
  join(workingFolder, GOVPLANE_DIRECTORY)
);

export const projectTempPath = (workingFolder: string): string => (
  join(projectStatePath(workingFolder), 'temp')
);
