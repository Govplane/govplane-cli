# `govplane validate`

Validates a Govplane policy draft or runtime bundle. The file is never
modified.

```bash
govplane validate [file] [options]
```

## What it checks

Validation runs in stages, and **all** detectable problems are reported in a
single run rather than stopping at the first one.

### Stage 1 — File

- The file exists, is a regular file and is readable.
- The content is valid JSON.
- The encoding is UTF-8 (a byte order mark is tolerated and stripped).
- The file is within the configured size limit (8 MiB by default, see
  [configuration](../configuration.md)).

### Stage 2 — Runtime schema (bundles)

Mirrors the validator the control plane runs when it materialises a bundle:

- `schemaVersion` must be the number `1`.
- `orgId`, `projectId` and `env` are required.
- `env` must be one of `prod`, `staging`, `dev`, `test`.
- `policies` must be an array.
- Per policy: `policyKey` required and unique, `activeVersion` numeric,
  `defaults.effect` one of `allow`, `deny`, `kill_switch`, `throttle`,
  `custom`, with the payload that effect requires, and `rules` an array.
- Per rule: `id` required and unique within the policy, `priority` numeric,
  `target.service`, `target.resource` and `target.action` required, and
  `effect` an object with a `type`. A `custom` effect needs a non-empty
  `value`. `thenEffect` and `elseEffect` are validated the same way.

### Stage 3 — Condition AST (bundles)

When a rule has a `when` condition:

| Operator | Requirements |
| -------- | ------------ |
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | non-empty `path`, scalar `value` (string, number, boolean or `null`) |
| `and`, `or` | non-empty `conditions` array, validated recursively |
| `not` | a `condition` node |
| `in` | non-empty `path` and non-empty `values` array |
| `exists` | non-empty `path` |

Any other operator fails validation. Legacy spellings (`ne`, `args`, `arg`) are
reported with the canonical replacement.

### Stage 4 — Materialisation metadata (bundles)

- `generatedAt` must be a valid ISO-8601 timestamp.
- `bundleVersion`, when present, must be a whole number of 1 or more. It is a
  revision counter, not a schema version: Govplane increments it every time a
  bundle is materialised for a given scope, so a long-lived bundle is routinely
  well past 1.
- `checksum`, when present, must be a non-empty string **and must match** the
  canonical payload — see [bundle parity](../bundle-parity.md).
- `signature`, when present, must include `algorithm`, `keyId` and `value`.

### Drafts

Draft documents are validated against the draft rules instead: `schemaVersion`
is required, `env` (when present) must be a supported environment, and the
document must contain either a `policies` array (build-ready drafts) or a
`drafts` array (documents produced by `govplane analyze`). Rule `status`, when
present, must be `active` or `disabled`.

## Selecting what to validate

```bash
govplane validate                        # the configured bundle and draft
govplane validate ./policy-bundle.json   # an explicit file
```

With no file argument the CLI validates the configured bundle and draft files
that exist. If neither exists it reports an actionable error and exits with
code `2`:

```text
Error: No Govplane draft or bundle was found in:
  /Users/example/projects/my-api

Expected:
  policy-bundle.json
  policy-drafts.json
```

The document type is inferred from the contents, not the filename. Force it
with `--type`:

```bash
govplane validate ./policies.json --type bundle
govplane validate ./policies.json --type draft
```

When the forced type disagrees with the detected type, a
`DOCUMENT_TYPE_MISMATCH` warning is emitted.

## Warnings and strict mode

Warnings do not fail validation unless `--strict` is used:

