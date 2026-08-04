import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import {
  daysElapsed, fileTimestamp, fixedClock, systemClock,
} from '../../src/core/clock.js';
import { createSandbox, runCli, type Sandbox } from '../helpers/harness.js';

describe('clock', () => {
  it('reads the system time', () => {
    const before = Date.now();
    const observed = systemClock().getTime();
    expect(observed).toBeGreaterThanOrEqual(before);
  });

  it('freezes at a fixed instant', () => {
    const clock = fixedClock('2026-07-29T12:00:00.000Z');
    expect(clock().toISOString()).toBe('2026-07-29T12:00:00.000Z');
    expect(clock().toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });

  it('hands out copies, so callers cannot mutate the frozen instant', () => {
    const clock = fixedClock(new Date('2026-07-29T12:00:00.000Z'));
    clock().setFullYear(1999);
    expect(clock().toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });

  it('counts whole elapsed days', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    expect(daysElapsed(start, new Date('2026-07-01T23:59:59.000Z'))).toBe(0);
    expect(daysElapsed(start, new Date('2026-07-02T00:00:00.000Z'))).toBe(1);
    expect(daysElapsed(start, new Date('2026-07-31T12:00:00.000Z'))).toBe(30);
  });

  it('never reports negative elapsed days when the clock moves backwards', () => {
    const start = new Date('2026-07-29T00:00:00.000Z');
    expect(daysElapsed(start, new Date('2020-01-01T00:00:00.000Z'))).toBe(0);
    expect(daysElapsed(start, new Date('invalid'))).toBe(0);
  });

  it('formats a filename-safe timestamp', () => {
    expect(fileTimestamp(new Date('2026-07-29T12:00:00.000Z')))
      .toBe('2026-07-29T12-00-00-000Z');
  });
});

describe('injected clock in commands', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('stamps generated files from the injected clock', async () => {
    const result = await runCli(['working-folder', 'init', '--format', 'json'], sandbox, {
      now: fixedClock('2026-07-29T12:00:00.000Z'),
    });

    expect(result.code).toBe(0);
    const draft = await runCli(['inspect', 'policy-drafts.json', '--format', 'json'], sandbox);
    const payload = draft.json() as { generatedAt: string };
    expect(payload.generatedAt).toBe('2026-07-29T12:00:00.000Z');
  });

  it('names backups from the injected clock', async () => {
    await runCli(['working-folder', 'init'], sandbox, {
      now: fixedClock('2026-07-29T12:00:00.000Z'),
    });
    sandbox.writeText('govplane.config.json', '{"custom":true}');

    const forced = await runCli(
      ['working-folder', 'init', '--force', '--format', 'json'],
      sandbox,
      { now: fixedClock('2026-08-01T09:30:00.000Z') },
    );

    const payload = forced.json() as { files: { backup?: string }[] };
    const backup = payload.files.find((file) => file.backup !== undefined)?.backup;
    expect(backup).toContain('backup-2026-08-01T09-30-00-000Z');
  });
});
