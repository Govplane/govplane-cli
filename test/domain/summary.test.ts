import { describe, expect, it } from '@jest/globals';
import {
  collectContextUsage, collectTargets, formatTarget, summariseBundle, summariseDraft,
} from '../../src/domain/summary.js';
import {
  analyzeDraft, signedBundle, validBundleWithChecksum, validDraft,
} from '../helpers/fixtures.js';

describe('summariseBundle', () => {
  it('summarises scope, totals and integrity', () => {
    const summary = summariseBundle(validBundleWithChecksum());

    expect(summary).toMatchObject({
      schemaVersion: 1,
      orgId: 'org_test',
      projectId: 'proj_test',
      env: 'prod',
      bundleVersion: 1,
    });
    expect(summary.totals).toEqual({
      policies: 1, activePolicies: 1, disabledPolicies: 0, rules: 1,
    });
    expect(summary.checksumMatches).toBe(true);
    expect(summary.etag).toMatch(/^"/);
  });

  it('flags a checksum that no longer matches', () => {
    const summary = summariseBundle({ ...validBundleWithChecksum(), policies: [] });
    expect(summary.checksumMatches).toBe(false);
  });

  it('exposes signature metadata', () => {
    const { bundle } = signedBundle();
    expect(summariseBundle(bundle).signature).toEqual({
      algorithm: 'Ed25519',
      keyId: 'test-key-01',
    });
  });

  it('counts disabled policies separately', () => {
    const summary = summariseBundle({
      policies: [
        { policyKey: 'a', status: 'disabled', rules: [] },
        { policyKey: 'b', rules: [] },
      ],
    });
    expect(summary.totals).toMatchObject({ activePolicies: 1, disabledPolicies: 1 });
  });

  it('collects targets and context fields referenced by conditions', () => {
    const summary = summariseBundle(validBundleWithChecksum());
    const [policy] = summary.policies;

    expect(policy?.contextFields).toEqual(['failedAttempts']);
    expect(collectTargets(summary.policies)).toEqual(['auth / login / authenticate']);
    expect(collectContextUsage(summary.policies)).toEqual([
      { field: 'failedAttempts', policies: ['login-protection'] },
    ]);
  });

  it('formats a target as service / resource / action', () => {
    expect(formatTarget({ service: 'auth', resource: 'login', action: 'authenticate' }))
      .toBe('auth / login / authenticate');
  });
});

describe('summariseDraft', () => {
  it('summarises build-ready drafts', () => {
    const summary = summariseDraft(validDraft());
    expect(summary.shape).toBe('build-ready');
    expect(summary.totals).toEqual({
      drafts: 1, complete: 1, incomplete: 0, rules: 1,
    });
  });

  it('summarises analyze drafts, including source locations', () => {
    const summary = summariseDraft(analyzeDraft());
    expect(summary.shape).toBe('analyze');
    expect(summary.totals).toMatchObject({ drafts: 1, complete: 0, incomplete: 1 });

    const [entry] = summary.entries;
    expect(entry?.key).toBe('api-gateway-request');
    expect(entry?.confidence).toBe('high');
    expect(entry?.contextFields).toEqual(['method']);
    expect(entry?.sources).toEqual([
      { file: 'src/middleware/governance.js', line: 18, column: 24 },
    ]);
  });

  it('marks a policy without rules as incomplete', () => {
    const summary = summariseDraft({
      schemaVersion: '1.0',
      policies: [{ policyKey: 'p', defaults: { effect: 'allow' }, rules: [] }],
    });
    expect(summary.totals).toMatchObject({ complete: 0, incomplete: 1 });
  });
});
