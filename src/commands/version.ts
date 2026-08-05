import { formatOption, helpOption, verboseOption } from '../args/options.js';
import { readBoolean } from '../args/parser.js';
import { readCliVersion } from '../core/environment.js';
import { ExitCode, type ExitCodeValue } from '../core/exitCodes.js';
import { userConfigPath } from '../core/paths.js';
import { readUserConfig } from '../core/userConfig.js';
import { resolveWorkingFolder } from '../core/workingFolder.js';
import type { CommandContext, CommandDefinition } from './types.js';

const REGISTRY_URL = 'https://registry.npmjs.org/@govplane/cli/latest';
const UPDATE_CHECK_TIMEOUT_MS = 3000;

interface LatestVersion {
  version: string | null;
  error?: string;
}

/**
 * Explicit, opt-in update check.
 *
 * `govplane version` never contacts the network on its own; this only runs when
 * `--check` is supplied, and a failure is reported without breaking the command.
 */
const fetchLatestVersion = async (): Promise<LatestVersion> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(REGISTRY_URL, { signal: controller.signal });
    if (!response.ok) {
      return { version: null, error: `Registry responded with status ${response.status}.` };
    }
    const payload = (await response.json()) as { version?: unknown };
    return {
      version: typeof payload.version === 'string' ? payload.version : null,
      ...(typeof payload.version === 'string'
        ? {}
        : { error: 'Registry response had no version.' }),
    };
  } catch (error) {
    return {
      version: null,
      error: error instanceof Error ? error.message : 'Update check failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
};

const run = async (context: CommandContext): Promise<ExitCodeValue> => {
  const { reporter } = context;
  const cliVersion = readCliVersion();
  const {toolkit} = context;
  const check = readBoolean(context.options, 'check');
  const latest = check ? await fetchLatestVersion() : undefined;

  if (reporter.format === 'json') {
    reporter.json({
      cliVersion,
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      toolkit: { installed: toolkit.installed, version: toolkit.version },
      ...(latest
        ? {
          updateCheck: {
            latestVersion: latest.version,
            updateAvailable: latest.version !== null && latest.version !== cliVersion,
            ...(latest.error === undefined ? {} : { error: latest.error }),
          },
        }
        : {}),
    });
    return ExitCode.Success;
  }

  if (readBoolean(context.options, 'verbose')) {
    const workingFolder = resolveWorkingFolder({
      env: context.env,
      persisted: readUserConfig(context.env).workingFolder,
      cwd: context.cwd,
    });

    reporter.line(reporter.heading('Govplane CLI'));
    reporter.line();
    reporter.line('CLI version:');
    reporter.line(`  ${cliVersion}`);
    reporter.line();
    reporter.line('Node.js:');
    reporter.line(`  ${process.versions.node}`);
    reporter.line();
    reporter.line('Platform:');
    reporter.line(`  ${process.platform}-${process.arch}`);
    reporter.line();
    reporter.line('CLI Toolkit:');
    reporter.line(`  ${toolkit.installed ? toolkit.version ?? 'Installed' : 'Not installed'}`);
    reporter.line();
    reporter.line('Configuration:');
    reporter.line(`  ${userConfigPath(context.env)}`);
    reporter.line();
    reporter.line('Working folder:');
    reporter.line(`  ${workingFolder.path}`);
  } else {
    reporter.line(`Govplane CLI ${cliVersion}`);
  }

  if (latest !== undefined) {
    reporter.line();
    if (latest.version === null) {
      reporter.line(`Update check could not be completed: ${latest.error}`);
    } else if (latest.version === cliVersion) {
      reporter.line('You are running the latest version.');
    } else {
      reporter.line(`A newer version is available: ${latest.version}`);
      reporter.line();
      reporter.line('Update with:');
      reporter.line('  npm install --global @govplane/cli@latest');
    }
  }

  return ExitCode.Success;
};

export const versionCommand: CommandDefinition = {
  name: 'version',
  summary: 'Display CLI version information',
  usage: 'govplane version [options]',
  description: 'Display the installed Govplane CLI version and runtime information.',
  requiresToolkit: false,
  options: [
    verboseOption,
    formatOption,
    {
      name: 'check',
      type: 'boolean',
      description: 'Check npm for a newer CLI release (requires network access)',
    },
    helpOption,
  ],
  examples: [
    'govplane version',
    'govplane version --verbose',
    'govplane version --format json',
  ],
  run,
};
