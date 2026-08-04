import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { run } from '../../src/cli.js';
import { ExitCode } from '../../src/core/exitCodes.js';
import {
  createSandbox, memoryStream, runCli, type Sandbox,
} from '../helpers/harness.js';
import { validBundleWithChecksum } from '../helpers/fixtures.js';

describe('top-level error handling', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('reports unexpected failures as internal errors', async () => {
    const stderr = memoryStream();
    const stdout = {
      isTTY: false,
      write() {
        throw new Error('stdout exploded');
      },
    };

    const code = await run(['version'], {
      streams: { stdout, stderr },
      cwd: sandbox.project,
      env: sandbox.env,
    });

    expect(code).toBe(ExitCode.InternalError);
    expect(stderr.text()).toContain('Unexpected error: stdout exploded');
    expect(stderr.text()).toContain('--verbose');
  });

  it('includes a stack trace for unexpected failures in verbose mode', async () => {
    const stderr = memoryStream();
    const stdout = {
      isTTY: false,
      write() {
        throw new Error('stdout exploded');
      },
    };

    const code = await run(['version', '--verbose'], {
      streams: { stdout, stderr },
      cwd: sandbox.project,
      env: sandbox.env,
    });

    expect(code).toBe(ExitCode.InternalError);
    expect(stderr.text()).toContain('at ');
  });

  it('rejects unknown options before running a command', async () => {
    const result = await runCli(['validate', '--wat'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Unknown option: --wat');
  });

  it('rejects an unknown help topic', async () => {
    const result = await runCli(['help', 'teleport'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Unknown command: teleport');
  });

  it('resolves the working folder from the environment variable', async () => {
    sandbox.writeJson('governance/policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate'], sandbox, {
      env: { GOVPLANE_WORKING_FOLDER: `${sandbox.project}/governance` },
    });
    expect(result.code).toBe(ExitCode.Success);
  });

  it('lets the command flag win over the environment variable', async () => {
    sandbox.writeJson('governance/policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate', '-w', './governance'], sandbox, {
      env: { GOVPLANE_WORKING_FOLDER: '/nonexistent' },
    });
    expect(result.code).toBe(ExitCode.Success);
  });

  it('prints the resolved working folder in verbose mode', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate', '--verbose'], sandbox);
    expect(result.stdout).toContain('Working folder:');
    expect(result.stdout).toContain('Validating:');
  });
});
