import { ENVIRONMENTS, isNonEmptyString, isRecord } from '../types.js';
import { ValidationCode, WarningCode } from './codes.js';
import { validateCondition } from './conditions.js';
import { validatePolicyDefaults, validateRuleEffect } from './effects.js';
import { IssueCollector, indexPath, type ValidationStats } from './result.js';

const validateDraftRule = (
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
    issues.error(ValidationCode.DuplicateRuleId, `${path}.id`, `Duplicate rule id: "${rule.id}"`);
  } else {
    seenRuleIds.add(rule.id);
  }

  const {status} = rule;
  if (status !== undefined && status !== 'active' && status !== 'disabled') {
    issues.error(
      ValidationCode.InvalidRuleStatus,
      `${path}.status`,
      'status must be "active" or "disabled".',
    );
  }

  if (typeof rule.priority !== 'number' || Number.isNaN(rule.priority)) {
    issues.error(
      ValidationCode.InvalidRulePriority,
      `${path}.priority`,
      'priority must be a number.',
    );
  }

  const {target} = rule;
  if (!isRecord(target)) {
    issues.error(ValidationCode.InvalidRuleTarget, `${path}.target`, 'target is required.');
  } else {
    (['service', 'resource', 'action'] as const).forEach((field) => {
      if (!isNonEmptyString(target[field])) {
        issues.error(
          ValidationCode.InvalidRuleTarget,
          `${path}.target.${field}`,
          `target.${field} is required.`,
        );
      }
    });
  }

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

const validateBuildReadyPolicies = (
  policies: unknown[],
  issues: IssueCollector,
): number => {
  const seenPolicyKeys = new Set<string>();

  return policies.reduce<number>((total, policy, index) => {
    const path = indexPath('$.policies', index);
    if (!isRecord(policy)) {
      issues.error(ValidationCode.InvalidPolicy, path, 'Policy must be an object.');
      return total;
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

    if (policy.activeVersion !== undefined && typeof policy.activeVersion !== 'number') {
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
      return total;
    }

    const seenRuleIds = new Set<string>();
    rules.forEach((rule, ruleIndex) => {
      validateDraftRule(rule, indexPath(`${path}.rules`, ruleIndex), issues, seenRuleIds);
    });

    return total + rules.length;
  }, 0);
};

const validateAnalyzeDrafts = (drafts: unknown[], issues: IssueCollector): void => {
  drafts.forEach((draft, index) => {
    const path = indexPath('$.drafts', index);
    if (!isRecord(draft)) {
      issues.error(ValidationCode.InvalidDraftEntry, path, 'Draft entry must be an object.');
      return;
    }

    const {target} = draft;
    if (!isRecord(target)) {
      issues.error(ValidationCode.MissingDraftTarget, `${path}.target`, 'target is required.');
    } else {
      (['service', 'resource', 'action'] as const).forEach((field) => {
        if (!isNonEmptyString(target[field])) {
          issues.error(
            ValidationCode.MissingDraftTarget,
            `${path}.target.${field}`,
            `target.${field} is required.`,
          );
        }
      });
    }

    const suggested = draft.suggestedPolicy;
    const hasRules = isRecord(suggested)
      && Array.isArray(suggested.rules)
      && suggested.rules.length > 0;
    if (!hasRules) {
      issues.warn(
        WarningCode.IncompleteDraft,
        `${path}.suggestedPolicy.rules`,
        'Draft has no rules yet; complete it before building a bundle.',
      );
    }

    if (isRecord(target) && target.resource === '*') {
      issues.warn(
        WarningCode.DynamicWildcardTarget,
        `${path}.target.resource`,
        'Draft target resolves to the wildcard resource ("*").',
      );
    }
  });
};

export interface DraftValidation {
  issues: IssueCollector;
  stats: ValidationStats;
}

/**
 * Validates a policy draft document.
 *
 * Two shapes are accepted, as documented for the toolkit workflow:
 *   - build-ready drafts, keyed by `policies`
 *   - analyze-generated drafts, keyed by `drafts`
 */
export const validateDraft = (document: unknown): DraftValidation => {
  const issues = new IssueCollector();
  const stats: ValidationStats = { policies: 0, rules: 0 };

  if (!isRecord(document)) {
    issues.error(ValidationCode.DocumentNotObject, '$', 'Document must be a JSON object.');
    return { issues, stats };
  }

  const {schemaVersion} = document;
  if (schemaVersion === undefined) {
    issues.error(
      ValidationCode.InvalidDraftSchema,
      '$.schemaVersion',
      'schemaVersion is required.',
    );
  } else if (typeof schemaVersion === 'number' || typeof schemaVersion === 'string') {
    stats.schemaVersion = schemaVersion;
  } else {
    issues.error(
      ValidationCode.InvalidDraftSchema,
      '$.schemaVersion',
      'schemaVersion must be a string or a number.',
    );
  }

  const {env} = document;
  if (env !== undefined) {
    if (!isNonEmptyString(env) || !(ENVIRONMENTS as readonly string[]).includes(env)) {
      issues.error(ValidationCode.InvalidEnv, '$.env', `env must be one of: ${ENVIRONMENTS.join(', ')}.`);
    } else {
      stats.env = env;
    }
  }

  const {policies} = document;
  const {drafts} = document;

  if (Array.isArray(policies)) {
    stats.policies = policies.length;
    stats.rules = validateBuildReadyPolicies(policies, issues);
    if (policies.length === 0) {
      issues.warn(WarningCode.EmptyDocument, '$.policies', 'Draft does not contain any policy.');
    }
    return { issues, stats };
  }

  if (Array.isArray(drafts)) {
    stats.policies = drafts.length;
    validateAnalyzeDrafts(drafts, issues);
    if (drafts.length === 0) {
      issues.warn(
        WarningCode.EmptyDocument,
        '$.drafts',
        'Draft document does not contain any entry.',
      );
    }
    return { issues, stats };
  }

  if (policies !== undefined) {
    issues.error(ValidationCode.PoliciesNotArray, '$.policies', 'policies must be an array.');
  } else if (drafts !== undefined) {
    issues.error(ValidationCode.DraftsNotArray, '$.drafts', 'drafts must be an array.');
  } else {
    issues.error(
      ValidationCode.InvalidDraftSchema,
      '$',
      'Draft document must contain a "policies" array or a "drafts" array.',
    );
  }

  return { issues, stats };
};
