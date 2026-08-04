import { createHash } from 'node:crypto';
import { isRecord } from './types.js';

/**
 * Canonicalisation of runtime bundles.
 *
 * This module is normative: the projection and serialisation below must match
 * the control plane byte for byte, otherwise locally produced checksums and
 * signatures would be rejected by the runtime (and vice versa).
 *
 * Projection — only these fields participate:
 *   schemaVersion, orgId, projectId, env,
 *   policies[] → policyKey, activeVersion, defaults, rules
 *
 * Explicitly excluded: generatedAt, bundleVersion, checksum, etag, signature.
 */
export interface CanonicalBundle {
  schemaVersion: 1;
  orgId: unknown;
  projectId: unknown;
  env: unknown;
  policies: {
    policyKey: unknown;
    activeVersion: unknown;
    defaults: unknown;
    rules: unknown;
  }[];
}

export const projectCanonicalBundle = (bundle: unknown): CanonicalBundle => {
  const source = isRecord(bundle) ? bundle : {};
  const policies = Array.isArray(source.policies) ? source.policies : [];

  return {
    schemaVersion: 1,
    orgId: source.orgId,
    projectId: source.projectId,
    env: source.env,
    policies: policies.map((policy) => {
      const entry = isRecord(policy) ? policy : {};
      return {
        policyKey: entry.policyKey,
        activeVersion: entry.activeVersion,
        defaults: entry.defaults,
        rules: entry.rules,
      };
    }),
  };
};

/** Recursively sorts object keys so serialisation is independent of key order. */
export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
         
        accumulator[key] = sortKeysDeep(value[key]);
        return accumulator;
      }, {});
  }
  return value;
};

/** The exact bytes of a runtime bundle that are checksummed and signed. */
export const canonicalPayload = (bundle: unknown): Buffer => (
  Buffer.from(JSON.stringify(sortKeysDeep(projectCanonicalBundle(bundle))), 'utf8')
);

/**
 * Canonical bytes of a signed document that is *not* a runtime bundle — today,
 * the toolkit activation licence.
 *
 * The difference from `canonicalPayload` is deliberate and must not be
 * collapsed. A bundle is projected down to an explicit allow-list of fields,
 * because the control plane strips presentation and integrity metadata before
 * signing. A licence instead keeps every field except `signature`: each one
 * (email, terms version, consent, plan) carries meaning, so none may fall
 * outside the signature's coverage.
 */
export const canonicalDocument = (document: unknown): Buffer => {
  const copy = isRecord(document) ? { ...document } : {};
  delete copy.signature;
  return Buffer.from(JSON.stringify(sortKeysDeep(copy)), 'utf8');
};

export const computeChecksum = (bundle: unknown): string => (
  `sha256:${createHash('sha256').update(canonicalPayload(bundle)).digest('hex')}`
);

export const etagFromChecksum = (checksum: string): string => {
  const hex = checksum.startsWith('sha256:') ? checksum.slice('sha256:'.length) : checksum;
  return `"${hex}"`;
};

export interface ChecksumComparison {
  expected: string;
  actual: string;
  matches: boolean;
}

export const verifyChecksum = (bundle: unknown, checksum: string): ChecksumComparison => {
  const actual = computeChecksum(bundle);
  return {
    expected: checksum,
    actual,
    matches: actual.toLowerCase() === checksum.toLowerCase(),
  };
};

const comparePolicyKeys = (left: unknown, right: unknown): number => {
  const a = typeof left === 'string' ? left : '';
  const b = typeof right === 'string' ? right : '';
  return a.localeCompare(b);
};

/**
 * Deterministic ordering used by the control plane when it compiles bundles:
 * policies by `policyKey` ascending, rules by `priority` descending and then
 * by `id` ascending.
 */
export const isDeterministicallyOrdered = (bundle: unknown): boolean => {
  if (!isRecord(bundle) || !Array.isArray(bundle.policies)) {
    return true;
  }

  const {policies} = bundle;
  const policiesOrdered = policies.every((policy, index) => {
    if (index === 0) {
      return true;
    }
    const previous = isRecord(policies[index - 1]) ? policies[index - 1] : {};
    const current = isRecord(policy) ? policy : {};
    return comparePolicyKeys(
      (previous as Record<string, unknown>).policyKey,
      (current).policyKey,
    ) <= 0;
  });

  if (!policiesOrdered) {
    return false;
  }

  return policies.every((policy) => {
    if (!isRecord(policy) || !Array.isArray(policy.rules)) {
      return true;
    }
    const {rules} = policy;
    return rules.every((rule, index) => {
      if (index === 0) {
        return true;
      }
      const previous = isRecord(rules[index - 1]) ? rules[index - 1] : {};
      const current = isRecord(rule) ? rule : {};
      const previousPriority = typeof previous.priority === 'number' ? previous.priority : 0;
      const currentPriority = typeof current.priority === 'number' ? current.priority : 0;
      if (previousPriority !== currentPriority) {
        return previousPriority > currentPriority;
      }
      const previousId = typeof previous.id === 'string' ? previous.id : '';
      const currentId = typeof current.id === 'string' ? current.id : '';
      return previousId.localeCompare(currentId) <= 0;
    });
  });
};
