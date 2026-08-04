# Examples

Sample documents you can run every basic command against.

| File | What it is |
| ---- | ---------- |
| `govplane.config.json` | Project configuration pointing at the files below |
| `policy-bundle.json` | Runtime bundle with a valid checksum, unsigned |
| `policy-bundle.signed.json` | The same bundle, signed with Ed25519 |
| `signing-public-key.pem` | Public key that verifies the signed bundle |
| `policy-drafts.json` | Build-ready draft document |

> The key pair here is generated for demonstration only. Never reuse it.

## Try it

```bash
# Validate the bundle and the draft
govplane validate -w ./examples

# Warnings become failures (the sample bundle uses a wildcard resource)
govplane validate -w ./examples --strict

# Inspect the bundle
govplane inspect -w ./examples
govplane inspect -w ./examples --policies
govplane inspect -w ./examples --policy login-protection
govplane inspect -w ./examples --targets
govplane inspect -w ./examples --context

# Verify the signature
govplane inspect ./examples/policy-bundle.signed.json \
  --signature --public-key ./examples/signing-public-key.pem
```

## What the sample bundle exercises

- Three policies with `allow` and `deny` defaults.
- A disabled rule, so `inspect` reports active and disabled counts.
- `and`, `in`, `not`, `exists`, `gte` and `lte` conditions.
- `deny`, `allow`, `throttle` and `kill_switch` effects.
- A wildcard target (`api-gateway / * / request`), which triggers the
  `BROAD_RESOURCE_WILDCARD` warning.
- A checksum computed over the canonical payload, so tampering with the file is
  detected by `validate` and reported by `inspect`.

Try breaking it — change `activeVersion` in `policy-bundle.json` and run
`govplane validate -w ./examples` to see the checksum mismatch.
