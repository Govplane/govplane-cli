import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { run } from '../../src/cli.js';
import { commands, mergeCommands } from '../../src/commands/registry.js';
import type { CommandDefinition } from '../../src/commands/types.js';
import { ExitCode } from '../../src/core/exitCodes.js';
import { loadToolkitCommands } from '../../src/core/toolkitBridge.js';
import {
  createSandbox, memoryStream, type Sandbox,
} from '../helpers/harness.js';
import { validBundleWithChecksum } from '../helpers/fixtures.js';

const stubCommand = (
  name: string,
  overrides: Partial<CommandDefinition> = {},
): CommandDefinition => ({
  name,
  summary: `${name} summary`,
  usage: `govplane ${name}`,
  requiresRuntimeKit: false,
  options: [],
  run: (context) => {
    context.reporter.line(`${name} ran`);
    return ExitCode.Success;
  },
  ...overrides,
});

const runWith = async (
  argv: string[],
  sandbox: Sandbox,
  extraCommands: CommandDefinition[],
) => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const code = await run(argv, {
    streams: { stdout, stderr },
    cwd: sandbox.project,
    env: sandbox.env,
    extraCommands,
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
};

describe('mergeCommands', () => {
  it('replaces a built-in placeholder of the same name', () => {
    const replacement = stubCommand('build', { summary: 'Build a policy bundle' });
    const merged = mergeCommands(commands, [replacement]);

    expect(merged.filter((command) => command.name === 'build')).toHaveLength(1);
    expect(merged.find((command) => command.name === 'build')).toBe(replacement);
  });

  it('appends commands the basic CLI does not know', () => {
    const merged = mergeCommands(commands, [stubCommand('activate')]);
    expect(merged.map((command) => command.name)).toContain('activate');
  });

  it('leaves the basic registry untouched', () => {
    const before = commands.length;
    mergeCommands(commands, [stubCommand('activate')]);
    expect(commands).toHaveLength(before);
  });
});

describe('commands contributed by the Runtime Kit', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('runs a contributed command', async () => {
    const result = await runWith(['activate'], sandbox, [stubCommand('activate')]);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('activate ran');
  });

  it('takes over a Runtime Kit placeholder', async () => {
    const withoutKit = await runWith(['build'], sandbox, []);
    expect(withoutKit.code).toBe(ExitCode.RuntimeKitUnavailable);

    const withKit = await runWith(['build'], sandbox, [
      stubCommand('build', { requiresRuntimeKit: true }),
    ]);
    expect(withKit.code).toBe(ExitCode.Success);
    expect(withKit.stdout).toContain('build ran');
  });

  it('accepts options declared by a contributed command', async () => {
    const contributed = stubCommand('activate', {
      options: [{ name: 'no-browser', type: 'boolean', description: 'Do not open a browser' }],
    });

    const result = await runWith(['activate', '--no-browser'], sandbox, [contributed]);
    expect(result.code).toBe(ExitCode.Success);
  });

  it('lists contributed commands in general help', async () => {
    const result = await runWith(['help'], sandbox, [stubCommand('activate')]);
    expect(result.stdout).toContain('activate');
    expect(result.stdout).toContain('activate summary');
  });

  it('documents a contributed command', async () => {
    const result = await runWith(['help', 'activate'], sandbox, [stubCommand('activate')]);
    expect(result.stdout).toContain('govplane activate');
  });

  it('suggests a contributed command after a typo', async () => {
    const result = await runWith(['activat'], sandbox, [stubCommand('activate')]);
    expect(result.stderr).toContain('activate');
  });

  it('keeps the basic CLI working when nothing is contributed', async () => {
    const result = await runWith(['version'], sandbox, []);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Govplane CLI');
  });

  it('gives an option the meaning its own command declares', async () => {
    // `--context` is a boolean for `inspect` and carries a JSON payload for the
    // Runtime Kit's `simulate`. Interpreting argv against a single merged table
    // would apply whichever spec was registered first, and quietly hand one
    // command the other's meaning.
    const contributed = stubCommand('evaluate', {
      options: [{
        name: 'context',
        type: 'string',
        placeholder: '<json>',
        description: 'Context as JSON',
      }],
      run: (context) => {
        context.reporter.line(`context=${String(context.options.context)}`);
        return ExitCode.Success;
      },
    });

    const contributedRun = await runWith(
      ['evaluate', '--context', '{"a":1}'],
      sandbox,
      [contributed],
    );
    expect(contributedRun.code).toBe(ExitCode.Success);
    expect(contributedRun.stdout).toContain('context={"a":1}');

    // The built-in meaning is untouched: for inspect it stays a flag, so it
    // never swallows the next argument.
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const builtIn = await runWith(['inspect', '--context'], sandbox, [contributed]);
    expect(builtIn.code).toBe(ExitCode.Success);
    expect(builtIn.stdout).toContain('failedAttempts');
  });

  it('does not mistake a root option value for a command', async () => {
    sandbox.writeJson('build/policy-bundle.json', validBundleWithChecksum());

    // "build" here is a directory, not the command.
    const result = await runWith(['-w', './build', 'validate', '--quiet'], sandbox, []);
    expect(result.code).toBe(ExitCode.Success);
  });
});

describe('loadToolkitCommands', () => {
  it('reports no commands when the toolkit is not installed', async () => {
    // The CLI package deliberately does not depend on the toolkit, so this
    // resolves to nothing in its own test environment.
    await expect(loadToolkitCommands()).resolves.toEqual([]);
  });
});
