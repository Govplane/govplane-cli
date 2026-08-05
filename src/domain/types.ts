/**
 * Document model shared by the Govplane CLI.
 *
 * The runtime bundle shape mirrors the contract enforced by the Govplane
 * control plane (`RuntimeBundleV1`) so that local validation stays in parity
 * with remote bundle materialisation.
 */

export const DOCUMENT_TYPES = ['bundle', 'draft', 'auto'] as const;
export type DocumentTypeOption = (typeof DOCUMENT_TYPES)[number];
export type DocumentType = 'bundle' | 'draft' | 'unknown';

export const ENVIRONMENTS = ['prod', 'staging', 'dev', 'test'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export const EFFECT_TYPES = ['allow', 'deny', 'kill_switch', 'throttle', 'custom'] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const COMPARISON_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export const LOGICAL_OPERATORS = ['and', 'or'] as const;
export const CONDITION_OPERATORS = [
  ...COMPARISON_OPERATORS,
  ...LOGICAL_OPERATORS,
  'not',
  'in',
  'exists',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface Target {
  service: string;
  resource: string;
  action: string;
}

export interface RuleEffect {
  type: EffectType | string;
  value?: string;
  killSwitch?: { service?: string; reason?: string };
  throttle?: { limit?: number; windowSeconds?: number; key?: string };
}

export interface PolicyDefaults {
  effect: EffectType | string;
  customEffect?: string;
  killSwitch?: { service?: string; reason?: string };
  throttle?: { limit?: number; windowSeconds?: number; key?: string };
}

export interface ConditionNode {
  op: string;
  path?: string;
  value?: unknown;
  values?: unknown[];
  conditions?: ConditionNode[];
  condition?: ConditionNode;
}

export interface RuntimeRule {
  id: string;
  priority: number;
  status?: 'active' | 'disabled' | string;
  target: Target;
  effect: RuleEffect;
  when?: ConditionNode;
  thenEffect?: RuleEffect;
  elseEffect?: RuleEffect;
  description?: string;
}

export interface RuntimePolicy {
  policyKey: string;
  activeVersion: number;
  friendlyName?: string;
  description?: string;
  status?: string;
  defaults: PolicyDefaults;
  rules: RuntimeRule[];
}

export interface BundleSignature {
  algorithm: string;
  keyId: string;
  value: string;
}

export interface RuntimeBundle {
  schemaVersion: number;
  orgId: string;
  projectId: string;
  env: string;
  generatedAt?: string;
  bundleVersion?: number;
  checksum?: string;
  etag?: string;
  signature?: BundleSignature;
  policies: RuntimePolicy[];
}

/** A draft entry as produced by `govplane analyze`. */
export interface AnalyzeDraftEntry {
  id?: string;
  status?: string;
  confidence?: string;
  target?: Partial<Target>;
  availableContext?: { key?: string; source?: string; type?: string }[];
  suggestedPolicy?: {
    policyKey?: string;
    friendlyName?: string;
    target?: Partial<Target>;
    rules?: unknown[];
  };
  sources?: { file?: string; line?: number; column?: number }[];
}

/** Build-ready draft document, the shape persisted by `govplane policies`. */
export interface PolicyDraftDocument {
  schemaVersion: number | string;
  generatedAt?: string;
  env?: string;
  policies?: RuntimePolicy[];
  drafts?: AnalyzeDraftEntry[];
}

export const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim() !== ''
);
