import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Oldest release the CLI accepts on each supported Node.js line: the
 * 21 October 2026 security releases that fix CVE-2026-111497 (Brotli
 * decompression). Lines without an entry — 20, 23, 25 and older — never got
 * the fix. Lines newer than the last entry shipped with it. Mirrored in
 * bin/govplane.js.
 */
export const PATCHED_NODE_RELEASES = ['22.23.4', '24.22.1', '26.12.1'] as const;

/** Oldest Node.js major release the CLI supports. */
export const MINIMUM_NODE_MAJOR = 22;

const FALLBACK_VERSION = '0.0.0';

const packageJsonPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/core` during development, `dist/core` once compiled — both are two
  // levels below the package root.
  return join(here, '..', '..', 'package.json');
};

/** Reads the CLI version from its own package manifest. */
export const readCliVersion = (): string => {
  try {
    const raw = JSON.parse(readFileSync(packageJsonPath(), 'utf8')) as { version?: unknown };
    return typeof raw.version === 'string' ? raw.version : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
};

const parseRelease = (version: string): [number, number, number] | undefined => {
  const parts = version.replace(/^v/, '').split('.').slice(0, 3)
    .map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined;
  return parts as [number, number, number];
};

const PATCHED = PATCHED_NODE_RELEASES.map((release) => parseRelease(release)!);

export const isSupportedNodeVersion = (version: string = process.versions.node): boolean => {
  const release = parseRelease(version);
  if (release === undefined) return false;
  const [major, minor, patch] = release;

  const newest = PATCHED[PATCHED.length - 1]!;
  if (major > newest[0]) return true;

  const floor = PATCHED.find(([floorMajor]) => floorMajor === major);
  if (floor === undefined) return false;
  if (minor !== floor[1]) return minor > floor[1];
  return patch >= floor[2];
};

export const unsupportedNodeMessage = (version: string = process.versions.node): string => (
  `Govplane CLI requires Node.js ${PATCHED_NODE_RELEASES.map((r) => `${r}+`).join(', ')} `
  + `(CVE-2026-111497). Current version: Node.js ${version}`
);
