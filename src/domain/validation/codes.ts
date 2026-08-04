/**
 * Validation error codes.
 *
 * The `PARITY_*` group mirrors the failures raised by the remote runtime-bundle
 * validator used during safe bundle materialisation, so a bundle that passes
 * `govplane validate` also passes remote validation.
 */
export const ValidationCode = {
  // Document level
  InvalidJson: 'INVALID_JSON',
  DocumentNotObject: 'DOCUMENT_NOT_OBJECT',
  UnknownDocumentType: 'UNKNOWN_DOCUMENT_TYPE',
  DocumentTypeMismatch: 'DOCUMENT_TYPE_MISMATCH',

  // Runtime bundle — remote parity
  InvalidSchemaVersion: 'INVALID_SCHEMA_VERSION',
  MissingScopeFields: 'MISSING_SCOPE_FIELDS',
  InvalidEnv: 'INVALID_ENV',
  PoliciesNotArray: 'POLICIES_NOT_ARRAY',
  InvalidPolicy: 'INVALID_POLICY',
  MissingPolicyKey: 'MISSING_POLICY_KEY',
  DuplicatePolicyKey: 'DUPLICATE_POLICY_KEY',
  InvalidActiveVersion: 'INVALID_ACTIVE_VERSION',
  InvalidDefaultEffect: 'INVALID_DEFAULT_EFFECT',
  MissingKillSwitchService: 'MISSING_KILL_SWITCH_SERVICE',
  InvalidThrottleDefault: 'INVALID_THROTTLE_DEFAULT',
  InvalidCustomDefault: 'INVALID_CUSTOM_DEFAULT',
  RulesNotArray: 'RULES_NOT_ARRAY',
  InvalidRule: 'INVALID_RULE',
  MissingRuleId: 'MISSING_RULE_ID',
  DuplicateRuleId: 'DUPLICATE_RULE_ID',
  InvalidRulePriority: 'INVALID_RULE_PRIORITY',
  InvalidRuleTarget: 'INVALID_RULE_TARGET',
  InvalidRuleEffect: 'INVALID_RULE_EFFECT',
  InvalidRuleStatus: 'INVALID_RULE_STATUS',
  InvalidConditionAst: 'INVALID_CONDITION_AST',
  UnsupportedConditionOperator: 'UNSUPPORTED_CONDITION_OPERATOR',

  // Materialisation metadata
  InvalidGeneratedAt: 'INVALID_GENERATED_AT',
  InvalidBundleVersion: 'INVALID_BUNDLE_VERSION',
  InvalidChecksum: 'INVALID_CHECKSUM',
  ChecksumMismatch: 'CHECKSUM_MISMATCH',
  InvalidSignatureMetadata: 'INVALID_SIGNATURE_METADATA',

  // Drafts
  InvalidDraftSchema: 'INVALID_DRAFT_SCHEMA',
  DraftsNotArray: 'DRAFTS_NOT_ARRAY',
  InvalidDraftEntry: 'INVALID_DRAFT_ENTRY',
  MissingDraftTarget: 'MISSING_DRAFT_TARGET',
} as const;

export const WarningCode = {
  PolicyWithoutRules: 'POLICY_WITHOUT_RULES',
  BroadResourceWildcard: 'BROAD_RESOURCE_WILDCARD',
  DeprecatedOperator: 'DEPRECATED_OPERATOR',
  DynamicWildcardTarget: 'DYNAMIC_WILDCARD_TARGET',
  NonDeterministicOrder: 'NON_DETERMINISTIC_ORDER',
  MissingGeneratedAt: 'MISSING_GENERATED_AT',
  UnsignedBundle: 'UNSIGNED_BUNDLE',
  IncompleteDraft: 'INCOMPLETE_DRAFT',
  EmptyDocument: 'EMPTY_DOCUMENT',
  UnknownEffectType: 'UNKNOWN_EFFECT_TYPE',
  UnknownRuleStatus: 'UNKNOWN_RULE_STATUS',
  IncompleteRuleEffect: 'INCOMPLETE_RULE_EFFECT',
  DisabledPolicy: 'DISABLED_POLICY',
  MissingScopeFields: 'MISSING_SCOPE_FIELDS',
} as const;
