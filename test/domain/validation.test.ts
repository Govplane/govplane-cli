import { describe, expect, it } from '@jest/globals';
import { detectDocumentType } from '../../src/domain/detect.js';
import { validateBundle } from '../../src/domain/validation/bundle.js';
import { validateDraft } from '../../src/domain/validation/draft.js';
import { validateDocument } from '../../src/domain/validation/index.js';
import { computeChecksum } from '../../src/domain/canonical.js';
import {
  analyzeDraft, validBundle, validBundleWithChecksum, validDraft,
} from '../helpers/fixtures.js';

const codes = (issues: { code: string }[]): string[] => issues.map((issue) => issue.code);

describe('detectDocumentType', () => {
  it('detects runtime bundles from their scope fields', () => {
    expect(detectDocumentType(validBundle()).type).toBe('bundle');
  });

  it('detects analyze drafts', () => {
    expect(detectDocumentType(analyzeDraft()).type).toBe('draft');
  });

  it('detects build-ready drafts', () => {
    expect(detectDocumentType(validDraft()).type).toBe('draft');
  });

  it('detects bundles by integrity metadata alone', () => {
    expect(detectDocumentType({ checksum: 'sha256:abc' }).type).toBe('bundle');
  });

  it('reports unknown documents', () => {
    expect(detectDocumentType({ hello: 'world' }).type).toBe('unknown');
    expect(detectDocumentType('nope').type).toBe('unknown');
  });
});

