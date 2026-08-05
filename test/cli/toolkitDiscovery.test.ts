import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { loadToolkit, TOOLKIT_PACKAGE } from '../../src/core/toolkitBridge.js';

/**
 * Finding the CLI Toolkit.
 *
 * The kit is resolved by name, which works for an ordinary `npm install -g`.
 * It does **not** work when either package is installed from a local directory:
 * npm makes those a symlink, and Node resolves imports from a module's real
 * path, so the global package directory never appears on the search path. The
 * kit sits right beside the CLI and is invisible.
 *
 * The fallback anchors on `process.argv[1]` — the path the launcher was invoked
 * through, which is where npm actually put it — and looks for the kit in the
 * package directory that belongs to it.
 */

interface Layout {
  root: string;
  /** The path a launcher would be invoked through. */
  launcher: string;
}

/** Builds an npm-shaped global prefix with a kit in it. */
const installKit = (options: { commands: string; version?: string }): Layout => {
  const root = mkdtempSync(join(tmpdir(), 'govplane-discovery-'));
  const packageDir = join(root, 'lib', 'node_modules', ...TOOLKIT_PACKAGE.split('/'));

  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });

  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: TOOLKIT_PACKAGE,
    version: options.version ?? '1.0.0',
    type: 'module',
    exports: { '.': { import: './dist/index.js' } },
  }));

  writeFileSync(join(packageDir, 'dist', 'index.js'), options.commands);

  const launcher = join(root, 'bin', 'govplane');
  writeFileSync(launcher, '#!/usr/bin/env node\n');

  return { root, launcher };
};

const A_COMMAND = `
export const toolkitVersion = '9.9.9';
export const commands = [{
  name: 'build',
  summary: 'Build a policy bundle',
  usage: 'govplane build',
  requiresToolkit: true,
  options: [],
  run: () => 0,
}];
`;

describe('loading the CLI Toolkit', () => {
  const originalArgv1 = process.argv[1];
  let layout: Layout | null = null;

  const useLauncher = (path: string | undefined): void => {
    if (path === undefined) {
      process.argv.splice(1, 1);
      return;
    }
    process.argv[1] = path;
  };

  beforeEach(() => {
    layout = null;
  });

  afterEach(() => {
    useLauncher(originalArgv1);
    if (layout !== null) {
      rmSync(layout.root, { recursive: true, force: true });
    }
  });

  it('finds a kit beside the launcher when the bare import cannot', async () => {
    // Exactly the linked-install case: the kit is in the global package
    // directory that belongs to the launcher, and nowhere Node would look.
    layout = installKit({ commands: A_COMMAND });
    useLauncher(layout.launcher);

    const loaded = await loadToolkit();

    expect(loaded.commands.map((command) => command.name)).toEqual(['build']);
    expect(loaded.version).toBe('9.9.9');
    expect(loaded.failure).toBeNull();
  });

  it('stays silent when there is genuinely no kit', async () => {
    // The ordinary outcome for a CLI installed on its own. It must not be
    // reported as a failure, and must not make the CLI noisy.
    const empty = mkdtempSync(join(tmpdir(), 'govplane-nokit-'));
    mkdirSync(join(empty, 'bin'), { recursive: true });
    layout = { root: empty, launcher: join(empty, 'bin', 'govplane') };
    useLauncher(layout.launcher);

    const loaded = await loadToolkit();

    expect(loaded.commands).toEqual([]);
    expect(loaded.failure).toBeNull();
    // Recorded for --verbose, never asserted upon.
    expect(typeof loaded.resolutionDetail).toBe('string');
  });

  it('reports a kit that is present but broken, rather than calling it absent', async () => {
    layout = installKit({ commands: 'throw new Error("kit is broken");' });
    useLauncher(layout.launcher);

    const loaded = await loadToolkit();

    expect(loaded.commands).toEqual([]);
    expect(loaded.failure).toContain('could not be loaded');
    expect(loaded.failure).toContain('kit is broken');
  });

  it('ignores a kit that exports the wrong shape', async () => {
    layout = installKit({ commands: 'export const commands = "not an array";' });
    useLauncher(layout.launcher);

    const loaded = await loadToolkit();

    expect(loaded.commands).toEqual([]);
    expect(loaded.failure).toContain('"commands" array');
  });

  it('drops entries that are not command definitions', async () => {
    layout = installKit({
      commands: `
        export const commands = [
          { name: 'good', summary: 's', usage: 'u', requiresToolkit: true, options: [], run: () => 0 },
          { name: 'no-run' },
          null,
          'nonsense',
        ];
      `,
    });
    useLauncher(layout.launcher);

    const loaded = await loadToolkit();

    expect(loaded.commands.map((command) => command.name)).toEqual(['good']);
  });

  it('copes with no launcher path at all', async () => {
    // `node -e` and embedded uses have no argv[1]; the CLI must not crash.
    useLauncher(undefined);

    const loaded = await loadToolkit();

    expect(loaded.commands).toEqual([]);
    expect(loaded.failure).toBeNull();
  });
});
