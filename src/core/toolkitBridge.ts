import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTextFile } from './files.js';
import { parseJson } from './json.js';
import type { CommandDefinition } from '../commands/types.js';

/** Package that provides the Runtime Kit commands when it is installed. */
export const TOOLKIT_PACKAGE = '@govplane/toolkit';

const isCommandDefinition = (value: unknown): value is CommandDefinition => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string'
    && typeof candidate.run === 'function'
    && Array.isArray(candidate.options);
};

/**
 * Loads the Runtime Kit's commands, if the kit is installed alongside the CLI.
 *
 * The specifier is held in a variable on purpose: the basic CLI must not declare
 * a dependency on the toolkit — that would invert the relationship and drag the
 * advanced tooling into every install — so the module is resolved by name at
 * runtime and its absence is a normal, silent outcome.
 *
 * Anything that does not look like a command list is ignored rather than
 * trusted, so a broken or mismatched kit degrades to the basic CLI instead of
 * crashing it.
 */
export interface LoadedToolkit {
  commands: CommandDefinition[];
  /** Version reported by the toolkit, when it exposes one. */
  version: string | null;
  /**
   * Why the kit did not load, when something went wrong.
   *
   * A kit that is simply absent is the normal case and leaves this `null`. It is
   * set when the kit was found and could not be used — a broken install, an
   * unresolvable dependency, or a symlinked development checkout Node cannot
   * resolve from. Without it the CLI tells a user with the kit installed to
   * install the kit, which is the least helpful thing it could say.
   */
  failure: string | null;
  /**
   * Why resolution failed, when the kit simply was not found.
   *
   * Not an error — an absent kit is normal. Surfaced under `--verbose` so that
   * someone who *has* installed it has a thread to pull.
   */
  resolutionDetail?: string | null;
}

const EMPTY: LoadedToolkit = { commands: [], version: null, failure: null };

/**
 * Where the kit might be, when a bare import cannot find it.
 *
 * Node resolves imports from a module's *real* path. When this CLI is installed
 * from a local directory — `npm link`, or `npm install -g ./path`, which npm
 * implements as a symlink — that real path is the working copy, so the global
 * package directory never appears on the search path and a kit sitting right
 * beside us is invisible.
 *
 * `process.argv[1]` is not resolved that way: it is the path the launcher was
 * invoked through, which is where npm actually put it. npm installs binaries at
 * `<prefix>/bin` and packages at `<prefix>/lib/node_modules` on POSIX, and both
 * at `<prefix>` on Windows, so the launcher's own location pins the package
 * directory that goes with it.
 */
const candidateRoots = (): string[] => {
  const launcher = process.argv[1];
  if (typeof launcher !== 'string' || launcher === '') {
    return [];
  }

  const binDirectory = dirname(launcher);
  return [
    join(dirname(binDirectory), 'lib', 'node_modules'),
    join(binDirectory, 'node_modules'),
  ];
};

/**
 * Reads a package's ESM entry point from its manifest.
 *
 * Only the two shapes this CLI's own packages use are honoured. Guessing at
 * `dist/index.js` would work today and break the first time a package is
 * restructured.
 */
const entryPoint = (packageDirectory: string): string | null => {
  const manifestPath = join(packageDirectory, 'package.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  const parsed = parseJson(readTextFile(manifestPath));
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
    return null;
  }

  const manifest = parsed.value as Record<string, unknown>;
  const exported = manifest.exports as Record<string, unknown> | undefined;
  const root = exported?.['.'] as Record<string, unknown> | undefined;

  const relative = (typeof root?.import === 'string' ? root.import : undefined)
    ?? (typeof manifest.main === 'string' ? manifest.main : undefined);

  if (relative === undefined) {
    return null;
  }

  const resolved = join(packageDirectory, relative);
  return existsSync(resolved) ? resolved : null;
};

/**
 * Second attempt at loading the kit, next to the launcher.
 *
 * Returns `null` when there is nothing there — which is the ordinary case for a
 * CLI installed without the kit, and must stay silent.
 */
const importFromLauncher = async (): Promise<unknown | null> => {
  const segments = TOOLKIT_PACKAGE.split('/');

  for (const root of candidateRoots()) {
    const entry = entryPoint(join(root, ...segments));
    if (entry !== null) {
      // Sequential on purpose: the first root that has the kit wins, and there
      // are at most two.
       
      return await import(pathToFileURL(entry).href) as unknown;
    }
  }

  return null;
};


/** Interprets whatever the kit's module exported. */
const readModule = (loaded: unknown): LoadedToolkit => {
  if (typeof loaded !== 'object' || loaded === null) {
    return { ...EMPTY, failure: `${TOOLKIT_PACKAGE} did not export a module object.` };
  }

  const module = loaded as Record<string, unknown>;
  const exported = module.commands;
  if (!Array.isArray(exported)) {
    return { ...EMPTY, failure: `${TOOLKIT_PACKAGE} did not export a "commands" array.` };
  }

  return {
    commands: exported.filter(isCommandDefinition),
    version: typeof module.toolkitVersion === 'string' ? module.toolkitVersion : null,
    failure: null,
  };
};

export const loadToolkit = async (): Promise<LoadedToolkit> => {
  const specifier = TOOLKIT_PACKAGE;

  try {
    return readModule(await import(specifier));
  } catch (error) {
    const { code } = (error as { code?: string });

    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
      return {
        ...EMPTY,
        failure: `${TOOLKIT_PACKAGE} is installed but could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    // Node could not resolve it by name. Look beside the launcher before
    // concluding it is absent — see `candidateRoots`.
    try {
      const beside = await importFromLauncher();
      if (beside !== null) {
        return readModule(beside);
      }
    } catch (secondary) {
      return {
        ...EMPTY,
        failure: `${TOOLKIT_PACKAGE} was found next to the launcher but could not be `
          + `loaded: ${secondary instanceof Error ? secondary.message : String(secondary)}`,
      };
    }

    // Genuinely not installed. This is the ordinary outcome for a CLI without
    // the kit, and must stay silent.
    return {
      ...EMPTY,
      resolutionDetail: error instanceof Error ? error.message : String(error),
    };
  }
};

export const loadToolkitCommands = async (): Promise<CommandDefinition[]> => (
  (await loadToolkit()).commands
);
