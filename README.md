# Govplane CLI

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The Govplane CLI is the command-line entry point to [Govplane](https://govplane.com),
the control plane for application governance.

It works with local Govplane policy **drafts** and runtime **bundles**, and the
commands documented here need **no account, no registration and no network
access**. You own your runtime: everything below runs entirely on your machine.

```bash
npm install --global @govplane/cli
govplane validate ./policy-bundle.json
```

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Working folder](#working-folder)
- [Configuration](#configuration)
- [Output formats and exit codes](#output-formats-and-exit-codes)
- [Runtime bundle parity](#runtime-bundle-parity)
- [Documentation](#documentation)
- [Programmatic use](#programmatic-use)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

Govplane policies are evaluated locally by the Govplane SDK, from a signed
policy bundle. The CLI gives you the local tooling around those documents:

- **Validate** a draft or bundle with exactly the same rules the Govplane
  control plane applies when it materialises a bundle.
- **Inspect** what a document contains — policies, targets, context fields,
  integrity metadata and signatures.
- **Verify** checksums and signatures against the canonical payload the runtime
  verifies, so you can confirm a bundle before shipping it.

Nothing here phones home. The only command that can touch the network is
`govplane version --check`, and only when you pass that flag explicitly.

Advanced tooling — `analyze`, `build`, `sign`, `simulate` and `policies` — is
provided by the free [Govplane CLI Toolkit](#toolkit-commands). The CLI
documents those commands and tells you how to install the kit, but never
installs anything on its own.

## Installation

```bash
npm install --global @govplane/cli
```

Upgrade:

```bash
npm update --global @govplane/cli
```

Uninstall:

```bash
npm uninstall --global @govplane/cli
```

Verify:

```bash
govplane version
```

**Requirements:** Node.js 20 or later. On an older runtime the CLI stops with a
clear message instead of a stack trace:

```text
Govplane CLI requires Node.js 20 or later. Current version: Node.js 18.19.0
```

## Quick start

```bash
# 1. Create a governance folder for your project and initialise it
mkdir -p governance
govplane working-folder init -w ./governance

# 2. Point every later command at it
govplane working-folder set ./governance

# 3. Validate whatever you have — draft, bundle, or both
govplane validate

# 4. See what a bundle actually contains
govplane inspect --policies
govplane inspect --policy login-protection
govplane inspect --signature --public-key ./keys/prod.pem
```

A ready-to-run example lives in [`examples/`](examples): a signed bundle, an
unsigned bundle, a draft document, a configuration file and the matching public
key.

```bash
govplane validate -w ./examples
govplane inspect  -w ./examples --policies
```

## Commands

| Command          | Purpose                                     | CLI Toolkit |
| ---------------- | ------------------------------------------- | ----------- |
| `validate`       | Validate a policy draft or bundle           | No          |
| `inspect`        | Inspect a policy draft or bundle            | No          |
| `version`        | Display CLI version information             | No          |
| `help`           | Display CLI documentation                   | No          |
| `working-folder` | Show or configure the working folder        | No          |
| `analyze`        | Find policy evaluation points in source     | Yes         |
| `build`          | Build a policy bundle from drafts           | Yes         |
| `sign`           | Sign a policy bundle                        | Yes         |
| `simulate`       | Simulate policy evaluations locally         | Yes         |
| `policies`       | Manage local policy drafts                  | Yes         |

Full reference: [`docs/commands`](docs/commands).

### `govplane validate`

```bash
govplane validate                          # default draft and bundle
govplane validate ./policy-bundle.json     # an explicit file
govplane validate ./policies.json --type bundle
govplane validate --strict --format json
```

Validation never modifies the file, reports **all** detectable problems in one
pass, and returns stable exit codes for CI.

### `govplane inspect`

```bash
govplane inspect                    # summary of the default document
govplane inspect --policies         # policy listing
govplane inspect --policy <key>     # one policy in detail
govplane inspect --targets          # every covered target
govplane inspect --context          # context fields referenced by policies
govplane inspect --signature        # signature metadata and verification
```

### CLI Toolkit commands

`analyze`, `build`, `sign`, `simulate` and `policies` are part of the free
Govplane CLI Toolkit. Without it installed, the CLI explains what to do and
exits with code `7` — it never starts a download or a registration flow by
itself:

```text
The build command requires the Govplane CLI Toolkit.

The CLI Toolkit is free and runs locally.

Install it with:
  govplane --install-kit
```

## Working folder

The working folder is the directory the CLI reads and writes project files in.
It defaults to your current terminal directory and is resolved with this
precedence:

1. `--working-folder <path>` / `-w <path>`
2. `GOVPLANE_WORKING_FOLDER`
3. Persisted CLI configuration (`govplane working-folder set`)
4. The current terminal directory

```bash
govplane working-folder                       # show the resolved folder
govplane working-folder --verbose             # show it and where it came from
govplane working-folder set ./governance      # persist a default
govplane working-folder set ./gov --create    # create it first
govplane working-folder reset                 # forget the persisted default
govplane working-folder init                  # scaffold Govplane files
```

A recommended layout keeps governance artefacts out of your application source:

```text
project-root/
├── src/
└── governance/
    ├── govplane.config.json
    ├── policy-drafts.json
    ├── policy-bundle.json
    └── .govplane/
        ├── cache/
        ├── logs/
        └── temp/
```

## Configuration

`govplane.config.json` lives in the working folder. Every path inside it is
resolved relative to that folder.

```json
{
  "schemaVersion": 1,
  "draft": { "path": "policy-drafts.json" },
  "bundle": { "path": "policy-bundle.json" },
  "signature": { "publicKeyPath": "keys/prod.pem" },
  "limits": { "maxFileBytes": 8388608 }
}
```

Use a different file with `--config ./config/govplane.prod.json`.
See [`docs/configuration.md`](docs/configuration.md).

## Output formats and exit codes

Every command supports `--format text` (default) and `--format json`, plus
`--quiet` and `--verbose`.

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | Success                                                             |
| `1`  | Validation failed / document could not be parsed                    |
| `2`  | File or working-folder error                                        |
| `3`  | Invalid CLI arguments                                               |
| `4`  | Unsupported schema, unsupported Node.js, or signature check failed  |
| `5`  | Unexpected internal error                                           |
| `7`  | CLI Toolkit unavailable or inactive                                 |

See [`docs/exit-codes.md`](docs/exit-codes.md).

## Runtime bundle parity

Local validation mirrors the remote validator used when Govplane materialises a
bundle, so a bundle that passes `govplane validate` also passes remote
validation.

Checksums and signatures are computed over the **canonical payload**: the
bundle projected down to `schemaVersion`, `orgId`, `projectId`, `env` and
`policies[] → policyKey, activeVersion, defaults, rules`, with every object key
sorted and serialised without whitespace. `generatedAt`, `bundleVersion`,
`checksum` and `signature` are excluded.

Details, including the deterministic ordering rules: [`docs/bundle-parity.md`](docs/bundle-parity.md).

## Programmatic use

The package also ships its building blocks as a library, so other Govplane
tooling can reuse them without shelling out:

```ts
import { validateDocument, computeChecksum, summariseBundle } from '@govplane/cli';

const result = validateDocument({ document: bundle, file: 'policy-bundle.json' });
if (!result.valid) {
  console.error(result.errors);
}
```

## Development

```bash
npm install
npm run build         # compile TypeScript to dist/
npm test              # run the test suite
npm run test:coverage # run tests with coverage thresholds
npm run lint          # Airbnb style checks
npm run typecheck     # type-check sources and tests
```

The CLI has **zero runtime dependencies** — only Node.js built-ins.

Architecture notes: [`docs/architecture.md`](docs/architecture.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Platformstack Technologies OÜ. and contributors. See [NOTICE.md](NOTICE.md) for third-party notices.
