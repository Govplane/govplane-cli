import { existsSync } from 'node:fs';
import { readTextFile } from './files.js';
import { parseJson } from './json.js';
import { toolkitManifestPath } from './paths.js';

export interface ToolkitStatus {
  installed: boolean;
  version: string | null;
  manifestPath: string;
}

/** Kit presence as resolved for a single invocation. */
export interface ResolvedToolkit {
  /** Set when the kit is present but could not be loaded. */
  failure?: string | null;
  /** Why resolution failed, shown under --verbose. */
  resolutionDetail?: string | null;
  installed: boolean;
  version: string | null;
}

/**
 * Reports whether the Govplane CLI Toolkit (the free advanced toolkit) is
 * installed locally.
 *
 * Detection is a local filesystem lookup only — the basic CLI never contacts
 * Govplane infrastructure to answer this question, and never triggers an
 * installation as a side effect.
 */
export const detectToolkit = (env?: NodeJS.ProcessEnv): ToolkitStatus => {
  const manifestPath = toolkitManifestPath(env);

  if (!existsSync(manifestPath)) {
    return { installed: false, version: null, manifestPath };
  }

  try {
    const parsed = parseJson(readTextFile(manifestPath));
    if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
      return { installed: false, version: null, manifestPath };
    }
    const {version} = (parsed.value as Record<string, unknown>);
    return {
      installed: true,
      version: typeof version === 'string' ? version : null,
      manifestPath,
    };
  } catch {
    return { installed: false, version: null, manifestPath };
  }
};

/**
 * Message shown when a CLI Toolkit command is invoked without the kit.
 *
 * `failure` is set when the kit is present but unusable. Telling somebody who
 * has installed it to install it wastes their afternoon, so when we know better
 * we say so.
 */
export const toolkitRequiredMessage = (
  command: string,
  failure?: string | null,
): string[] => {
  if (failure) {
    return [
      `The ${command} command requires the Govplane CLI Toolkit, which is installed`,
      'but could not be loaded.',
      '',
      failure,
      '',
      'Run the kit directly in the meantime:',
      `  govplane-toolkit ${command}`,
    ];
  }

  return [
    `The ${command} command requires the Govplane CLI Toolkit.`,
    '',
    'The CLI Toolkit is free and runs locally.',
    '',
    'Install it with:',
    '  govplane --install-kit',
    '',
    // The CLI looks for the kit by name and then beside its own launcher, which
    // covers every ordinary layout including linked development checkouts. If
    // it still is not found in an unusual one, --verbose says why and the kit
    // ships its own launcher.
    'If it is installed, run the command again with --verbose to see why it',
    `could not be loaded, or run it directly: govplane-toolkit ${command}`,
  ];
};