| Code | Meaning |
| ---- | ------- |
| `POLICY_WITHOUT_RULES` | The policy can only ever apply its default effect |
| `BROAD_RESOURCE_WILDCARD` | A rule targets every resource (`*`) |
| `DEPRECATED_OPERATOR` | A legacy condition spelling was found |
| `DYNAMIC_WILDCARD_TARGET` | A draft target resolves to `*` |
| `NON_DETERMINISTIC_ORDER` | Policies or rules are not in canonical order |
| `MISSING_GENERATED_AT` | The bundle has no `generatedAt` |
| `UNSIGNED_BUNDLE` | The bundle carries no signature metadata |
| `UNKNOWN_EFFECT_TYPE` | An effect type the runtime does not evaluate |
| `INCOMPLETE_RULE_EFFECT` | A `kill_switch` or `throttle` effect is missing its payload |
| `INCOMPLETE_DRAFT` | A draft has no rules yet |
| `EMPTY_DOCUMENT` | The document contains no policies |
| `UNKNOWN_RULE_STATUS` | A bundle rule status is neither `active` nor `disabled` |

```bash
govplane validate --strict   # warnings become a non-zero exit
```

## Output

Successful run:

```text
✓ policy-bundle.json is valid

Type:     bundle
Policies: 12
Rules:    34
Schema:   1
```

Failed run (written to stderr):

```text
Validation failed: policy-bundle.json

2 errors found:

1. policies[2].policyKey
   Duplicate policy key: "login-protection"
   DUPLICATE_POLICY_KEY

2. policies[4].rules[1].when.op
   Unsupported operator: "equalsTo"
   UNSUPPORTED_CONDITION_OPERATOR
```

`--quiet` suppresses successful output entirely; errors are still shown.

### JSON output

One document:

```json
{
  "valid": false,
  "documentType": "bundle",
  "file": "/project/policy-bundle.json",
  "errors": [
    {
      "code": "DUPLICATE_POLICY_KEY",
      "path": "$.policies[2].policyKey",
      "message": "Duplicate policy key: \"login-protection\""
    }
  ],
  "warnings": [],
  "stats": { "policies": 12, "rules": 34, "schemaVersion": 1, "env": "prod" }
}
```

Several documents:

```json
{
  "valid": true,
  "results": [
    { "valid": true, "documentType": "bundle", "file": "…" },
    { "valid": true, "documentType": "draft", "file": "…" }
  ]
}
```

### Error codes

`INVALID_JSON`, `DOCUMENT_NOT_OBJECT`, `UNKNOWN_DOCUMENT_TYPE`,
`INVALID_SCHEMA_VERSION`, `MISSING_SCOPE_FIELDS`, `INVALID_ENV`,
`POLICIES_NOT_ARRAY`, `INVALID_POLICY`, `MISSING_POLICY_KEY`,
`DUPLICATE_POLICY_KEY`, `INVALID_ACTIVE_VERSION`, `INVALID_DEFAULT_EFFECT`,
`MISSING_KILL_SWITCH_SERVICE`, `INVALID_THROTTLE_DEFAULT`,
`INVALID_CUSTOM_DEFAULT`, `RULES_NOT_ARRAY`, `INVALID_RULE`, `MISSING_RULE_ID`,
`DUPLICATE_RULE_ID`, `INVALID_RULE_PRIORITY`, `INVALID_RULE_TARGET`,
`INVALID_RULE_EFFECT`, `INVALID_RULE_STATUS`, `INVALID_CONDITION_AST`,
`UNSUPPORTED_CONDITION_OPERATOR`, `INVALID_GENERATED_AT`,
`INVALID_BUNDLE_VERSION`, `INVALID_CHECKSUM`, `CHECKSUM_MISMATCH`,
`INVALID_SIGNATURE_METADATA`, `INVALID_DRAFT_SCHEMA`, `DRAFTS_NOT_ARRAY`,
`INVALID_DRAFT_ENTRY`, `MISSING_DRAFT_TARGET`.

## Options

```text
--type <auto|draft|bundle>    Document type (default: auto)
--strict                      Treat warnings as errors
--format <text|json>          Output format
--quiet                       Suppress successful output
--config <path>               Configuration file
-w, --working-folder <path>   Working folder
--verbose                     Show resolved paths and stages
-h, --help                    Command help
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Validation succeeded |
| `1` | Validation failed |
| `2` | File or working-folder error |
| `3` | Invalid CLI arguments |
| `5` | Unexpected internal error |
