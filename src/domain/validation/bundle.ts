import { isDeterministicallyOrdered, verifyChecksum } from '../canonical.js';
import { ENVIRONMENTS, isNonEmptyString, isRecord } from '../types.js';
import { ValidationCode, WarningCode } from './codes.js';
import { validateCondition } from './conditions.js';
import { validatePolicyDefaults, validateRuleEffect } from './effects.js';
import { IssueCollector, indexPath, type ValidationStats } from './result.js';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const isIsoTimestamp = (value: unknown): boolean => (
  typeof value === 'string' && ISO_8601.test(value) && !Number.isNaN(Date.parse(value))
);

const validateTarget = (rule: Record<string, unknown>, path: string, issues: IssueCollector) => {
  const {target} = rule;
  if (!isRecord(target)) {
    issues.error(ValidationCode.InvalidRuleTarget, `${path}.target`, 'target is required.');
    return;
  }
  (['service', 'resource', 'action'] as const).forEach((field) => {
    if (!isNonEmptyString(target[field])) {
      issues.error(
        ValidationCode.InvalidRuleTarget,
        `${path}.target.${field}`,
        `target.${field} is required.`,
      );
    }
  });
  if (target.resource === '*') {
    issues.warn(
      WarningCode.BroadResourceWildcard,
      `${path}.target.resource`,
      'Rule targets every resource ("*"). Narrow the target when possible.',
    );
  }
};

const validateRule = (
  rule: unknown,
  path: string,
  issues: IssueCollector,
  seenRuleIds: Set<string>,
): void => {
  if (!isRecord(rule)) {
    issues.error(ValidationCode.InvalidRule, path, 'Rule must be an object.');
    return;
  }

  if (!isNonEmptyString(rule.id)) {
    issues.error(ValidationCode.MissingRuleId, `${path}.id`, 'id is required.');
  } else if (seenRuleIds.has(rule.id)) {
    issues.error(
      ValidationCode.DuplicateRuleId,
      `${path}.id`,
      `Duplicate rule id: "${rule.id}"`,
    );
  } else {
    seenRuleIds.add(rule.id);
  }

  if (typeof rule.priority !== 'number' || Number.isNaN(rule.priority)) {
    issues.error(ValidationCode.InvalidRulePriority, `${path}.priority`, 'priority must be a number.');
  }

  const {status} = rule;
  if (status !== undefined && status !== 'active' && status !== 'disabled') {
    issues.warn(
      WarningCode.UnknownRuleStatus,
      `${path}.status`,
      'status should be "active" or "disabled".',
    );
  }

  validateTarget(rule, path, issues);
  validateRuleEffect(rule.effect, `${path}.effect`, issues);

  if (rule.when !== undefined) {
    validateCondition(rule.when, `${path}.when`, issues);
  }
  if (rule.thenEffect !== undefined) {
    validateRuleEffect(rule.thenEffect, `${path}.thenEffect`, issues);
  }
  if (rule.elseEffect !== undefined) {
    validateRuleEffect(rule.elseEffect, `${path}.elseEffect`, issues);
  }
};

const validatePolicy = (
  policy: unknown,
  path: string,
  issues: IssueCollector,
  seenPolicyKeys: Set<string>,
): number => {
  if (!isRecord(policy)) {
    issues.error(ValidationCode.InvalidPolicy, path, 'Policy must be an object.');
    return 0;
  }

  const {policyKey} = policy;
  if (!isNonEmptyString(policyKey)) {
    issues.error(ValidationCode.MissingPolicyKey, `${path}.policyKey`, 'policyKey is required.');
  } else if (seenPolicyKeys.has(policyKey)) {
    issues.error(
      ValidationCode.DuplicatePolicyKey,
      `${path}.policyKey`,
      `Duplicate policy key: "${policyKey}"`,
    );
  } else {
    seenPolicyKeys.add(policyKey);
  }

  if (typeof policy.activeVersion !== 'number') {
    issues.error(
      ValidationCode.InvalidActiveVersion,
      `${path}.activeVersion`,
      'activeVersion must be a number.',
    );
  }

  validatePolicyDefaults(policy.defaults, `${path}.defaults`, issues);

  const {rules} = policy;
  if (!Array.isArray(rules)) {
    issues.error(ValidationCode.RulesNotArray, `${path}.rules`, 'rules must be an array.');
    return 0;
  }

  if (rules.length === 0) {
    issues.warn(
      WarningCode.PolicyWithoutRules,
      `${path}.rules`,
      'Policy has no rules; only its default effect can ever apply.',
    );
  }

  const seenRuleIds = new Set<string>();
  rules.forEach((rule, index) => {
    validateRule(rule, indexPath(`${path}.rules`, index), issues, seenRuleIds);
  });

  return rules.length;
};