describe('validateBundle', () => {
  it('accepts a valid bundle', () => {
    const { issues, stats } = validateBundle(validBundleWithChecksum());
    expect(issues.errors).toEqual([]);
    expect(stats).toMatchObject({ policies: 1, rules: 1, schemaVersion: 1 });
  });

  it('requires schemaVersion 1 and the scope fields', () => {
    const { issues } = validateBundle({ schemaVersion: 2, policies: [] });
    expect(codes(issues.errors)).toEqual(expect.arrayContaining([
      'INVALID_SCHEMA_VERSION',
      'MISSING_SCOPE_FIELDS',
    ]));
  });

  it('restricts env to the supported environments', () => {
    const bundle = { ...validBundle(), env: 'production' };
    expect(codes(validateBundle(bundle).issues.errors)).toContain('INVALID_ENV');
  });

  it('requires policies to be an array', () => {
    const bundle = { ...validBundle(), policies: {} };
    expect(codes(validateBundle(bundle).issues.errors)).toContain('POLICIES_NOT_ARRAY');
  });

  it('reports duplicate policy keys and rule ids', () => {
    const [policy] = validBundle().policies as Record<string, unknown>[];
    const rules = policy!.rules as unknown[];
    const bundle = {
      ...validBundle(),
      policies: [
        { ...policy, rules: [...rules, rules[0]] },
        policy,
      ],
    };
    const found = codes(validateBundle(bundle).issues.errors);
    expect(found).toContain('DUPLICATE_POLICY_KEY');
    expect(found).toContain('DUPLICATE_RULE_ID');
  });

  it('validates default effect payloads', () => {
    const build = (defaults: unknown) => validateBundle({
      ...validBundle(),
      policies: [{
        policyKey: 'p', activeVersion: 1, defaults, rules: [],
      }],
    }).issues.errors;

    expect(codes(build({ effect: 'nope' }))).toContain('INVALID_DEFAULT_EFFECT');
    expect(codes(build({ effect: 'kill_switch' }))).toContain('MISSING_KILL_SWITCH_SERVICE');
    expect(codes(build({ effect: 'throttle', throttle: { limit: 1 } })))
      .toContain('INVALID_THROTTLE_DEFAULT');
    expect(codes(build({ effect: 'custom' }))).toContain('INVALID_CUSTOM_DEFAULT');
    expect(codes(build(undefined))).toContain('INVALID_DEFAULT_EFFECT');
  });

  it('validates rule targets, priorities and effects', () => {
    const bundle = {
      ...validBundle(),
      policies: [{
        policyKey: 'p',
        activeVersion: 1,
        defaults: { effect: 'allow' },
        rules: [{ id: '', priority: 'high', target: { service: 's' }, effect: { type: 'custom' } }],
      }],
    };
    const found = codes(validateBundle(bundle).issues.errors);
    expect(found).toEqual(expect.arrayContaining([
      'MISSING_RULE_ID',
      'INVALID_RULE_PRIORITY',
      'INVALID_RULE_TARGET',
      'INVALID_RULE_EFFECT',
    ]));
  });

  it('validates the condition AST', () => {
    const withCondition = (when: unknown) => {
      const bundle = {
        ...validBundle(),
        policies: [{
          policyKey: 'p',
          activeVersion: 1,
          defaults: { effect: 'allow' },
          rules: [{
            id: 'r',
            priority: 1,
            target: { service: 's', resource: 'r', action: 'a' },
            effect: { type: 'allow' },
            when,
          }],
        }],
      };
      return codes(validateBundle(bundle).issues.errors);
    };

    expect(withCondition({ op: 'equalsTo', path: 'a', value: 1 }))
      .toContain('UNSUPPORTED_CONDITION_OPERATOR');
    expect(withCondition({ op: 'ne', path: 'a', value: 1 }))
      .toContain('UNSUPPORTED_CONDITION_OPERATOR');
    expect(withCondition({ op: 'eq', path: '', value: {} })).toContain('INVALID_CONDITION_AST');
    expect(withCondition({ op: 'and', conditions: [] })).toContain('INVALID_CONDITION_AST');
    expect(withCondition({ op: 'not' })).toContain('INVALID_CONDITION_AST');
    expect(withCondition({ op: 'in', path: 'a', values: [] })).toContain('INVALID_CONDITION_AST');
    expect(withCondition({ op: 'exists' })).toContain('INVALID_CONDITION_AST');
    expect(withCondition('nope')).toContain('INVALID_CONDITION_AST');
    expect(withCondition({
      op: 'or',
      conditions: [{ op: 'eq', path: 'a', value: 1 }, { op: 'exists', path: 'b' }],
    })).toEqual([]);
  });

  it('validates materialisation metadata', () => {
    const bundle = {
      ...validBundle(),
      generatedAt: 'yesterday',
      bundleVersion: 0,
      checksum: 'sha256:0000',
      signature: { algorithm: 'Ed25519' },
    };
    expect(codes(validateBundle(bundle).issues.errors)).toEqual(expect.arrayContaining([
      'INVALID_GENERATED_AT',
      'INVALID_BUNDLE_VERSION',
      'CHECKSUM_MISMATCH',
      'INVALID_SIGNATURE_METADATA',
    ]));
  });

  it('accepts the revision counter the control plane increments', () => {
    // gp-worker writes `currentVersion + 1` on every materialisation, so a
    // long-lived bundle is routinely well past 1.
    [1, 2, 7, 4211].forEach((bundleVersion) => {
      const bundle = { ...validBundle(), bundleVersion };
      expect(codes(validateBundle(bundle).issues.errors)).not.toContain('INVALID_BUNDLE_VERSION');
    });
  });

  it('rejects a revision counter that is not a whole number of 1 or more', () => {
    [0, -1, 1.5, 'two'].forEach((bundleVersion) => {
      const bundle = { ...validBundle(), bundleVersion };
      expect(codes(validateBundle(bundle).issues.errors)).toContain('INVALID_BUNDLE_VERSION');
    });
  });

  it('treats scope as optional in the local-first profile', () => {
    const bundle = validBundle();
    delete bundle.orgId;
    delete bundle.projectId;

    expect(codes(validateBundle(bundle).issues.errors)).toContain('MISSING_SCOPE_FIELDS');

    const local = validateBundle(bundle, { scope: 'optional' });
    expect(codes(local.issues.errors)).not.toContain('MISSING_SCOPE_FIELDS');
    expect(codes(local.issues.warnings)).toContain('MISSING_SCOPE_FIELDS');
  });

  it('still requires env in the local-first profile', () => {
    const bundle = validBundle();
    delete bundle.env;

    expect(codes(validateBundle(bundle, { scope: 'optional' }).issues.errors))
      .toContain('MISSING_SCOPE_FIELDS');
  });

  it('accepts a matching checksum', () => {
    const bundle = validBundle();
    const withChecksum = { ...bundle, checksum: computeChecksum(bundle) };
    expect(codes(validateBundle(withChecksum).issues.errors)).toEqual([]);
  });

  it('warns about empty policies, wildcards and unsigned bundles', () => {
    const bundle = {
      ...validBundle(),
      policies: [{
        policyKey: 'p',
        activeVersion: 1,
        defaults: { effect: 'allow' },
        rules: [],
      }],
    };
    const found = codes(validateBundle(bundle).issues.warnings);
    expect(found).toContain('POLICY_WITHOUT_RULES');
    expect(found).toContain('UNSIGNED_BUNDLE');
  });

  it('rejects documents that are not objects', () => {
    expect(codes(validateBundle([]).issues.errors)).toContain('DOCUMENT_NOT_OBJECT');
  });
});

