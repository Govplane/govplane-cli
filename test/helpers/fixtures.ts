import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import { canonicalPayload, computeChecksum } from '../../src/domain/canonical.js';

/** Minimal bundle that passes every validation stage. */
export const validBundle = (): Record<string, unknown> => ({
  schemaVersion: 1,
  orgId: 'org_test',
  projectId: 'proj_test',
  env: 'prod',
  generatedAt: '2026-07-25T12:00:00.000Z',
  bundleVersion: 1,
  policies: [
    {
      policyKey: 'login-protection',
      activeVersion: 1,
      defaults: { effect: 'allow' },
      rules: [
        {
          id: 'deny-after-five-failures',
          status: 'active',
          priority: 100,
          target: { service: 'auth', resource: 'login', action: 'authenticate' },
          when: { op: 'gte', path: 'ctx.failedAttempts', value: 5 },
          effect: { type: 'deny' },
        },
      ],
    },
  ],
});

export const validBundleWithChecksum = (): Record<string, unknown> => {
  const bundle = validBundle();
  return { ...bundle, checksum: computeChecksum(bundle) };
};

/**
 * A bundle as `govplane build` writes it with no `--org-id` or `--project-id`.
 *
 * The local-first shape: the scope keys are omitted rather than left empty, and
 * `specs/fixtures/signing/minimal-local.bundle.json` is the same document in
 * the shared signing fixtures.
 */
export const localBundle = (): Record<string, unknown> => {
  const bundle = validBundle();
  delete bundle.orgId;
  delete bundle.projectId;
  return { ...bundle, checksum: computeChecksum(bundle) };
};

/**
 * A bundle whose scope was half declared — `orgId` set, `projectId` forgotten.
 *
 * Not a local build and not a cloud bundle: somebody meant to scope it and
 * stopped, which is the case the inferred profile is there to keep catching.
 */
export const halfScopedBundle = (): Record<string, unknown> => {
  const bundle = validBundle();
  delete bundle.projectId;
  return { ...bundle, checksum: computeChecksum(bundle) };
};

export interface SignedBundleFixture {
  bundle: Record<string, unknown>;
  publicKeyPem: string;
}

export const signedBundle = (): SignedBundleFixture => {
  const bundle = validBundle();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const value = signPayload(null, canonicalPayload(bundle), privateKey).toString('base64');

  return {
    bundle: {
      ...bundle,
      signature: { algorithm: 'Ed25519', keyId: 'test-key-01', value },
    },
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
};

/** Build-ready draft document, as persisted by the toolkit `policies` command. */
export const validDraft = (): Record<string, unknown> => ({
  schemaVersion: '1.0',
  generatedAt: '2026-07-25T12:00:00.000Z',
  env: 'prod',
  policies: [
    {
      policyKey: 'login-protection',
      activeVersion: 1,
      defaults: { effect: 'allow' },
      rules: [
        {
          id: 'deny-after-five-failures',
          status: 'active',
          priority: 100,
          target: { service: 'auth', resource: 'login', action: 'authenticate' },
          effect: { type: 'deny' },
        },
      ],
    },
  ],
});

/** Draft document as produced by `govplane analyze`. */
export const analyzeDraft = (): Record<string, unknown> => ({
  schemaVersion: '1.0',
  generatedAt: '2026-07-25T12:00:00.000Z',
  drafts: [
    {
      id: 'api-gateway-request',
      status: 'missing',
      confidence: 'high',
      target: { service: 'api-gateway', resource: '*', action: 'request' },
      availableContext: [{ key: 'method', source: 'req.method', type: 'string' }],
      suggestedPolicy: {
        policyKey: 'api-gateway-request',
        friendlyName: 'API Gateway Request',
        target: { service: 'api-gateway', resource: '*', action: 'request' },
        rules: [],
      },
      sources: [{ file: 'src/middleware/governance.js', line: 18, column: 24 }],
    },
  ],
});
