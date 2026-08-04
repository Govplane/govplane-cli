# Govplane CLI documentation

The Govplane CLI works with local Govplane policy drafts and runtime bundles.
Every command documented here runs offline and requires no Govplane account.

## Commands

| Document | Command |
| -------- | ------- |
| [validate](commands/validate.md) | `govplane validate` |
| [inspect](commands/inspect.md) | `govplane inspect` |
| [version](commands/version.md) | `govplane version` |
| [help](commands/help.md) | `govplane help` |
| [working-folder](commands/working-folder.md) | `govplane working-folder` |
| [Runtime Kit commands](commands/runtime-kit.md) | `analyze`, `build`, `sign`, `simulate`, `policies` |

## Reference

- [Working folder](working-folder.md) — how the CLI decides where your project
  files live.
- [Configuration](configuration.md) — `govplane.config.json` and the user-level
  configuration file.
- [Document model](document-model.md) — the shape of drafts and runtime
  bundles, and the rules the CLI validates.
- [Bundle parity](bundle-parity.md) — canonical payload, checksums, signatures
  and deterministic ordering.
- [Exit codes](exit-codes.md) — what each exit code means, per command.
- [Architecture](architecture.md) — how the CLI is put together.

## Conventions used in these documents

- `<angle brackets>` mark a value you supply.
- `[square brackets]` mark an optional argument.
- Output samples are illustrative; exact wording may change between releases,
  while **exit codes, JSON fields and error codes are part of the CLI's stable
  contract**.
