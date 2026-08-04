import {
  COMPARISON_OPERATORS, CONDITION_OPERATORS, LOGICAL_OPERATORS, isNonEmptyString, isRecord,
} from '../types.js';
import { ValidationCode, WarningCode } from './codes.js';
import type { IssueCollector } from './result.js';

const COMPARISON = new Set<string>(COMPARISON_OPERATORS);
const LOGICAL = new Set<string>(LOGICAL_OPERATORS);
const SUPPORTED = new Set<string>(CONDITION_OPERATORS);

/** Operators accepted by older runtimes, kept only to produce a helpful message. */
const LEGACY_ALIASES: Record<string, string> = { ne: 'neq' };

const isScalar = (value: unknown): boolean => (
  value === null
  || typeof value === 'string'
  || typeof value === 'number'
  || typeof value === 'boolean'
);

/**
 * Validates a Condition AST node, mirroring the remote validator used during
 * bundle materialisation.
 *
 * Unlike the remote validator — which throws on the first violation — every
 * problem is collected so the CLI can report a complete list.
 */
export const validateCondition = (
  node: unknown,
  path: string,
  issues: IssueCollector,
): void => {
  if (!isRecord(node)) {
    issues.error(ValidationCode.InvalidConditionAst, path, 'Condition must be an object.');
    return;
  }

  const { op } = node;
  if (typeof op !== 'string') {
    issues.error(ValidationCode.InvalidConditionAst, `${path}.op`, 'op must be a string.');
    return;
  }

  if (!SUPPORTED.has(op)) {
    const alias = LEGACY_ALIASES[op];
    issues.error(
      ValidationCode.UnsupportedConditionOperator,
      `${path}.op`,
      alias === undefined
        ? `Unsupported operator: "${op}"`
        : `Unsupported operator: "${op}". Use "${alias}" instead.`,
    );
    return;
  }

  if (COMPARISON.has(op)) {
    if (!isNonEmptyString(node.path)) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.path`,
        `path must be a non-empty string (op=${op}).`,
      );
    }
    if (!isScalar(node.value)) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.value`,
        `value must be a scalar: string, number, boolean or null (op=${op}).`,
      );
    }
    return;
  }

  if (LOGICAL.has(op)) {
    const {conditions} = node;
    if (!Array.isArray(conditions) || conditions.length === 0) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.conditions`,
        `conditions must be a non-empty array (op=${op}).`,
      );
      if (Array.isArray(node.args)) {
        issues.warn(
          WarningCode.DeprecatedOperator,
          `${path}.args`,
          'Legacy "args" is not part of the supported Condition AST. Rename it to "conditions".',
        );
      }
      return;
    }
    conditions.forEach((child, index) => {
      validateCondition(child, `${path}.conditions[${index}]`, issues);
    });
    return;
  }

  if (op === 'not') {
    if (node.condition === undefined) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.condition`,
        'not requires a "condition" node.',
      );
      if (node.arg !== undefined) {
        issues.warn(
          WarningCode.DeprecatedOperator,
          `${path}.arg`,
          'Legacy "arg" is not part of the supported Condition AST. Rename it to "condition".',
        );
      }
      return;
    }
    validateCondition(node.condition, `${path}.condition`, issues);
    return;
  }

  if (op === 'in') {
    if (!isNonEmptyString(node.path)) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.path`,
        'path must be a non-empty string (op=in).',
      );
    }
    const {values} = node;
    if (!Array.isArray(values) || values.length === 0) {
      issues.error(
        ValidationCode.InvalidConditionAst,
        `${path}.values`,
        'values must be a non-empty array (op=in).',
      );
    }
    return;
  }

  // op === 'exists'
  if (!isNonEmptyString(node.path)) {
    issues.error(
      ValidationCode.InvalidConditionAst,
      `${path}.path`,
      'path must be a non-empty string (op=exists).',
    );
  }
};

/** Collects every `path` referenced by a condition tree, for context reporting. */
export const collectConditionPaths = (node: unknown, into: Set<string>): void => {
  if (!isRecord(node)) {
    return;
  }
  if (isNonEmptyString(node.path)) {
    into.add(node.path);
  }
  const {conditions} = node;
  if (Array.isArray(conditions)) {
    conditions.forEach((child) => collectConditionPaths(child, into));
  }
  if (node.condition !== undefined) {
    collectConditionPaths(node.condition, into);
  }
};
