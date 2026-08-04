import { EFFECT_TYPES, isNonEmptyString, isRecord } from '../types.js';
import { ValidationCode, WarningCode } from './codes.js';
import type { IssueCollector } from './result.js';

const KNOWN_EFFECTS = new Set<string>(EFFECT_TYPES);

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
};
