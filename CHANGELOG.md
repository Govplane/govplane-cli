# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  documents that are not bundles, and a Runtime Kit discovery bridge that merges
  toolkit commands into the registry.
- Optional `stdin` on `CliStreams` and `CommandContext`, for commands that
  prompt. Kept optional and paired with an `isTTY` check so a command never
  blocks waiting on input that is not there.
- `runtimeKitCommands` is exported, so the toolkit can assert it implements
  every command the CLI declares a placeholder for.

## [1.0.0] - 2026-07-29

First open-source release of the Govplane CLI.

### Added

- `govplane validate` — validates policy drafts and runtime bundles in parity
  with the remote validator used during safe bundle materialisation. Supports
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
- Runtime Kit detection: `analyze`, `build`, `sign`, `simulate` and `policies`
  are documented and report how to enable them, without ever installing
  anything automatically.
- Canonical bundle projection, SHA-256 checksum verification, ETag derivation
  and deterministic ordering checks.
- Stable exit codes and `--format json` output for automation.
- A programmatic API exporting the validation, canonicalisation and summary
  building blocks.

[Unreleased]: https://github.com/govplane/govplane-cli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/govplane/govplane-cli/releases/tag/v1.0.0
