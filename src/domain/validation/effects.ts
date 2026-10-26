import { EFFECT_TYPES, isNonEmptyString, isRecord } from '../types.js';
import { ValidationCode, WarningCode } from './codes.js';
import type { IssueCollector } from './result.js';

const KNOWN_EFFECTS = new Set<string>(EFFECT_TYPES);

/**
 * Whether an `approval` descriptor is well-formed.
 *
 * Every field is optional, so the only hard requirement is that the
 * descriptor be an object; the field checks say whether a host reading it
 * would get what the names promise.
 */
const describeApprovalProblem = (approval: unknown): string | undefined => {
  if (!isRecord(approval)) return 'approval must be an object.';
  if (approval.reason !== undefined && typeof approval.reason !== 'string') {
    return 'approval.reason must be a string.';
  }
  if (
    approval.approvers !== undefined
    && (!Array.isArray(approval.approvers) || !approval.approvers.every(isNonEmptyString))
  ) {
    return 'approval.approvers must be an array of non-empty strings.';
  }
  if (
    approval.expiresInSeconds !== undefined
    && (typeof approval.expiresInSeconds !== 'number'
      || !Number.isFinite(approval.expiresInSeconds)
      || approval.expiresInSeconds <= 0)
  ) {
    return 'approval.expiresInSeconds must be a positive number.';
  }
  return undefined;
};

/**
 * Validates a rule-level effect (`effect`, `thenEffect`, `elseEffect`).
 *
 * Errors are limited to what the remote validator rejects — the effect must be
 * an object with a `type`, and a `custom` effect must carry a non-empty
 * `value` — so a bundle that validates locally also materialises remotely.
 *
 * Payload problems that the remote validator tolerates but that would produce
 * an unusable decision at runtime are reported as warnings, which `--strict`
 * promotes to failures.
 */
export const validateRuleEffect = (
  effect: unknown,
  path: string,
  issues: IssueCollector,
): void => {
  if (!isRecord(effect)) {
    issues.error(ValidationCode.InvalidRuleEffect, path, 'Effect must be an object.');
    return;
  }

  const {type} = effect;
  if (!isNonEmptyString(type)) {
    issues.error(ValidationCode.InvalidRuleEffect, `${path}.type`, 'Effect type is required.');
    return;
  }

  if (type === 'custom' && !isNonEmptyString(effect.value)) {
    issues.error(
      ValidationCode.InvalidRuleEffect,
      `${path}.value`,
      'A custom effect requires a non-empty "value".',
    );
    return;
  }

  if (!KNOWN_EFFECTS.has(type)) {
    issues.warn(
      WarningCode.UnknownEffectType,
      `${path}.type`,
      `Unknown effect type: "${type}". The runtime evaluates: ${EFFECT_TYPES.join(', ')}.`,
    );
    return;
  }

  if (type === 'kill_switch') {
    const {killSwitch} = effect;
    if (!isRecord(killSwitch) || !isNonEmptyString(killSwitch.service)) {
      issues.warn(
        WarningCode.IncompleteRuleEffect,
        `${path}.killSwitch.service`,
        'A kill_switch effect should declare "killSwitch.service".',
      );
    }
  }

  if (type === 'throttle') {
    const {throttle} = effect;
    if (
      !isRecord(throttle)
      || typeof throttle.limit !== 'number'
      || typeof throttle.windowSeconds !== 'number'
      || !isNonEmptyString(throttle.key)
    ) {
      issues.warn(
        WarningCode.IncompleteRuleEffect,
        `${path}.throttle`,
        'A throttle effect should declare numeric "limit" and "windowSeconds", plus a "key".',
      );
    }
  }

  // The descriptor is optional on a rule; when present, the runtime rejects
  // anything that is not an object, and the field checks are advisory.
  if (type === 'requires_approval' && effect.approval !== undefined) {
    const problem = describeApprovalProblem(effect.approval);
    if (problem !== undefined) {
      if (!isRecord(effect.approval)) {
        issues.error(ValidationCode.InvalidRuleEffect, `${path}.approval`, problem);
      } else {
        issues.warn(WarningCode.IncompleteRuleEffect, `${path}.approval`, problem);
      }
    }
  }
};

/** Validates `policy.defaults`, which is required on every runtime policy. */
export const validatePolicyDefaults = (
  defaults: unknown,
  path: string,
  issues: IssueCollector,
): void => {
  if (!isRecord(defaults)) {
    issues.error(
      ValidationCode.InvalidDefaultEffect,
      path,
      `defaults is required and must define one of: ${EFFECT_TYPES.join(', ')}.`,
    );
    return;
  }

  const {effect} = defaults;
  if (!isNonEmptyString(effect) || !KNOWN_EFFECTS.has(effect)) {
    issues.error(
      ValidationCode.InvalidDefaultEffect,
      `${path}.effect`,
      `defaults.effect must be one of: ${EFFECT_TYPES.join(', ')}.`,
    );
    return;
  }

  if (effect === 'kill_switch') {
    const {killSwitch} = defaults;
    if (!isRecord(killSwitch) || !isNonEmptyString(killSwitch.service)) {
      issues.error(
        ValidationCode.MissingKillSwitchService,
        `${path}.killSwitch.service`,
        'defaults.killSwitch.service is required when defaults.effect is kill_switch.',
      );
    }
  }

  if (effect === 'throttle') {
    const {throttle} = defaults;
    if (
      !isRecord(throttle)
      || typeof throttle.limit !== 'number'
      || typeof throttle.windowSeconds !== 'number'
      || !isNonEmptyString(throttle.key)
    ) {
      issues.error(
        ValidationCode.InvalidThrottleDefault,
        `${path}.throttle`,
        'defaults.throttle requires numeric "limit" and "windowSeconds", plus a "key".',
      );
    }
  }

  if (effect === 'custom' && !isNonEmptyString(defaults.customEffect)) {
    issues.error(
      ValidationCode.InvalidCustomDefault,
      `${path}.customEffect`,
      'defaults.customEffect must be a non-empty string when defaults.effect is custom.',
    );
  }

  if (effect === 'requires_approval' && defaults.approval !== undefined) {
    const problem = describeApprovalProblem(defaults.approval);
    if (problem !== undefined) {
      if (!isRecord(defaults.approval)) {
        issues.error(ValidationCode.InvalidApprovalDefault, `${path}.approval`, problem);
      } else {
        issues.warn(WarningCode.IncompleteRuleEffect, `${path}.approval`, problem);
      }
    }
  }
};
