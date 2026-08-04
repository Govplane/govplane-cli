import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Oldest Node.js major release the CLI supports. Mirrored in bin/govplane.js. */
export const MINIMUM_NODE_MAJOR = 20;

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

export const isSupportedNodeVersion = (version: string = process.versions.node): boolean => {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return !Number.isNaN(major) && major >= MINIMUM_NODE_MAJOR;
};

export const unsupportedNodeMessage = (version: string = process.versions.node): string => (
  `Govplane CLI requires Node.js ${MINIMUM_NODE_MAJOR} or later. Current version: Node.js ${version}`
);
