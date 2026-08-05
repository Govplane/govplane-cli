# `govplane version`

Displays the installed CLI version and relevant runtime information.

```bash
govplane version [options]
govplane --version
govplane -v
```

## Default output

```text
Govplane CLI 1.0.0
```

## Verbose output

```bash
govplane version --verbose
```

```text
Govplane CLI

CLI version:
  1.0.0

Node.js:
  22.4.0

Platform:
  darwin-arm64

CLI Toolkit:
  Not installed

Configuration:
  /Users/example/.govplane/config.json

Working folder:
  /Users/example/projects/my-api
```

Verbose output never contains authentication tokens, OTP values, licence keys,
private signing keys or sensitive environment variables.

## JSON output

```bash
govplane version --format json
```

```json
{
  "cliVersion": "1.0.0",
  "nodeVersion": "22.4.0",
  "platform": "darwin",
  "architecture": "arm64",
  "runtimeKit": { "installed": false, "version": null }
}
```

## Update check

The command does not contact Govplane or npm unless you ask it to:

```bash
govplane version --check
```

```text
Govplane CLI 1.0.0

A newer version is available: 1.1.0

Update with:
  npm install --global @govplane/cli@latest
```

The check queries the public npm registry with a three-second timeout. A
network failure is reported but never fails the command:

```text
Update check could not be completed: fetch failed
```

With `--format json`, the result is added as an `updateCheck` object:

```json
{
  "cliVersion": "1.0.0",
  "updateCheck": { "latestVersion": "1.1.0", "updateAvailable": true }
}
```

## Options

```text
--verbose               Show environment details
--format <text|json>    Output format
--check                 Check npm for a newer release (network access)
-h, --help              Command help
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Command completed (including a failed update check) |
| `3` | Invalid CLI arguments |
| `4` | Unsupported Node.js version |
| `5` | Unexpected internal error |