const validateIntegrityMetadata = (
  bundle: Record<string, unknown>,
  issues: IssueCollector,
): void => {
  const {generatedAt} = bundle;
  if (generatedAt === undefined) {
    issues.warn(
      WarningCode.MissingGeneratedAt,
      '$.generatedAt',
      'generatedAt is missing; runtime tooling uses it to order bundle revisions.',
    );
  } else if (!isIsoTimestamp(generatedAt)) {
    issues.error(
      ValidationCode.InvalidGeneratedAt,
      '$.generatedAt',
      'generatedAt must be a valid ISO-8601 timestamp.',
    );
  }

  const {bundleVersion} = bundle;
  // A revision counter, not a schema version: the control plane increments it on
  // every materialisation, so a long-lived bundle is routinely at 7 or 40.
  // Pinning it to 1 would reject every real bundle after its first revision.
  if (bundleVersion !== undefined
    && (typeof bundleVersion !== 'number'
      || !Number.isInteger(bundleVersion)
      || bundleVersion < 1)) {
    issues.error(
      ValidationCode.InvalidBundleVersion,
      '$.bundleVersion',
      'bundleVersion must be a whole number of 1 or more.',
    );
  }

  const {checksum} = bundle;
  if (checksum !== undefined) {
    if (!isNonEmptyString(checksum)) {
      issues.error(
        ValidationCode.InvalidChecksum,
        '$.checksum',
        'checksum must be a non-empty string.',
      );
    } else {
      const comparison = verifyChecksum(bundle, checksum);
      if (!comparison.matches) {
        issues.error(
          ValidationCode.ChecksumMismatch,
          '$.checksum',
          `Checksum does not match the canonical bundle payload. Expected ${comparison.actual}.`,
        );
      }
    }
  }

  const {signature} = bundle;
  if (signature === undefined) {
    issues.warn(
      WarningCode.UnsignedBundle,
      '$.signature',
      'Bundle is not signed. Signature metadata is required for Isolated Mode.',
    );
  } else if (!isRecord(signature)) {
    issues.error(
      ValidationCode.InvalidSignatureMetadata,
      '$.signature',
      'signature must be an object.',
    );
  } else {
    (['algorithm', 'keyId', 'value'] as const).forEach((field) => {
      if (!isNonEmptyString(signature[field])) {
        issues.error(
          ValidationCode.InvalidSignatureMetadata,
          `$.signature.${field}`,
          `signature.${field} is required.`,
        );
      }
    });
  }

  if (!isDeterministicallyOrdered(bundle)) {
    issues.warn(
      WarningCode.NonDeterministicOrder,
      '$.policies',
      'Policies and rules are not in canonical order (policies by policyKey ascending, '
        + 'rules by priority descending then id ascending).',
    );
  }
};

export interface BundleValidation {
  issues: IssueCollector;
  stats: ValidationStats;
}

/**
 * Whether `orgId` and `projectId` are required.
 *
 * `required` is the cloud-compatible profile: a bundle the control plane
 * materialises always carries its scope. `optional` is the local-first profile
 * used by `govplane build`, where a developer can compile a bundle before
 * deciding which organisation and project it belongs to.
 */
export type BundleScope = 'required' | 'optional';

export interface ValidateBundleOptions {
  /**
   * Defaults to `required`, so a caller that says nothing gets the stricter
   * answer. `validateDocument` infers it per document instead.
   */
  scope?: BundleScope;
}

/**
 * Validates a runtime bundle.
 *
 * Stages mirror the remote materialisation path: structural schema checks,
 * Condition AST checks, and materialisation metadata checks.
 */
export const validateBundle = (
  document: unknown,
  options: ValidateBundleOptions = {},
): BundleValidation => {
  const issues = new IssueCollector();
  const stats: ValidationStats = { policies: 0, rules: 0 };

  if (!isRecord(document)) {
    issues.error(ValidationCode.DocumentNotObject, '$', 'Document must be a JSON object.');
    return { issues, stats };
  }

  const {schemaVersion} = document;
  if (typeof schemaVersion === 'number' || typeof schemaVersion === 'string') {
    stats.schemaVersion = schemaVersion;
  }
  if (typeof document.env === 'string') {
    stats.env = document.env;
  }

  if (document.schemaVersion !== 1) {
    issues.error(
      ValidationCode.InvalidSchemaVersion,
      '$.schemaVersion',
      'schemaVersion must be the number 1.',
    );
  }

  const scopeOptional = options.scope === 'optional';
  (['orgId', 'projectId', 'env'] as const).forEach((field) => {
    if (isNonEmptyString(document[field])) {
      return;
    }
    // `env` is required in both profiles: the runtime selects a bundle by it.
    if (scopeOptional && field !== 'env') {
      issues.warn(
        WarningCode.MissingScopeFields,
        `$.${field}`,
        `${field} is not set. Isolated Mode checks the bundle scope, so a bundle `
          + 'without it cannot be used there.',
      );
      return;
    }
    issues.error(
      ValidationCode.MissingScopeFields,
      `$.${field}`,
      `${field} is required.`,
    );
  });

  const {env} = document;
  if (isNonEmptyString(env) && !(ENVIRONMENTS as readonly string[]).includes(env)) {
    issues.error(
      ValidationCode.InvalidEnv,
      '$.env',
      `env must be one of: ${ENVIRONMENTS.join(', ')}.`,
    );
  }

  const {policies} = document;
  if (!Array.isArray(policies)) {
    issues.error(ValidationCode.PoliciesNotArray, '$.policies', 'policies must be an array.');
    return { issues, stats };
  }

  stats.policies = policies.length;
  if (policies.length === 0) {
    issues.warn(WarningCode.EmptyDocument, '$.policies', 'Bundle does not contain any policy.');
  }

  const seenPolicyKeys = new Set<string>();
  stats.rules = policies.reduce<number>((total, policy, index) => (
    total + validatePolicy(policy, indexPath('$.policies', index), issues, seenPolicyKeys)
  ), 0);

  validateIntegrityMetadata(document, issues);

  return { issues, stats };
};
