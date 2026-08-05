import { describe, expect, it } from '@jest/globals';
import { supportsColor } from '../../src/core/color.js';
import { CliError, isCliError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exitCodes.js';
import {
  isSupportedNodeVersion, readCliVersion, unsupportedNodeMessage,
} from '../../src/core/environment.js';
import { parseJson, stringifyJson } from '../../src/core/json.js';
import { Reporter } from '../../src/core/reporter.js';
import { resolveGovplaneHome, toolkitManifestPath } from '../../src/core/paths.js';
import { memoryStream } from '../helpers/harness.js';

const createReporter = (options: Partial<ConstructorParameters<typeof Reporter>[0]> = {}) => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const reporter = new Reporter({ stdout, stderr, ...options });
  return { reporter, stdout, stderr };
};

describe('Reporter', () => {
  it('writes text lines to stdout', () => {
    const { reporter, stdout } = createReporter();
    reporter.lines(['one', 'two']);
    expect(stdout.text()).toBe('one\ntwo\n');
  });

  it('suppresses text output in quiet mode', () => {
    const { reporter, stdout } = createReporter({ quiet: true });
    reporter.line('hidden');
    expect(stdout.text()).toBe('');
  });

  it('suppresses text output when JSON is requested', () => {
    const { reporter, stdout } = createReporter({ format: 'json' });
    reporter.line('hidden');
    reporter.json({ ok: true });
    expect(stdout.text()).toBe('{\n  "ok": true\n}\n');
  });

  it('writes diagnostics only in verbose mode', () => {
    const quiet = createReporter();
    quiet.reporter.debug('detail');
    expect(quiet.stdout.text()).toBe('');

    const verbose = createReporter({ verbose: true });
    verbose.reporter.debug('detail');
    expect(verbose.stdout.text()).toBe('detail\n');
  });

  it('always writes errors to stderr', () => {
    const { reporter, stderr } = createReporter({ quiet: true });
    reporter.errorLines(['boom']);
    expect(stderr.text()).toBe('boom\n');
  });

  it('applies ANSI styling only when colour is enabled', () => {
    const plain = createReporter();
    expect(plain.reporter.success('ok')).toBe('ok');

    const coloured = createReporter({ color: true });
    expect(coloured.reporter.success('ok')).toContain('\u001B[32m');
    expect(coloured.reporter.failure('no')).toContain('\u001B[31m');
    expect(coloured.reporter.warning('hm')).toContain('\u001B[33m');
    expect(coloured.reporter.heading('h')).toContain('\u001B[1m');
    expect(coloured.reporter.accent('a')).toContain('\u001B[36m');
    expect(coloured.reporter.muted('m')).toContain('\u001B[2m');
  });
});

describe('supportsColor', () => {
  it('follows the NO_COLOR convention', () => {
    expect(supportsColor({ isTty: true, env: { NO_COLOR: '1' } })).toBe(false);
  });

  it('honours FORCE_COLOR even without a TTY', () => {
    expect(supportsColor({ isTty: false, env: { FORCE_COLOR: '1' } })).toBe(true);
    expect(supportsColor({ isTty: false, env: { FORCE_COLOR: '0' } })).toBe(false);
  });

  it('disables colour for dumb terminals and non-TTY streams', () => {
    expect(supportsColor({ isTty: true, env: { TERM: 'dumb' } })).toBe(false);
    expect(supportsColor({ isTty: false, env: {} })).toBe(false);
    expect(supportsColor({ isTty: true, env: {} })).toBe(true);
  });
});

describe('json helpers', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports the failing line and column when the engine provides a position', () => {
    const result = parseJson('{\n  "a": 1,\n  "b": ,\n}');
    expect(result.ok).toBe(false);
    if (!result.ok && result.position) {
      expect(result.position.line).toBe(3);
      expect(result.position.column).toBeGreaterThan(1);
    }
  });

  it('still reports failures without a position', () => {
    const result = parseJson('');
    expect(result.ok).toBe(false);
  });

  it('serialises with a trailing newline', () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});

describe('errors', () => {
  it('carries a code, exit code and details', () => {
    const error = new CliError('boom', {
      code: 'BOOM',
      exitCode: ExitCode.FileError,
      details: ['detail'],
    });

    expect(isCliError(error)).toBe(true);
    expect(error.exitCode).toBe(ExitCode.FileError);
    expect(error.details).toEqual(['detail']);
  });

  it('defaults to the generic failure exit code', () => {
    expect(new CliError('boom', { code: 'BOOM' }).exitCode).toBe(ExitCode.Failure);
  });

  it('attaches a cause', () => {
    const cause = new Error('root');
    expect(new CliError('boom', { code: 'BOOM' }).withCause(cause).cause).toBe(cause);
    expect(new CliError('boom', { code: 'BOOM', cause }).cause).toBe(cause);
  });

  it('recognises foreign errors', () => {
    expect(isCliError(new Error('nope'))).toBe(false);
  });
});

describe('environment', () => {
  it('reads its own package version', () => {
    expect(readCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('detects unsupported Node.js versions', () => {
    expect(isSupportedNodeVersion('20.11.0')).toBe(true);
    expect(isSupportedNodeVersion('18.19.0')).toBe(false);
    expect(isSupportedNodeVersion('nonsense')).toBe(false);
    expect(unsupportedNodeMessage('18.19.0'))
      .toBe('Govplane CLI requires Node.js 20 or later. Current version: Node.js 18.19.0');
  });
});

describe('paths', () => {
  it('prefers GOVPLANE_HOME', () => {
    expect(resolveGovplaneHome({ GOVPLANE_HOME: '/custom' })).toBe('/custom');
    expect(toolkitManifestPath({ GOVPLANE_HOME: '/custom' })).toBe('/custom/kit/kit.json');
  });

  it('falls back to the user profile', () => {
    expect(resolveGovplaneHome({})).toMatch(/\.govplane$/);
    expect(resolveGovplaneHome({ GOVPLANE_HOME: '  ' })).toMatch(/\.govplane$/);
  });
});
