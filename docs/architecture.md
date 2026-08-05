# Architecture

The CLI is a small, dependency-free TypeScript program. It is organised in
layers so that the policy logic can be reused — by the Govplane Toolkit, by CI
tooling, or by tests — without going through a terminal.

```text
bin/govplane.js        Launcher: Node.js version guard, then dist/cli.js
  └── src/cli.ts       Parse argv → resolve command → run → map errors to exit codes
        ├── src/args        Argument parsing and shared option specs
        ├── src/commands    One module per command + registry + help rendering
        ├── src/core        Reporter, working folder, configuration, files, paths
        └── src/domain      Document model, validation, canonicalisation, signatures
```

## Layers

### `bin/`

The only file that runs before the build output is loaded. It is written in
deliberately old syntax so that an unsupported Node.js version produces a
readable message instead of a syntax error, and it imports `dist/cli.js`
dynamically only after that check passes.

### `src/args`

A zero-dependency parser. It supports `--flag`, `--no-flag`, `--name value`,
`--name=value`, `-w value`, `-h`, and `--` as a terminator, with options either
before or after the command name.

Because the parser must know which flags take a value before it can tell which
token is the command, tokenisation uses the union of every command's options;
`cli.ts` then rejects options that do not belong to the resolved command.

### `src/core`

Infrastructure with no policy knowledge:

| Module | Responsibility |
| ------ | -------------- |
| `reporter.ts` | The single output surface — text/JSON, quiet, verbose, colour |
| `workingFolder.ts` | Resolution precedence and directory validation |
| `projectConfig.ts` | `govplane.config.json` loading and path resolution |
| `userConfig.ts` | The user-level configuration file |
| `files.ts` | Guarded reads, atomic writes, backups |
| `json.ts` | Non-throwing JSON parsing with line/column positions |
| `runtimeKit.ts` | Local CLI Toolkit detection |
| `errors.ts`, `exitCodes.ts` | The error type and the exit-code contract |

### `src/domain`

Everything that understands Govplane documents, and the part most worth reusing:

| Module | Responsibility |
| ------ | -------------- |
| `types.ts` | The document model and shared guards |
| `detect.ts` | Infers bundle vs draft from the contents |
| `canonical.ts` | Canonical projection, checksum, ETag, ordering |
| `signature.ts` | Ed25519 and ECDSA_SHA_256 verification |
| `summary.ts` | The projections `inspect` renders |
| `validation/` | Bundle, draft, effect and condition rules |

### `src/commands`

Each command is a `CommandDefinition`: metadata, its option specs, and a `run`
function. Help output is generated from those definitions, so documented
options cannot drift from the options the parser accepts.

## Design decisions

**Errors are values until the very end.** Commands throw `CliError`, which
carries a machine-readable code, an exit code and extra lines to print.
`cli.ts` is the only place that turns an error into output and a process exit
code. Anything that is not a `CliError` becomes exit code `5`.

**Validation collects, it does not abort.** The remote validator throws on the
first violation; the CLI reports everything it can find in one pass, so a
document can be fixed in one edit. The rules themselves stay in parity — see
[bundle parity](bundle-parity.md).

**`run()` returns a number.** The entry point never calls `process.exit`, so the
CLI can be driven programmatically and tested end to end with in-memory streams
and a temporary `GOVPLANE_HOME`.

**Output goes through the reporter.** No command writes to `process.stdout`
directly, which is what makes `--quiet`, `--format json` and output capture
behave the same everywhere.

**Synchronous filesystem access.** The CLI is a short-lived process handling
small local documents. Synchronous calls keep ordering, error handling and exit
codes simple; the ESLint rule that discourages them is disabled deliberately.

**Zero runtime dependencies.** Only Node.js built-ins. This keeps the install
small, the supply chain narrow, and the "own your runtime" promise credible.

## Adding a command

1. Create `src/commands/<name>.ts` exporting a `CommandDefinition`.
2. Reuse `commonOptions` / `formatOption` so flags stay consistent.
3. Register it in `src/commands/registry.ts` — help and the parser pick it up
   from there.
4. Add tests: unit tests for new domain logic, and an end-to-end test driving
   `run()` through `test/helpers/harness.ts`.
5. Document it in `docs/commands/` and link it from `docs/README.md`.
