# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-21

### Fixed

- **`govplane validate` no longer rejects bundles `govplane build` produces.**
  A build with no `--org-id` writes an unscoped bundle — the local-first shape
  the [build spec](../../specs/cli-toolkit/cli_toolkit_build_spec.md) section
  6.3 calls for, and what the `minimal-local` signing fixture represents.
  `validate` then reported two `MISSING_SCOPE_FIELDS` **errors** and exited 1,
  so the CLI refused its own output.

  `validate` now infers the profile from the document. A bundle declaring no
  scope at all is a local build, and its absent scope is a **warning** —
  matching what `build` already reports for the same file. A bundle declaring
  *half* a scope is still an error, because somebody meant to scope it and
  stopped. `--strict` turns the warning back into a failure, which is how to
  check a bundle is ready for Govplane Cloud.

  The rule set itself is unchanged: `validateBundle` still defaults to the
  cloud-compatible profile, and `analyze --compare` still uses it deliberately.

- **An unscoped bundle is no longer mistaken for a draft.** Document detection
  identified a bundle only by its scope fields or by a checksum or signature, so
  a locally built, unsigned bundle was validated against the *draft* rules and
  reported as "valid" for the wrong reasons — bundle problems were never
  checked. A `bundleVersion` revision counter, or the numeric `schemaVersion 1`
  that distinguishes a bundle from a draft's `"1.0"`, now identifies it. Both
  checks apply only where the document would previously have been called a
  draft, so nothing recognised as a bundle before can change.

### Added

- `BundleScope`, `ValidateBundleOptions`, `ScopeOption` and
  `ValidateDocumentInput` are exported, so a consumer can name the scope
  profile it is asking for instead of relying on an inline literal.

## [1.0.4] - 2026-08-15

### Changed

- `canonicalDocument` is now covered for documents with **no `subject` field**,
  which is the shape an activation licence takes when it was issued without an
  email address. The function itself is unchanged — it already omitted absent
  keys — but the behaviour is now pinned, including that an omitted `subject`
  and a `"subject": {}` produce different bytes. That distinction is what keeps
  a signer and a verifier from silently disagreeing.

## [1.0.3] - 2026-08-11

### Correction

- Corrected toolkit package name in toolkit bridge and other core files. The package name is `@govplane/cli-toolkit`, not `@govplane/toolkit`. This was a typo in the 1.0.2 release.

## [1.0.2] - 2026-08-10

### Updated

- The release workflow now uses the OIDC method to publish to npm with verified provenance, rather than a granular access token. This is to comply with npm’s new security requirements and in line with the rest of Govplane’s public packages.

### Minor correction

- Correction to the author's legal name in the ‘Licence’ section of README.md.

## [1.0.1] - 2026-08-05

### Changed

- **The advanced toolkit is now called the CLI Toolkit, not the Runtime Kit.**
  The old name suggested something that ran alongside the runtime; it is a set
  of commands that extends the CLI, and it is now named after what it is.

  The rename reaches the programmatic API. Every one of these symbols shipped in
  1.0.0, so anything importing them must be updated:

  | 1.0.0 | 1.0.1 |
  | --- | --- |
  | `detectRuntimeKit` | `detectToolkit` |
  | `runtimeKitRequiredMessage` | `toolkitRequiredMessage` |
  | `runtimeKitManifestPath` | `toolkitManifestPath` |
  | `runtimeKitCommands` | `toolkitCommands` |
  | `RuntimeKitStatus` | `ToolkitStatus` |
  | `ResolvedRuntimeKit` | `ResolvedToolkit` |
  | `ExitCode.RuntimeKitUnavailable` | `ExitCode.ToolkitUnavailable` |
  | `CommandDefinition.requiresRuntimeKit` | `requiresToolkit` |
  | `CommandContext.runtimeKit` | `toolkit` |
  | command group `'runtime-kit'` | `'toolkit'` |

  **Exit code values are unchanged.** `ToolkitUnavailable` is still `7`, and no
  other code moved, so shell scripts and CI pipelines that branch on exit status
  are unaffected.

- `govplane version --format json` reports the toolkit under `toolkit` rather
  than `runtimeKit`. Automation reading that field must be updated; every other
  field is unchanged.
- The `--install-kit` flag keeps its name, so existing scripts and documentation
  that invoke it continue to work. Only its wording changed.
- Documentation no longer describes remote bundle materialisation as producing a
  "safe bundle". The SDK replaced that concept with local bundles, which may come
  from any source and are verified identically, and the CLI's wording now matches.

### Fixed

- `validate` no longer rejects a bundle whose `bundleVersion` is greater than 1.
  It is a revision counter that Govplane increments on every materialisation, so
  the previous rule — requiring it to equal 1 — rejected every real bundle after
  its first revision. It is now validated as a whole number of 1 or more.

### Added

- `validateBundle` accepts a `scope` option. The default, cloud-compatible
  profile still requires `orgId` and `projectId`; the local-first profile used by
  `govplane build` reports their absence as a warning instead.
- Injectable clock (`RunOptions.now`), `canonicalDocument()` for signed
  documents that are not bundles, and a CLI Toolkit discovery bridge that merges
  toolkit commands into the registry.
- Optional `stdin` on `CliStreams` and `CommandContext`, for commands that
  prompt. Kept optional and paired with an `isTTY` check so a command never
  blocks waiting on input that is not there.

## [1.0.0] - 2026-07-29

First open-source release of the Govplane CLI.

### Added

- `govplane validate` — validates policy drafts and runtime bundles in parity
  with the remote validator used during bundle materialisation. Supports
  `--type`, `--strict`, `--format`, `--quiet`, `--config` and `--working-folder`.
- `govplane inspect` — human-readable summaries of drafts and bundles, plus
  `--policies`, `--policy`, `--targets`, `--context` and `--signature`, with
  Ed25519 and ECDSA_SHA_256 signature verification over the canonical payload.
- `govplane version` — version and environment information, with an opt-in
  `--check` update check.
- `govplane help` — offline documentation for the CLI and each command,
  including suggestions for mistyped commands.
- `govplane working-folder` — show, `set`, `reset` and `init` the working
  folder, with `--create` and `--force`.
- Working-folder resolution precedence: command flag, `GOVPLANE_WORKING_FOLDER`,
  persisted CLI configuration, current terminal directory.
- Project configuration through `govplane.config.json`, with `--config`
  overrides.
- CLI Toolkit detection: `analyze`, `build`, `sign`, `simulate` and `policies`
  are documented and report how to enable them, without ever installing
  anything automatically.
- Canonical bundle projection, SHA-256 checksum verification, ETag derivation
  and deterministic ordering checks.
- Stable exit codes and `--format json` output for automation.
- A programmatic API exporting the validation, canonicalisation and summary
  building blocks.

[Unreleased]: https://github.com/govplane/govplane-cli/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/govplane/govplane-cli/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/govplane/govplane-cli/releases/tag/v1.0.0
