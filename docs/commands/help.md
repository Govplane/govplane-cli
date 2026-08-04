# `govplane help`

Provides contextual documentation for the CLI and its commands. It works
entirely offline.

```bash
govplane help [command]
govplane --help
govplane -h
```

Running `govplane` with no arguments prints the same general help.

## General help

```text
Govplane CLI

Usage:
  govplane <command> [options]

Basic commands:
  validate          Validate a policy draft or bundle
  inspect           Inspect a policy draft or bundle
  version           Display CLI version information
  help              Display CLI documentation

Working folder:
  working-folder    Show or configure the working folder

Runtime Kit commands:
  analyze           Analyse the codebase for policy evaluation points
  build             Build a policy bundle from drafts
  sign              Sign a policy bundle
  simulate          Simulate policy evaluations locally
  policies          Manage local policy drafts

  Runtime Kit required. The Runtime Kit is free and runs locally.

Global options:
  -w, --working-folder <path>   Directory Govplane reads and writes project files in
      --config <path>           Configuration file to use
      --format <text|json>      Output format
      --quiet                   Suppress non-essential output
      --verbose                 Display additional diagnostic information
  -h, --help                    Display help
  -v, --version                 Display the CLI version

Examples:
  govplane validate ./policy-bundle.json
  govplane inspect --policies
  govplane working-folder set ./governance

Run "govplane help <command>" for command documentation.
```

Registration is never required for the basic commands, and the help output says
so by omission: only Runtime Kit commands are labelled.

## Command help

```bash
govplane help validate
govplane validate --help
```

Command help is generated from the command definition itself, so the documented
options can never drift from the options the parser accepts.

```text
Validate a Govplane policy draft or bundle. The file is never modified.

Usage:
  govplane validate [file] [options]

Arguments:
  file              Draft or bundle file to validate

Options:
      --type <type>             auto, draft or bundle
      --strict                  Treat warnings as errors
      --format <format>         Output format: text or json
  -w, --working-folder <path>   Directory Govplane reads and writes project files in
      --config <path>           Configuration file to use instead of govplane.config.json
      --quiet                   Suppress non-essential output
      --verbose                 Display additional diagnostic information
  -h, --help                    Display command help

Examples:
  govplane validate
  govplane validate ./policy-bundle.json --type bundle
  govplane validate --strict --format json
```

## Unknown commands

```bash
govplane validte
```

```text
Error: Unknown command: validte

Did you mean?
  validate

Run:
  govplane help
```

Suggestions use an edit-distance match, so only genuinely close names are
offered.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0` | Help displayed |
| `3` | Unknown command or unknown help topic |
