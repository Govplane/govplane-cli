import { etagFromChecksum, verifyChecksum } from './canonical.js';
import { collectConditionPaths } from './validation/conditions.js';
import { isNonEmptyString, isRecord } from './types.js';

export interface TargetSummary {
  service: string;
  resource: string;
  action: string;
}

export interface PolicySummary {
  policyKey: string;
  friendlyName?: string;
  activeVersion?: number;
  defaultsEffect?: string;
  status: 'active' | 'disabled';
  rules: number;
  targets: TargetSummary[];
  contextFields: string[];
}

export interface BundleSummary {
  schemaVersion?: number | string;
  orgId?: string;
  projectId?: string;
  env?: string;
  generatedAt?: string;
  bundleVersion?: number;
  checksum?: string;
  checksumMatches?: boolean;
  etag?: string;
  signature?: { algorithm: string; keyId: string };
  totals: {
    policies: number;
    activePolicies: number;
    disabledPolicies: number;
    rules: number;
  };
  policies: PolicySummary[];
}

export const formatTarget = (target: TargetSummary): string => (
  `${target.service} / ${target.resource} / ${target.action}`
);

const readTarget = (value: unknown): TargetSummary | null => {
  if (!isRecord(value)) {
    return null;
  }
  const {service} = value;
  const {resource} = value;
  const {action} = value;
  if (!isNonEmptyString(service) || !isNonEmptyString(resource) || !isNonEmptyString(action)) {
    return null;
  }
  return { service, resource, action };
};

/** Context paths are stored with an optional `ctx.` prefix; reporting strips it. */
const normaliseContextField = (path: string): string => (
  path.startsWith('ctx.') ? path.slice(4) : path
);

const summarisePolicy = (policy: unknown): PolicySummary => {
  const entry = isRecord(policy) ? policy : {};
  const rules = Array.isArray(entry.rules) ? entry.rules : [];
  const targets = new Map<string, TargetSummary>();
  const contextPaths = new Set<string>();

  rules.forEach((rule) => {
    if (!isRecord(rule)) {
      return;
    }
    const target = readTarget(rule.target);
    if (target) {
      targets.set(formatTarget(target), target);
    }
    if (rule.when !== undefined) {
      collectConditionPaths(rule.when, contextPaths);
    }
  });

  const {defaults} = entry;
  const {friendlyName} = entry;
  const {activeVersion} = entry;

  return {
    policyKey: isNonEmptyString(entry.policyKey) ? entry.policyKey : '(missing key)',
    ...(isNonEmptyString(friendlyName) ? { friendlyName } : {}),
    ...(typeof activeVersion === 'number' ? { activeVersion } : {}),
    ...(isRecord(defaults) && isNonEmptyString(defaults.effect)
      ? { defaultsEffect: defaults.effect }
      : {}),
    status: entry.status === 'disabled' ? 'disabled' : 'active',
    rules: rules.length,
    targets: [...targets.values()],
    contextFields: [...contextPaths].map(normaliseContextField).sort(),
  };
};

export const summariseBundle = (document: unknown): BundleSummary => {
  const bundle = isRecord(document) ? document : {};
  const policies = Array.isArray(bundle.policies) ? bundle.policies : [];
  const summaries = policies.map(summarisePolicy);

  const {schemaVersion} = bundle;
  const {generatedAt} = bundle;
  const {bundleVersion} = bundle;
  const {checksum} = bundle;
  const {signature} = bundle;

  const summary: BundleSummary = {
    ...(typeof schemaVersion === 'number' || typeof schemaVersion === 'string'
      ? { schemaVersion }
      : {}),
    ...(isNonEmptyString(bundle.orgId) ? { orgId: bundle.orgId } : {}),
    ...(isNonEmptyString(bundle.projectId) ? { projectId: bundle.projectId } : {}),
    ...(isNonEmptyString(bundle.env) ? { env: bundle.env } : {}),
    ...(isNonEmptyString(generatedAt) ? { generatedAt } : {}),
    ...(typeof bundleVersion === 'number' ? { bundleVersion } : {}),
    totals: {
      policies: summaries.length,
      activePolicies: summaries.filter((policy) => policy.status === 'active').length,
      disabledPolicies: summaries.filter((policy) => policy.status === 'disabled').length,
      rules: summaries.reduce((total, policy) => total + policy.rules, 0),
    },
    policies: summaries,
  };

  if (isNonEmptyString(checksum)) {
    summary.checksum = checksum;
    summary.checksumMatches = verifyChecksum(bundle, checksum).matches;
    summary.etag = etagFromChecksum(checksum);
  }

  if (
    isRecord(signature)
    && isNonEmptyString(signature.algorithm)
    && isNonEmptyString(signature.keyId)
  ) {
    summary.signature = { algorithm: signature.algorithm, keyId: signature.keyId };
  }

  return summary;
};

