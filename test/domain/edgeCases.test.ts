import { describe, expect, it } from '@jest/globals';
import { validateBundle } from '../../src/domain/validation/bundle.js';
import { validateDraft } from '../../src/domain/validation/draft.js';
import { summariseBundle, summariseDraft } from '../../src/domain/summary.js';
import { validBundle } from '../helpers/fixtures.js';

const errorCodes = (result: { issues: { errors: { code: string }[] } }): string[] => (
  result.issues.errors.map((issue) => issue.code)
);

const warningCodes = (result: { issues: { warnings: { code: string }[] } }): string[] => (
  result.issues.warnings.map((issue) => issue.code)
);

describe('bundle validation edge cases', () => {
  const withPolicies = (policies: unknown[]) => validateBundle({ ...validBundle(), policies });

  it('rejects policies and rules that are not objects', () => {
    expect(errorCodes(withPolicies(['nope']))).toContain('INVALID_POLICY');
    expect(errorCodes(withPolicies([{
      policyKey: 'p', activeVersion: 1, defaults: { effect: 'allow' }, rules: ['nope'],
    }]))).toContain('INVALID_RULE');
  });

  it('rejects rules that are not an array', () => {
    expect(errorCodes(withPolicies([{
      policyKey: 'p', activeVersion: 1, defaults: { effect: 'allow' }, rules: 'none',
    }]))).toContain('RULES_NOT_ARRAY');
  });

  it('validates thenEffect and elseEffect', () => {
    const result = withPolicies([{
      policyKey: 'p',
      activeVersion: 1,
      defaults: { effect: 'allow' },
      rules: [{
        id: 'r',
        priority: 1,
        target: { service: 's', resource: 'r', action: 'a' },
        effect: { type: 'allow' },
        when: { op: 'exists', path: 'ctx.a' },
        thenEffect: { type: 'custom' },
        elseEffect: 'deny',
      }],
    }]);

    expect(errorCodes(result).filter((code) => code === 'INVALID_RULE_EFFECT')).toHaveLength(2);
  });

  it('warns about an unexpected rule status', () => {
    const result = withPolicies([{
      policyKey: 'p',
      activeVersion: 1,
      defaults: { effect: 'allow' },
      rules: [{
        id: 'r',
        status: 'paused',
        priority: 1,
        target: { service: 's', resource: 'r', action: 'a' },
        effect: { type: 'allow' },
      }],
    }]);

    expect(warningCodes(result)).toContain('UNKNOWN_RULE_STATUS');
  });

  it('warns about an empty bundle and a missing generatedAt', () => {
    const bundle = validBundle();
    delete bundle.generatedAt;
    const result = validateBundle({ ...bundle, policies: [] });

    expect(warningCodes(result)).toEqual(expect.arrayContaining([
      'EMPTY_DOCUMENT',
      'MISSING_GENERATED_AT',
    ]));
  });

  it('rejects a target that is missing entirely', () => {
    expect(errorCodes(withPolicies([{
      policyKey: 'p',
      activeVersion: 1,
      defaults: { effect: 'allow' },
      rules: [{ id: 'r', priority: 1, effect: { type: 'allow' } }],
    }]))).toContain('INVALID_RULE_TARGET');
  });

  it('rejects a checksum that is not a string', () => {
    expect(errorCodes(validateBundle({ ...validBundle(), checksum: 42 })))
      .toContain('INVALID_CHECKSUM');
  });

  it('rejects a signature that is not an object', () => {
    expect(errorCodes(validateBundle({ ...validBundle(), signature: 'signed' })))
      .toContain('INVALID_SIGNATURE_METADATA');
  });
});

