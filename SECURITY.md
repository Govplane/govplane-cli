# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report them privately to **security@govplane.com**, or through GitHub's private
vulnerability reporting on this repository.

Include, where possible:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The CLI version (`govplane version --verbose`) and your platform

We aim to acknowledge a report within three business days and to keep you
updated while we work on a fix. Please give us a reasonable window to release a
patch before any public disclosure.

## Scope notes

The Govplane CLI is a local tool. When assessing a report, these properties are
the ones we consider security-relevant:

- **No implicit network access.** Basic commands must never contact a remote
  service. Only `govplane version --check` may, and only when asked.
- **No secret exposure.** Verbose output must never print authentication
  tokens, OTP values, licence keys, private signing keys or sensitive
  environment variables.
- **Signature and checksum verification.** Verification must be performed over
  the canonical payload described in `docs/bundle-parity.md`. A bundle whose
  content no longer matches its signature or checksum must be reported as
  invalid.
- **Safe file handling.** Writes are atomic; a failed operation must not leave a
  partially written or corrupted policy document, and existing files are never
  overwritten silently.

Findings that break any of the above are in scope, as are issues in the
argument, configuration or document parsing paths that could lead to unexpected
file writes or code execution.
