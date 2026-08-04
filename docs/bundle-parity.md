# Bundle parity

Local tooling and the Govplane control plane must agree, byte for byte, on what
a bundle *is*. Otherwise a checksum computed locally would be rejected by the
runtime, or a bundle that validates on your machine would fail to materialise
remotely.

This document is normative for the CLI.

## Canonical payload

Checksums and signatures are computed over a **projection** of the bundle, not
over the file as written.

Included:

```text
schemaVersion   (always the number 1)
orgId
projectId
env
policies[] → policyKey, activeVersion, defaults, rules
```

Excluded:

```text
generatedAt
bundleVersion
checksum
etag
signature
```

Any other top-level or per-policy field is dropped by the projection.

Serialisation:

1. Build the projection above.
2. Sort every object key lexicographically, recursively, including inside
   arrays.
3. `JSON.stringify` with no whitespace.
4. Encode as UTF-8.

The result is the exact byte string that is hashed and signed.

```ts
import { canonicalPayload, computeChecksum } from '@govplane/cli';

const bytes = canonicalPayload(bundle);      // Buffer
const checksum = computeChecksum(bundle);    // "sha256:<hex>"
```

Because the projection excludes `generatedAt` and `bundleVersion`, re-issuing a
bundle with a new timestamp does not change its checksum: the checksum
identifies the *policy content*, not the file.

## Checksum

```text
checksum = "sha256:" + hex(sha256(canonicalPayload))
```

`govplane validate` recomputes it whenever `checksum` is present and reports a
`CHECKSUM_MISMATCH` **error** when it disagrees — a mismatch means the file no
longer matches what was hashed.

`govplane inspect` reports the same comparison as `Status: matches canonical
payload` in the integrity section, and as `checksumMatches` in JSON output.

## ETag

```text
etag = "\"" + hex + "\""
```

Derived from the checksum by stripping the `sha256:` prefix and quoting it.
`inspect` displays it in the weak form (`W/"…"`) used by the runtime's polling
path.

## Signatures

Signatures cover the **same bytes** as the checksum.

| Algorithm | Key | Encoding |
| --------- | --- | -------- |
| `Ed25519` | Ed25519 public key (PEM, or base64 raw 32 bytes) | base64 raw signature |
| `ECDSA_SHA_256` | P-256 public key (PEM) | base64 DER signature |

Signature metadata is an object with `algorithm`, `keyId` and `value`; all three
are required and validation fails if any is missing.

```bash
govplane inspect --signature --public-key ./keys/prod.pem
```

Verification outcomes:

| Status | Meaning | Exit code |
| ------ | ------- | --------- |
| `valid` | Signature verified against the canonical payload | `0` |
| `invalid` | Verification failed, or metadata is incomplete | `4` |
| `unverified` | Metadata present, but no usable key was available | `0` |
| `absent` | The document carries no signature | `0` |

A missing key is not a failure: the CLI reports that verification could not be
completed and why.

## Deterministic ordering

When tooling compiles or normalises a bundle it must preserve the ordering the
control plane produces:

- **Policies** ascending by `policyKey`, using locale comparison.
- **Rules** descending by `priority`, then ascending by `id`.

Ordering does not change the canonical payload — key sorting is applied to
objects, not to arrays — but it keeps diffs stable and file output predictable.
`govplane validate` reports a `NON_DETERMINISTIC_ORDER` warning when a bundle
is out of order.

## Validation parity

The bundle rules enforced by `govplane validate` mirror the remote validator
one to one. Where local validation is stricter, the extra check is emitted as a
**warning** rather than an error, so a document that validates locally always
validates remotely.

Checks that are warnings for exactly this reason:

- An effect `type` the runtime does not evaluate (`UNKNOWN_EFFECT_TYPE`).
- A `kill_switch` or `throttle` rule effect without its payload
  (`INCOMPLETE_RULE_EFFECT`).
- A bundle rule `status` that is neither `active` nor `disabled`
  (`UNKNOWN_RULE_STATUS`).

`--strict` promotes every warning to a failure, which is the recommended setting
for CI.

## Keeping parity honest

`test/domain/canonical.test.ts` contains a copy of the control-plane
implementation and asserts that the CLI produces identical bytes. If the
control plane ever changes its canonicalisation, that test must be updated in
the same change as the implementation — and vice versa.
