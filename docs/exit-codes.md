# Exit codes

Exit codes are part of the CLI's stable contract: automation can rely on them.

## Shared meanings

| Code | Meaning |
| ---- | ------- |
| `0` | Success |
| `1` | The operation failed (validation errors, unparsable document, missing policy) |
| `2` | File or working-folder error |
| `3` | Invalid CLI arguments |
| `4` | Compatibility failure — command-specific, see below |
| `5` | Unexpected internal error |
| `7` | Runtime Kit unavailable or inactive |

Code `4` is command-scoped:

- `validate` — unsupported schema or compatibility error
- `inspect` — signature verification failed
- any command — the Node.js runtime is older than the supported minimum

## Per command

### `validate`

| Code | Condition |
| ---- | --------- |
| `0` | Every document is valid (and, with `--strict`, warning-free) |
| `1` | At least one document failed validation, or is not valid JSON |
| `2` | No document found, or the file/working folder could not be read |
| `3` | Unknown option, unsupported `--type`, or a missing option value |
| `5` | Unexpected internal error |

### `inspect`

| Code | Condition |
| ---- | --------- |
| `0` | Inspection completed |
| `1` | The document could not be parsed or recognised; `--policy` not found |
| `2` | No document found, or the file/working folder could not be read |
| `3` | Invalid CLI arguments |
| `4` | Signature verification failed |
| `5` | Unexpected internal error |

### `version`

| Code | Condition |
| ---- | --------- |
| `0` | Completed — including when an explicit `--check` could not reach the registry |
| `3` | Invalid CLI arguments |
| `4` | Unsupported Node.js version |

### `help`

| Code | Condition |
| ---- | --------- |
| `0` | Help displayed |
| `3` | Unknown command or help topic |

### `working-folder`

| Code | Condition |
| ---- | --------- |
| `0` | Completed |
| `2` | The directory does not exist, is not a directory, or is not writable |
| `3` | Unknown subcommand, or `set` without a path |
| `5` | Unexpected internal error |

### Runtime Kit commands

| Code | Condition |
| ---- | --------- |
| `7` | The Runtime Kit is not installed, or this CLI build cannot run the command |

## Using the codes in CI

```bash
#!/usr/bin/env bash
set -euo pipefail

govplane validate --strict --format json > validation.json
```

`set -e` fails the build on any non-zero code. To distinguish outcomes:

```bash
if govplane validate --quiet; then
  echo "policies are valid"
else
  case $? in
    1) echo "validation failed" ;;
    2) echo "no document to validate" ;;
    *) echo "the CLI could not run" ;;
  esac
  exit 1
fi
```
