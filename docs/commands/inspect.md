# `govplane inspect`

Displays a human-readable summary of a Govplane draft or bundle. The file is
never modified.

```bash
govplane inspect [file] [options]
```

With no file argument the CLI inspects the configured bundle, falling back to
the configured draft when no bundle exists. The document type is inferred from
the contents.

## Default summary

```text
Govplane Policy Bundle

File:
  /Users/example/projects/my-api/policy-bundle.json

Bundle:
  Schema: 1
  Organisation: org_demo
  Project: proj_payments
  Environment: prod
  Generated at: 2026-07-25T12:00:00.000Z
  Bundle version: 1

Contents:
  Policies: 3
  Active policies: 3
  Disabled policies: 0
  Rules: 5

Integrity:
  Checksum: sha256:e0ae1d3f…
  Status: matches canonical payload
  ETag: W/"e0ae1d3f…"

Signature:
  Status: Metadata present
  Algorithm: Ed25519
  Key ID: prod-signing-key-01
```

The checksum status is computed locally from the canonical payload — see
[bundle parity](../bundle-parity.md).

## Policy listing

```bash
govplane inspect --policies
```

```text
Policies

KEY                  TARGET                       RULES  STATUS
api-request-control  api-gateway / * / request    2      active
login-protection     auth / login / authenticate  1      active
refund-control       payments / refund / execute  2      active
```

When a policy covers several targets, the first is shown with a `(+n)` suffix.

## A single policy

```bash
govplane inspect --policy login-protection
```

```text
Policy: login-protection

Targets:
  auth / login / authenticate

Default effect:
  allow

Rules:
  1

Context fields:
  failedAttempts
```

An unknown policy key exits with code `1`.

## Targets and context

```bash
govplane inspect --targets
govplane inspect --context
```

`--context` lists every context path referenced by a rule condition, together
with the policies that reference it. A leading `ctx.` prefix is stripped, so
`ctx.userId` and `userId` are reported as the same field.

## Signatures

```bash
govplane inspect --signature
govplane inspect --signature --public-key ./keys/prod.pem
```

Verification is performed over the canonical payload. Supported algorithms:

| Algorithm | Signature encoding |
| --------- | ------------------ |
| `Ed25519` | base64, raw |
| `ECDSA_SHA_256` | base64, DER (AWS KMS P-256 keys) |

The public key is resolved in this order:

1. `--public-key <path>`
2. `signature.publicKeyPath` in `govplane.config.json`
3. `GOVPLANE_PUBLIC_KEY` (an inline PEM or raw base64 key)
4. `GOVPLANE_PUBLIC_KEY_PATH`

Both PEM keys and base64-encoded raw 32-byte Ed25519 keys are accepted.

Without a key the command reports the metadata and explains that verification
could not be completed — that is **not** a failure:

```text
Signature verification

Status:
  Not verified

Algorithm:
  Ed25519

Key ID:
  prod-signing-key-01

Reason:
  Public verification key is not available.
```

A signature that fails verification exits with code `4`.

## Drafts

```text
Govplane Policy Drafts

File:
  /project/policy-drafts.json

Shape: analyze
Schema: 1.0
Generated at: 2026-07-25T12:00:00.000Z

Total drafts: 4
Complete: 2
Incomplete: 2

KEY                  TARGET                     RULES  STATUS
api-gateway-request  api-gateway / * / request  0      incomplete
login-protection     auth / login / authenticate  3    complete

Source locations:
  api-gateway-request  src/middleware/governance.js:18
```

Both draft shapes are understood: build-ready documents (`policies`) and
documents produced by `govplane analyze` (`drafts`), including confidence and
source locations.

## JSON output

```bash
govplane inspect --format json
```

The payload contains the normalised summary — `schemaVersion`, `orgId`,
`projectId`, `env`, `generatedAt`, `bundleVersion`, `checksum`,
`checksumMatches`, `etag`, `signature.algorithm`, `signature.keyId`, `totals`,
`policies`, `targets` and `context` — plus `signatureVerification` when
`--signature` was requested.

## Options

```text
--policies                    List the policies in the document
--policy <policy-key>         Show details for a single policy
--targets                     List the covered targets
--context                     List referenced context fields
--signature                   Inspect and verify signature metadata
--public-key <path>           Public key used for verification
--format <text|json>          Output format
--config <path>               Configuration file
-w, --working-folder <path>   Working folder
--quiet                       Suppress non-essential output
--verbose                     Show resolved paths and detection details
-h, --help                    Command help
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Inspection completed |
| `1` | Document could not be parsed or recognised, or policy not found |
| `2` | File or working-folder error |
| `3` | Invalid CLI arguments |
| `4` | Signature verification failed |
| `5` | Unexpected internal error |
