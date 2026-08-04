import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  canonicalPayload, computeChecksum, etagFromChecksum, isDeterministicallyOrdered,
  projectCanonicalBundle, sortKeysDeep, verifyChecksum,
} from '../../src/domain/canonical.js';
import { validBundle } from '../helpers/fixtures.js';

/**
 * Reference implementation copied from the control plane
 * (`BuildCanonicalBundleUseCase` + `BundleChecksumAdapter`). These tests fail if
 * the CLI ever drifts from the remote canonicalisation.
 */
const referenceCanonical = (bundle: Record<string, any>): string => {
  const sortDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      return Object.keys(source).sort().reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortDeep(source[key]);
        return accumulator;
      }, {});
    }
    return value;
  };

  return JSON.stringify(sortDeep({
    schemaVersion: 1,
    orgId: bundle.orgId,
    projectId: bundle.projectId,
    env: bundle.env,
    policies: (bundle.policies as Record<string, unknown>[]).map((policy) => ({
      policyKey: policy.policyKey,
      activeVersion: policy.activeVersion,
      defaults: policy.defaults,
      rules: policy.rules,
    })),
  }));
};

describe('canonical projection', () => {
  it('matches the control plane projection byte for byte', () => {
    const bundle = validBundle();
    expect(canonicalPayload(bundle).toString('utf8')).toBe(referenceCanonical(bundle));
  });

  it('excludes generatedAt, bundleVersion, checksum and signature', () => {
    const bundle = validBundle();
    const payload = canonicalPayload({
      ...bundle,
      generatedAt: '2030-01-01T00:00:00.000Z',
      bundleVersion: 9,
      checksum: 'sha256:whatever',
      signature: { algorithm: 'Ed25519', keyId: 'k', value: 'v' },
      etag: 'W/"x"',
    });
    expect(payload.toString('utf8')).toBe(canonicalPayload(bundle).toString('utf8'));
  });

  it('is independent of key order', () => {
    const bundle = validBundle();
    const reordered = {
      policies: bundle.policies,
      env: bundle.env,
      projectId: bundle.projectId,
      orgId: bundle.orgId,
      schemaVersion: 1,
    };
    expect(computeChecksum(reordered)).toBe(computeChecksum(bundle));
  });

  it('keeps only the projected policy fields', () => {
    const projected = projectCanonicalBundle({
      schemaVersion: 1,
      orgId: 'o',
      projectId: 'p',
      env: 'prod',
      policies: [{ policyKey: 'k', activeVersion: 1, defaults: {}, rules: [], extra: 'dropped' }],
    });
    expect(Object.keys(projected.policies[0] as object))
      .toEqual(['policyKey', 'activeVersion', 'defaults', 'rules']);
  });

  it('computes a sha256-prefixed checksum', () => {
    const bundle = validBundle();
    const expected = createHash('sha256').update(canonicalPayload(bundle)).digest('hex');
    expect(computeChecksum(bundle)).toBe(`sha256:${expected}`);
  });

  it('verifies checksums case-insensitively and detects tampering', () => {
    const bundle = validBundle();
    const checksum = computeChecksum(bundle);
    expect(verifyChecksum(bundle, checksum.toUpperCase()).matches).toBe(true);

    const tampered = { ...bundle, policies: [] };
    expect(verifyChecksum(tampered, checksum).matches).toBe(false);
  });

  it('derives an ETag from a checksum', () => {
    expect(etagFromChecksum('sha256:abc')).toBe('"abc"');
    expect(etagFromChecksum('abc')).toBe('"abc"');
  });

  it('sorts nested keys deterministically', () => {
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 2, c: [{ f: 1, e: 2 }] } })))
      .toBe('{"a":{"c":[{"e":2,"f":1}],"d":2},"b":1}');
  });
});

describe('deterministic ordering', () => {
  const ordered = {
    policies: [
      { policyKey: 'alpha', rules: [{ id: 'a', priority: 100 }, { id: 'b', priority: 50 }] },
      { policyKey: 'beta', rules: [{ id: 'a', priority: 10 }, { id: 'b', priority: 10 }] },
    ],
  };

  it('accepts canonical order', () => {
    expect(isDeterministicallyOrdered(ordered)).toBe(true);
  });

  it('rejects policies out of order', () => {
    expect(isDeterministicallyOrdered({
      policies: [{ policyKey: 'beta', rules: [] }, { policyKey: 'alpha', rules: [] }],
    })).toBe(false);
  });

  it('rejects rules out of priority order', () => {
    expect(isDeterministicallyOrdered({
      policies: [{
        policyKey: 'alpha',
        rules: [{ id: 'a', priority: 10 }, { id: 'b', priority: 90 }],
      }],
    })).toBe(false);
  });

  it('rejects equal-priority rules out of id order', () => {
    expect(isDeterministicallyOrdered({
      policies: [{
        policyKey: 'alpha',
        rules: [{ id: 'b', priority: 10 }, { id: 'a', priority: 10 }],
      }],
    })).toBe(false);
  });

  it('ignores documents without policies', () => {
    expect(isDeterministicallyOrdered({})).toBe(true);
    expect(isDeterministicallyOrdered('nope')).toBe(true);
  });
});