describe('draft validation edge cases', () => {
  it('rejects draft policies that are not objects', () => {
    expect(errorCodes(validateDraft({ schemaVersion: '1.0', policies: ['nope'] })))
      .toContain('INVALID_POLICY');
  });

  it('rejects duplicate policy keys and rule ids', () => {
    const rule = {
      id: 'r',
      status: 'active',
      priority: 1,
      target: { service: 's', resource: 'r', action: 'a' },
      effect: { type: 'allow' },
    };
    const policy = {
      policyKey: 'p', activeVersion: 1, defaults: { effect: 'allow' }, rules: [rule, rule],
    };

    const found = errorCodes(validateDraft({ schemaVersion: '1.0', policies: [policy, policy] }));
    expect(found).toContain('DUPLICATE_POLICY_KEY');
    expect(found).toContain('DUPLICATE_RULE_ID');
  });

  it('rejects invalid activeVersion, rules container and rule shape', () => {
    expect(errorCodes(validateDraft({
      schemaVersion: '1.0',
      policies: [{
        policyKey: 'p', activeVersion: '1', defaults: { effect: 'allow' }, rules: 'none',
      }],
    }))).toEqual(expect.arrayContaining(['INVALID_ACTIVE_VERSION', 'RULES_NOT_ARRAY']));

    expect(errorCodes(validateDraft({
      schemaVersion: '1.0',
      policies: [{
        policyKey: 'p', defaults: { effect: 'allow' }, rules: ['nope'],
      }],
    }))).toContain('INVALID_RULE');
  });

  it('validates conditions and effects inside draft rules', () => {
    const found = errorCodes(validateDraft({
      schemaVersion: '1.0',
      policies: [{
        policyKey: 'p',
        defaults: { effect: 'allow' },
        rules: [{
          id: 'r',
          priority: 'high',
          target: 'auth',
          effect: { type: 'custom' },
          when: { op: 'nope' },
          thenEffect: {},
          elseEffect: {},
        }],
      }],
    }));

    expect(found).toEqual(expect.arrayContaining([
      'INVALID_RULE_PRIORITY',
      'INVALID_RULE_TARGET',
      'INVALID_RULE_EFFECT',
      'UNSUPPORTED_CONDITION_OPERATOR',
    ]));
  });

  it('rejects a schemaVersion of the wrong type', () => {
    expect(errorCodes(validateDraft({ schemaVersion: true, policies: [] })))
      .toContain('INVALID_DRAFT_SCHEMA');
  });

  it('rejects documents that are not objects', () => {
    expect(errorCodes(validateDraft('nope'))).toContain('DOCUMENT_NOT_OBJECT');
  });

  it('warns about wildcard targets and empty draft documents', () => {
    const wildcard = validateDraft({
      schemaVersion: '1.0',
      drafts: [{
        target: { service: 'api', resource: '*', action: 'request' },
        suggestedPolicy: { rules: [{ id: 'r' }] },
      }],
    });
    expect(warningCodes(wildcard)).toContain('DYNAMIC_WILDCARD_TARGET');

    expect(warningCodes(validateDraft({ schemaVersion: '1.0', drafts: [] })))
      .toContain('EMPTY_DOCUMENT');
  });

  it('rejects analyze entries that are not objects', () => {
    expect(errorCodes(validateDraft({ schemaVersion: '1.0', drafts: ['nope'] })))
      .toContain('INVALID_DRAFT_ENTRY');
  });
});

describe('summary edge cases', () => {
  it('tolerates malformed documents', () => {
    expect(summariseBundle('nope').totals.policies).toBe(0);
    expect(summariseDraft('nope').totals.drafts).toBe(0);
  });

  it('ignores rules and targets that are incomplete', () => {
    const summary = summariseBundle({
      policies: [{
        policyKey: 'p',
        rules: ['nope', { target: { service: 'only-service' } }],
      }],
    });

    expect(summary.policies[0]?.targets).toEqual([]);
    expect(summary.policies[0]?.rules).toBe(2);
  });

  it('names a policy without a key', () => {
    expect(summariseBundle({ policies: [{}] }).policies[0]?.policyKey).toBe('(missing key)');
  });

  it('falls back to the draft id when no policy key is suggested', () => {
    const summary = summariseDraft({ schemaVersion: '1.0', drafts: [{ id: 'discovered' }, {}] });
    expect(summary.entries[0]?.key).toBe('discovered');
    expect(summary.entries[1]?.key).toBe('(unnamed draft)');
  });

  it('drops malformed source locations', () => {
    const summary = summariseDraft({
      schemaVersion: '1.0',
      drafts: [{ sources: ['nope', { line: 4 }, { file: 'a.js' }] }],
    });
    expect(summary.entries[0]?.sources).toEqual([{ file: 'a.js' }]);
  });
});
