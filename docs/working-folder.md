# Working folder

The working folder is the directory in which the Govplane CLI reads and writes
project-specific files: configuration, policy drafts, bundles, analysis output,
simulation files and temporary build artefacts.

The CLI never treats the directory where the CLI package itself is installed as
the working folder.

## Resolution precedence

1. **Command flag** — `--working-folder <path>` or `-w <path>`
2. **Environment variable** — `GOVPLANE_WORKING_FOLDER`
3. **Persisted CLI configuration** — `govplane working-folder set <path>`
4. **Current terminal directory**

Explicit configuration always wins over persistent or environment-based
settings.

```bash
cd ~/projects/my-api
govplane validate                      # → ~/projects/my-api

govplane validate -w ./governance      # → ~/projects/my-api/governance
GOVPLANE_WORKING_FOLDER=/srv/api govplane validate   # → /srv/api
```

The global flag also works before the command:

```bash
govplane --working-folder ./governance validate
```

## Path resolution

Relative paths are resolved against the **terminal's current directory**, not
against a previously configured working folder, and are then normalised to an
absolute path:

```bash
govplane validate --working-folder ../api
```

```bash
govplane validate --verbose
# Working folder: /Users/example/projects/api
# Source: Command flag
```

## Validation

Before a command runs, the CLI checks that the working folder:

- exists,
- is a directory,
- can be read, and
- can be written to, when the command creates or modifies files.

Read-only commands (`validate`, `inspect`) work in a folder that is readable
but not writable. Commands that write fail **before** making any modification,
so a failed run never leaves partial changes behind.

```text
Error: Working folder does not exist.

Path:
  /Users/example/projects/missing-api

Create the directory or specify another path with:
  govplane --working-folder <path>
```

## The governance subdirectory pattern

A dedicated subdirectory keeps governance artefacts clearly separated from
application source:

```text
project-root/
├── src/
│   └── ...
└── governance/
    ├── govplane.config.json
    ├── policy-drafts.json
    ├── policy-bundle.json
    ├── simulations/
    │   ├── login-blocked.json
    │   └── auth-suite.json
    └── .govplane/
        ├── cache/
        ├── logs/
        └── temp/
```

Every command — basic and Runtime Kit alike — honours the same flag:

```bash
govplane validate -w ./governance
govplane inspect  -w ./governance
govplane build    -w ./governance
```

Or persist it once:

```bash
govplane working-folder set ./governance
govplane validate
govplane inspect
```

## Files the CLI writes

| Path | Written by |
| ---- | ---------- |
| `govplane.config.json` | `working-folder init` |
| `policy-drafts.json` | `working-folder init` |
| `.govplane/cache`, `.govplane/logs`, `.govplane/temp` | `working-folder init` |
| `<file>.backup-<timestamp>` | `working-folder init --force` |

The user-level configuration file (`~/.govplane/config.json`, or
`$GOVPLANE_HOME/config.json`) holds the persisted working folder and is written
only by `working-folder set` and `working-folder reset`.

All writes are atomic: content is flushed to a temporary file, fsynced and then
renamed over the destination.
