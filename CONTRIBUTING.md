# Contributing to the Govplane CLI

Thanks for taking the time to contribute. This document explains how to get set
up, what we expect from a change, and how the project is organised.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/govplane/govplane-cli.git
cd govplane-cli
npm install
npm test
```

Requirements: Node.js 20 or later.

Useful scripts:

| Script                  | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `npm run build`         | Compile TypeScript into `dist/`               |
| `npm test`              | Run the Jest suite                            |
| `npm run test:coverage` | Run tests and enforce coverage thresholds     |
| `npm run lint`          | Check the Airbnb style rules                  |
| `npm run lint:fix`      | Apply the fixes ESLint can make automatically |
| `npm run typecheck`     | Type-check sources and tests                  |

Run the CLI from a build during development:

```bash
npm run build
node bin/govplane.js validate -w ./examples
```

## Project principles

Changes are reviewed against the principles the product is built on. Please
keep them in mind before opening a pull request.

1. **The runtime belongs to the user.** Nothing in the basic CLI may require a
   Govplane account, a subscription, or a network call.
2. **No hidden network access.** Only explicitly requested operations — today
   just `version --check` — may contact a remote service.
3. **Zero runtime dependencies.** The published package depends on Node.js
   built-ins only. New runtime dependencies need a strong justification and a
   spec update.
4. **Parity with the control plane.** Bundle validation, canonicalisation and
   signature verification must match the remote implementation. If one changes,
   both change, and the parity tests are updated together.
5. **Read-only stays read-only.** `validate`, `inspect`, `version` and `help`
   never modify files. Writes are atomic and never leave partial documents.
6. **Automation first.** Stable exit codes and `--format json` for anything a
   CI pipeline might consume.

## Code style

- The [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) is
  the project standard, enforced by ESLint. `npm run lint` must pass.
- TypeScript in `strict` mode; avoid `any`.
- Prefer small, pure functions. Commands are a set of helpers plus one `run`.
- Never write to `process.stdout` directly — always go through the reporter, so
  `--quiet`, `--format` and stream capture behave consistently.
- Comments explain *why*, not *what*.

## Tests

- Jest, with at least **80% coverage** enforced in `jest.config.js`.
- Unit tests for domain logic; end-to-end tests that drive `run()` with a
  temporary sandbox for command behaviour (see `test/helpers/harness.ts`).
- Tests must not touch the real user profile: the harness isolates state with
  `GOVPLANE_HOME`.
- A bug fix should come with a regression test.

## Repository layout

```text
bin/            Executable launcher (Node.js version guard)
src/args/       Dependency-free argument parser and shared option specs
src/commands/   One module per command, plus the registry and help rendering
src/core/       Reporter, working folder, configuration, file and path helpers
src/domain/     Document model, validation, canonicalisation, signatures
test/           Unit and end-to-end tests
docs/           User documentation
examples/       Sample bundle, draft, configuration and signing key
```

## Pull requests

1. Create a branch from `main`.
2. Keep the change focused; unrelated refactors belong in their own PR.
3. Make sure `npm run lint`, `npm run typecheck` and `npm run test:coverage`
   all pass.
4. Update the documentation in `docs/` and the `README.md` when behaviour
   changes, and add a `CHANGELOG.md` entry under *Unreleased*.
5. Describe the change and the reasoning in the PR body.

## Reporting bugs

Open an issue with the command you ran, what you expected, what happened, and
the output of `govplane version --verbose`. Please redact policy contents and
any sensitive values.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.