export interface DraftEntrySummary {
  key: string;
  targets: TargetSummary[];
  status: 'complete' | 'incomplete';
  draftStatus?: string;
  confidence?: string;
  rules: number;
  contextFields: string[];
  sources: { file: string; line?: number; column?: number }[];
}

export interface DraftSummary {
  schemaVersion?: number | string;
  generatedAt?: string;
  env?: string;
  shape: 'build-ready' | 'analyze';
  totals: { drafts: number; complete: number; incomplete: number; rules: number };
  entries: DraftEntrySummary[];
}

const summariseAnalyzeEntry = (draft: unknown): DraftEntrySummary => {
  const entry = isRecord(draft) ? draft : {};
  const suggested = isRecord(entry.suggestedPolicy) ? entry.suggestedPolicy : {};
  const rules = Array.isArray(suggested.rules) ? suggested.rules : [];
  const target = readTarget(entry.target);
  const availableContext = Array.isArray(entry.availableContext)
    ? entry.availableContext
    : [];
  const sources = Array.isArray(entry.sources) ? entry.sources : [];

  const key = isNonEmptyString(suggested.policyKey)
    ? suggested.policyKey
    : (isNonEmptyString(entry.id) ? entry.id : '(unnamed draft)');

  return {
    key,
    targets: target ? [target] : [],
    status: rules.length > 0 ? 'complete' : 'incomplete',
    ...(isNonEmptyString(entry.status) ? { draftStatus: entry.status } : {}),
    ...(isNonEmptyString(entry.confidence) ? { confidence: entry.confidence } : {}),
    rules: rules.length,
    contextFields: availableContext
      .map((field) => (isRecord(field) && isNonEmptyString(field.key) ? field.key : null))
      .filter((field): field is string => field !== null)
      .sort(),
    sources: sources
      .map((source) => {
        if (!isRecord(source) || !isNonEmptyString(source.file)) {
          return null;
        }
        return {
          file: source.file,
          ...(typeof source.line === 'number' ? { line: source.line } : {}),
          ...(typeof source.column === 'number' ? { column: source.column } : {}),
        };
      })
      .filter((source): source is DraftEntrySummary['sources'][number] => source !== null),
  };
};

const summariseBuildReadyEntry = (policy: unknown): DraftEntrySummary => {
  const summary = summarisePolicy(policy);
  const entry = isRecord(policy) ? policy : {};
  const hasDefaults = isRecord(entry.defaults) && isNonEmptyString(entry.defaults.effect);

  return {
    key: summary.policyKey,
    targets: summary.targets,
    status: summary.rules > 0 && hasDefaults ? 'complete' : 'incomplete',
    rules: summary.rules,
    contextFields: summary.contextFields,
    sources: [],
  };
};

export const summariseDraft = (document: unknown): DraftSummary => {
  const draft = isRecord(document) ? document : {};
  const analyzeEntries = Array.isArray(draft.drafts) ? draft.drafts : null;
  const policyEntries = Array.isArray(draft.policies) ? draft.policies : null;

  const entries = analyzeEntries !== null
    ? analyzeEntries.map(summariseAnalyzeEntry)
    : (policyEntries ?? []).map(summariseBuildReadyEntry);

  const {schemaVersion} = draft;
  const {generatedAt} = draft;

  return {
    ...(typeof schemaVersion === 'number' || typeof schemaVersion === 'string'
      ? { schemaVersion }
      : {}),
    ...(isNonEmptyString(generatedAt) ? { generatedAt } : {}),
    ...(isNonEmptyString(draft.env) ? { env: draft.env } : {}),
    shape: analyzeEntries !== null ? 'analyze' : 'build-ready',
    totals: {
      drafts: entries.length,
      complete: entries.filter((entry) => entry.status === 'complete').length,
      incomplete: entries.filter((entry) => entry.status === 'incomplete').length,
      rules: entries.reduce((total, entry) => total + entry.rules, 0),
    },
    entries,
  };
};

export interface ContextUsage {
  field: string;
  policies: string[];
}

export const collectContextUsage = (policies: PolicySummary[]): ContextUsage[] => {
  const usage = new Map<string, Set<string>>();
  policies.forEach((policy) => {
    policy.contextFields.forEach((field) => {
      const holders = usage.get(field) ?? new Set<string>();
      holders.add(policy.policyKey);
      usage.set(field, holders);
    });
  });

  return [...usage.entries()]
    .map(([field, holders]) => ({ field, policies: [...holders].sort() }))
    .sort((left, right) => left.field.localeCompare(right.field));
};

export const collectTargets = (policies: PolicySummary[]): string[] => {
  const targets = new Set<string>();
  policies.forEach((policy) => {
    policy.targets.forEach((target) => targets.add(formatTarget(target)));
  });
  return [...targets].sort();
};