describe('validateDraft', () => {
  it('accepts a build-ready draft', () => {
    const { issues, stats } = validateDraft(validDraft());
    expect(issues.errors).toEqual([]);
    expect(stats).toMatchObject({ policies: 1, rules: 1 });
  });

  it('accepts an analyze draft', () => {
    const { issues, stats } = validateDraft(analyzeDraft());
    expect(issues.errors).toEqual([]);
    expect(stats.policies).toBe(1);
    expect(codes(issues.warnings)).toContain('INCOMPLETE_DRAFT');
  });

  it('requires schemaVersion', () => {
    expect(codes(validateDraft({ policies: [] }).issues.errors)).toContain('INVALID_DRAFT_SCHEMA');
  });

  it('requires a policies or drafts array', () => {
    expect(codes(validateDraft({ schemaVersion: '1.0' }).issues.errors))
      .toContain('INVALID_DRAFT_SCHEMA');
    expect(codes(validateDraft({ schemaVersion: '1.0', policies: {} }).issues.errors))
      .toContain('POLICIES_NOT_ARRAY');
    expect(codes(validateDraft({ schemaVersion: '1.0', drafts: {} }).issues.errors))
      .toContain('DRAFTS_NOT_ARRAY');
  });

  it('validates rule status in drafts', () => {
    const draft = {
      schemaVersion: '1.0',
      policies: [{
        policyKey: 'p',
        defaults: { effect: 'allow' },
        rules: [{
          id: 'r',
          status: 'paused',
          priority: 1,
          target: { service: 's', resource: 'r', action: 'a' },
          effect: { type: 'allow' },
        }],
      }],
    };
    expect(codes(validateDraft(draft).issues.errors)).toContain('INVALID_RULE_STATUS');
  });

  it('requires analyze draft targets', () => {
    const draft = { schemaVersion: '1.0', drafts: [{ id: 'x' }] };
    expect(codes(validateDraft(draft).issues.errors)).toContain('MISSING_DRAFT_TARGET');
  });

  it('rejects an unsupported env', () => {
    expect(codes(validateDraft({ schemaVersion: '1.0', env: 'qa', policies: [] }).issues.errors))
      .toContain('INVALID_ENV');
  });
});

describe('validateDocument', () => {
  it('infers the document type', () => {
    const result = validateDocument({ document: validBundleWithChecksum(), file: '/tmp/b.json' });
    expect(result.documentType).toBe('bundle');
    expect(result.valid).toBe(true);
  });

  it('honours an explicit type and warns on a mismatch', () => {
    const result = validateDocument({
      document: validDraft(),
      file: '/tmp/d.json',
      type: 'bundle',
    });
    expect(result.documentType).toBe('bundle');
    expect(codes(result.warnings)).toContain('DOCUMENT_TYPE_MISMATCH');
  });

  it('reports unknown documents', () => {
    const result = validateDocument({ document: { hello: 'world' }, file: '/tmp/x.json' });
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain('UNKNOWN_DOCUMENT_TYPE');
  });
});
