# `govplane working-folder`

Shows or configures the working folder — the directory the CLI reads and writes
project files in.

```bash
govplane working-folder [set <path> | reset | init] [options]
```

See [working folder](../working-folder.md) for how the folder is resolved.

## Show the resolved folder

```bash
govplane working-folder
```

```text
/Users/example/projects/my-api
```

With `--verbose`, the source is shown as well:

```text
Working folder:
  /Users/example/projects/my-api

Source:
  Current terminal directory
```

Possible sources: `Command flag`, `Environment variable
(GOVPLANE_WORKING_FOLDER)`, `Persisted CLI configuration`, `Current terminal
directory`.

JSON output:

```json
{
  "workingFolder": "/Users/example/projects/my-api",
  "source": "current-directory",
  "sourceLabel": "Current terminal directory",
  "exists": true
}
```

## `set`

Persists a default working folder for future commands. The path is stored
absolute, in the user-level configuration file.

```bash
govplane working-folder set ./governance
govplane working-folder set /srv/projects/payments
```

```text
Govplane working folder updated:

  /Users/example/projects/my-api/governance
```

The directory must exist. Create it as part of the command with `--create`:

```bash
govplane working-folder set ./governance --create
```

Without `--create`, a missing directory fails with exit code `2`.

## `reset`

Removes the persisted working folder. The CLI then falls back to the
environment variable or the current terminal directory.

```bash
govplane working-folder reset
```

```text
Persisted working folder removed.

Govplane will use the current terminal directory by default.
```

## `init`

Creates the Govplane files in the resolved working folder:

```text
govplane.config.json
policy-drafts.json
.govplane/
├── cache/
├── logs/
└── temp/
```

```bash
govplane working-folder init
govplane working-folder init -w ./governance
```

```text
Initialising Govplane files in /project/governance

created  /project/governance/govplane.config.json
created  /project/governance/policy-drafts.json
```

Existing files are never overwritten silently:

```text
skipped  /project/governance/govplane.config.json

govplane.config.json already exists.

Use --force to replace generated files.
```

With `--force`, each replaced file is backed up first to
`<file>.backup-<timestamp>` before the new content is written atomically.

The generated draft document is valid, so `govplane validate` succeeds
immediately after `init`.

## Options

```text
--create                      Create the directory when it is missing (set)
--force                       Replace existing generated files (init)
--format <text|json>          Output format
--config <path>               Configuration file
-w, --working-folder <path>   Working folder
--quiet                       Suppress non-essential output
--verbose                     Show additional detail
-h, --help                    Command help
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Command completed |
| `2` | File or working-folder error |
| `3` | Invalid CLI arguments or unknown subcommand |
| `5` | Unexpected internal error |
