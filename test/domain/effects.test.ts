import { describe, expect, it } from '@jest/globals';
import { validatePolicyDefaults, validateRuleEffect } from '../../src/domain/validation/effects.js';
import {
  collectConditionPaths, validateCondition,
} from '../../src/domain/validation/conditions.js';
import { IssueCollector } from '../../src/domain/validation/result.js';

const inspect = (run: (issues: IssueCollector) => void) => {
  const issues = new IssueCollector();
  run(issues);
  return {
    errors: issues.errors.map((issue) => issue.code),
    warnings: issues.warnings.map((issue) => issue.code),
  };
};

describe('validateRuleEffect', () => {
  it('accepts every supported effect', () => {
    const effects = [
      { type: 'allow' },
      { type: 'deny' },
      { type: 'custom', value: 'quarantine' },
      { type: 'kill_switch', killSwitch: { service: 'payments' } },
      { type: 'throttle', throttle: { limit: 10, windowSeconds: 60, key: 'ip' } },
    ];

    effects.forEach((effect) => {
      const result = inspect((issues) => validateRuleEffect(effect, '$.effect', issues));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  it('requires an object with a type', () => {
    expect(inspect((issues) => validateRuleEffect('deny', '$.effect', issues)).errors)
      .toEqual(['INVALID_RULE_EFFECT']);
    expect(inspect((issues) => validateRuleEffect({}, '$.effect', issues)).errors)
      .toEqual(['INVALID_RULE_EFFECT']);
  });

  it('requires a value for custom effects', () => {
    expect(inspect((issues) => validateRuleEffect({ type: 'custom' }, '$.effect', issues)).errors)
      .toEqual(['INVALID_RULE_EFFECT']);
  });

  it('warns — rather than fails — on effects the remote validator accepts', () => {
    expect(inspect((issues) => validateRuleEffect({ type: 'quarantine' }, '$.effect', issues)))
      .toEqual({ errors: [], warnings: ['UNKNOWN_EFFECT_TYPE'] });

    expect(inspect((issues) => validateRuleEffect({ type: 'kill_switch' }, '$.effect', issues)))
      .toEqual({ errors: [], warnings: ['INCOMPLETE_RULE_EFFECT'] });

    expect(inspect((issues) => validateRuleEffect(
      { type: 'throttle', throttle: { limit: 'ten' } },
      '$.effect',
      issues,
    ))).toEqual({ errors: [], warnings: ['INCOMPLETE_RULE_EFFECT'] });
  });
});

describe('validatePolicyDefaults', () => {
  it('accepts every supported default', () => {
    const defaults = [
      { effect: 'allow' },
      { effect: 'deny' },
      { effect: 'custom', customEffect: 'quarantine' },
      { effect: 'kill_switch', killSwitch: { service: 'payments' } },
      { effect: 'throttle', throttle: { limit: 10, windowSeconds: 60, key: 'ip' } },
    ];

    defaults.forEach((entry) => {
      expect(inspect((issues) => validatePolicyDefaults(entry, '$.defaults', issues)).errors)
        .toEqual([]);
    });
  });

  it('rejects missing or unsupported defaults', () => {
    expect(inspect((issues) => validatePolicyDefaults(null, '$.defaults', issues)).errors)
      .toEqual(['INVALID_DEFAULT_EFFECT']);
    expect(inspect((issues) => validatePolicyDefaults({ effect: 42 }, '$.defaults', issues)).errors)
      .toEqual(['INVALID_DEFAULT_EFFECT']);
  });

  it('rejects incomplete kill_switch and throttle payloads', () => {
    expect(inspect((issues) => validatePolicyDefaults(
      { effect: 'kill_switch', killSwitch: {} },
      '$.defaults',
      issues,
    )).errors).toEqual(['MISSING_KILL_SWITCH_SERVICE']);

    expect(inspect((issues) => validatePolicyDefaults(
      { effect: 'throttle', throttle: { limit: 10, windowSeconds: 60 } },
      '$.defaults',
      issues,
    )).errors).toEqual(['INVALID_THROTTLE_DEFAULT']);
  });
});

describe('validateCondition', () => {
  it('accepts nested logical conditions', () => {
    const condition = {
      op: 'and',
      conditions: [
        { op: 'not', condition: { op: 'exists', path: 'ctx.userId' } },
        { op: 'or', conditions: [{ op: 'in', path: 'ctx.plan', values: ['pro'] }] },
        { op: 'eq', path: 'ctx.enabled', value: true },
        { op: 'neq', path: 'ctx.region', value: null },
      ],
    };
    expect(inspect((issues) => validateCondition(condition, '$.when', issues)).errors).toEqual([]);
  });

  it('suggests the canonical operator for legacy aliases', () => {
    const issues = new IssueCollector();
    validateCondition({ op: 'ne', path: 'a', value: 1 }, '$.when', issues);
    expect(issues.errors[0]?.message).toContain('Use "neq" instead');
  });

  it('flags legacy args and arg shapes', () => {
    expect(inspect((issues) => validateCondition({ op: 'and', args: [] }, '$.when', issues)))
      .toEqual({ errors: ['INVALID_CONDITION_AST'], warnings: ['DEPRECATED_OPERATOR'] });

    expect(inspect((issues) => validateCondition(
      { op: 'not', arg: { op: 'exists', path: 'a' } },
      '$.when',
      issues,
    ))).toEqual({ errors: ['INVALID_CONDITION_AST'], warnings: ['DEPRECATED_OPERATOR'] });
  });

  it('requires op to be a string', () => {
    expect(inspect((issues) => validateCondition({ op: 5 }, '$.when', issues)).errors)
      .toEqual(['INVALID_CONDITION_AST']);
  });

  it('validates children of logical operators', () => {
    expect(inspect((issues) => validateCondition(
      { op: 'and', conditions: [{ op: 'nope' }] },
      '$.when',
      issues,
    )).errors).toEqual(['UNSUPPORTED_CONDITION_OPERATOR']);
  });
});

describe('collectConditionPaths', () => {
  it('walks the whole tree', () => {
    const paths = new Set<string>();
    collectConditionPaths({
      op: 'and',
      conditions: [
        { op: 'eq', path: 'ctx.a', value: 1 },
        { op: 'not', condition: { op: 'exists', path: 'ctx.b' } },
      ],
    }, paths);

    expect([...paths].sort()).toEqual(['ctx.a', 'ctx.b']);
  });

  it('ignores nodes that are not objects', () => {
    const paths = new Set<string>();
    collectConditionPaths('nope', paths);
    expect(paths.size).toBe(0);
  });
});
