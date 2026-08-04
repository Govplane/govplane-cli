# Document model

The CLI works with two kinds of document: **runtime bundles**, which the SDK
evaluates, and **policy drafts**, which developers author before a bundle is
built.

Document type is inferred from the contents, never from the filename, so a
bundle called `policies.json` is still recognised as a bundle. Use
`--type bundle` or `--type draft` to override the inference.

## Runtime bundle

```json
{
  "schemaVersion": 1,
  "orgId": "org_demo",
  "projectId": "proj_payments",
  "env": "prod",
  "generatedAt": "2026-07-25T12:00:00.000Z",
  "bundleVersion": 1,
  "checksum": "sha256:e0ae1d3f…",
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "prod-signing-key-01",
    "value": "…"
  },
  "policies": [
    {
      "policyKey": "login-protection",
      "activeVersion": 1,
      "defaults": { "effect": "allow" },
      "rules": [
        {
          "id": "deny-after-five-failures",
          "status": "active",
          "priority": 100,
          "target": {
            "service": "auth",
            "resource": "login",
            "action": "authenticate"
          },
          "when": { "op": "gte", "path": "ctx.failedAttempts", "value": 5 },
          "effect": { "type": "deny" }
        }
      ]
    }
  ]
}
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `schemaVersion` | yes | Must be the number `1` |
| `orgId`, `projectId` | yes | Scope of the bundle |
| `env` | yes | `prod`, `staging`, `dev` or `test` |
| `generatedAt` | recommended | ISO-8601 timestamp |
| `bundleVersion` | no | Revision counter: a whole number of 1 or more |
| `checksum` | no | `sha256:<hex>` over the canonical payload |
| `signature` | no | `algorithm`, `keyId` and `value` |
| `policies` | yes | Array of policies |

### Policy

| Field | Required | Notes |
| ----- | -------- | ----- |
| `policyKey` | yes | Unique within the bundle |
| `activeVersion` | yes | Number |
| `defaults` | yes | Effect applied when no rule matches |
| `rules` | yes | Array, may be empty |
| `friendlyName`, `description`, `status` | no | Reported by `inspect` |

### Rule

| Field | Required | Notes |
| ----- | -------- | ----- |
| `id` | yes | Unique within the policy |
| `priority` | yes | Number; higher priority is evaluated first |
| `target.service`, `target.resource`, `target.action` | yes | Non-empty strings |
| `effect` | yes | Object with a `type` |
| `status` | no | `active` or `disabled` |
| `when` | no | Condition AST |
| `thenEffect` | no | Applied when `when` is true |
| `elseEffect` | no | Applied when `when` is false |

### Effects

| Type | Rule effect payload | Policy default payload |
| ---- | ------------------- | ---------------------- |
| `allow` | — | — |
| `deny` | — | — |
| `kill_switch` | `killSwitch.service` (+ optional `reason`) | `killSwitch.service` (required) |
| `throttle` | `throttle.limit`, `throttle.windowSeconds`, `throttle.key` | same, required |
| `custom` | `value` (non-empty string, required) | `customEffect` (non-empty string, required) |

### Condition AST

```json
{
  "op": "and",
  "conditions": [
    { "op": "gte", "path": "ctx.failedAttempts", "value": 5 },
    { "op": "not", "condition": { "op": "exists", "path": "ctx.trustedDevice" } },
    { "op": "in", "path": "ctx.plan", "values": ["free", "trial"] }
  ]
}
```

| Operator | Shape |
| -------- | ----- |
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | `path` + scalar `value` |
| `and`, `or` | non-empty `conditions` array |
| `not` | `condition` |
| `in` | `path` + non-empty `values` array |
| `exists` | `path` |

Paths may be written with or without a `ctx.` prefix; the two forms are
equivalent and `inspect --context` reports them under the same name.

Older documents sometimes use `ne` instead of `neq`, or `args`/`arg` instead of
`conditions`/`condition`. Those spellings are **not** supported and validation
reports the canonical replacement.

## Policy draft — build-ready

The shape persisted by the toolkit's `policies` command and consumed by
`build`:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-07-25T12:00:00.000Z",
  "env": "prod",
  "policies": [
    {
      "policyKey": "login-protection",
      "activeVersion": 1,
      "defaults": { "effect": "allow" },
      "rules": []
    }
  ]
}
```

Differences from a bundle: `schemaVersion` may be a string, there are no scope
or integrity fields, `activeVersion` is optional, and rule `status` — when
present — must be `active` or `disabled`.

A draft policy counts as **complete** when it has a default effect and at least
one rule.

## Policy draft — analyze output

Produced by `govplane analyze`:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-07-25T12:00:00.000Z",
  "drafts": [
    {
      "id": "api-gateway-request",
      "status": "missing",
      "confidence": "high",
      "target": { "service": "api-gateway", "resource": "*", "action": "request" },
      "availableContext": [{ "key": "method", "source": "req.method", "type": "string" }],
      "suggestedPolicy": {
        "policyKey": "api-gateway-request",
        "friendlyName": "API Gateway Request",
        "rules": []
      },
      "sources": [{ "file": "src/middleware/governance.js", "line": 18, "column": 24 }]
    }
  ]
}
```

Each entry must carry a complete `target`. An entry whose `suggestedPolicy` has
no rules is reported as incomplete — a warning, not an error, because that is
exactly what analyze is expected to produce for review.
