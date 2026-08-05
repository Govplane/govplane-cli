# CLI Toolkit commands

`analyze`, `build`, `sign`, `simulate` and `policies` belong to the **Govplane
CLI Toolkit** — the free advanced toolkit. They are documented by the CLI so
you can discover them, but they are not part of the basic CLI package.

| Command | Purpose |
| ------- | ------- |
| `analyze` | Analyse the codebase for policy evaluation points |
| `build` | Build a policy bundle from drafts |
| `sign` | Sign a policy bundle |
| `simulate` | Simulate policy evaluations locally |
| `policies` | Manage local policy drafts |

## Behaviour without the kit

Running one of these commands never starts a download, a registration flow or
any network request. The CLI explains what is needed and exits with code `7`:

```text
The build command requires the Govplane CLI Toolkit.

The CLI Toolkit is free and runs locally.

Install it with:
  govplane --install-kit
```

## `--install-kit`

```bash
govplane --install-kit
```

Explains how to enable the toolkit:

```text
The Govplane CLI Toolkit is free and runs locally.

Install it with:
  npm install --global @govplane/toolkit

The basic CLI commands — validate, inspect, version, help and working-folder —
never require the CLI Toolkit, an account or network access.
```

When the kit is already installed, the command reports its version and manifest
location instead.

## Detection

The CLI decides whether the kit is present by looking for a manifest on the
local filesystem:

```text
$GOVPLANE_HOME/kit/kit.json      (default: ~/.govplane/kit/kit.json)
```

The manifest's `version` field is reported by `govplane version --verbose` and
in `govplane version --format json`. Detection is a filesystem lookup only —
the basic CLI never asks a Govplane service whether you have the kit.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `7` | CLI Toolkit unavailable or inactive |
