# Configuration

The CLI reads two configuration files: a **project** file inside the working
folder, and a **user-level** file that stores personal defaults.

## Project configuration

Default location: `<working-folder>/govplane.config.json`.

```json
{
  "schemaVersion": 1,
  "draft": { "path": "policy-drafts.json" },
  "bundle": { "path": "policy-bundle.json" },
  "signature": { "publicKeyPath": "keys/prod.pem" },
  "limits": { "maxFileBytes": 8388608 }
}
```

| Field | Type | Default | Purpose |
| ----- | ---- | ------- | ------- |
| `schemaVersion` | number \| string | — | Configuration schema version |
| `draft.path` | string | `policy-drafts.json` | Draft document |
| `bundle.path` | string | `policy-bundle.json` | Runtime bundle |
| `signature.publicKeyPath` | string | — | Key used by `inspect --signature` |
| `limits.maxFileBytes` | number | `8388608` (8 MiB) | Maximum document size |

Every path is resolved **relative to the working folder**:

```json
{
  "draft": { "path": "policies/drafts.json" },
  "bundle": { "path": "dist/runtime-bundle.json" }
}
```

```text
<working-folder>/policies/drafts.json
<working-folder>/dist/runtime-bundle.json
```

Unknown fields are ignored, so a configuration file shared with the Runtime Kit
works with the basic CLI too.

### Using a different file

```bash
govplane validate --config ./config/govplane.prod.json
```

Relative `--config` paths are resolved from the working folder. An explicit
configuration file that does not exist is an error (exit code `2`); a missing
default file is not — the CLI simply uses its defaults.

## User configuration

Location: `~/.govplane/config.json`, or `$GOVPLANE_HOME/config.json` when
`GOVPLANE_HOME` is set.

```json
{
  "schemaVersion": 1,
  "workingFolder": "/Users/example/projects/my-api/governance"
}
```

It is written only by `govplane working-folder set` and
`govplane working-folder reset`. If the file is missing or unreadable, the CLI
falls back to its defaults rather than failing: persisted settings are a
convenience, never a requirement.

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `GOVPLANE_WORKING_FOLDER` | Working folder, overriding persisted configuration |
| `GOVPLANE_HOME` | User-level Govplane directory (default `~/.govplane`) |
| `GOVPLANE_PUBLIC_KEY` | Inline public key for signature verification |
| `GOVPLANE_PUBLIC_KEY_PATH` | Path to a public key for signature verification |
| `NO_COLOR` | Disables ANSI colour |
| `FORCE_COLOR` | Forces ANSI colour even without a TTY |

`GOVPLANE_HOME` is particularly useful in CI, where it keeps CLI state inside
the workspace instead of the build agent's home directory.

## Global options

These options behave identically across commands, though not every command
accepts every one:

```text
-w, --working-folder <path>   Working folder
    --config <path>           Configuration file
    --format <text|json>      Output format
    --quiet                   Suppress non-essential output
    --verbose                 Additional diagnostic information
-h, --help                    Command help
-v, --version                 CLI version
```

### `--quiet`

Suppresses non-essential output. Errors are still written to stderr, and
`--format json` output is still produced — quiet mode is about noise, not about
results.

### `--verbose`

Adds diagnostics: the resolved working folder and its source, the configuration
file in use, the documents being processed, and the detected document type.

Verbose output never includes authentication tokens, OTP values, licence keys,
private signing keys or sensitive environment variables.
