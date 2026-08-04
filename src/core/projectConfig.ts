import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileError } from './errors.js';
import { readTextFile, DEFAULT_MAX_FILE_BYTES } from './files.js';
import { parseJson } from './json.js';
import { resolvePath } from './workingFolder.js';

export const CONFIG_FILE_NAME = 'govplane.config.json';
export const DEFAULT_DRAFT_FILE = 'policy-drafts.json';
export const DEFAULT_BUNDLE_FILE = 'policy-bundle.json';

export interface ProjectConfig {
  schemaVersion?: number | string;
  draft?: { path?: string };
  bundle?: { path?: string };
  /** Optional verification material for `govplane inspect --signature`. */
  signature?: { publicKeyPath?: string };
  limits?: { maxFileBytes?: number };
  /** Settings for the Runtime Kit's `policies` command. */
  policies?: {
    versioning?: { enabled?: boolean };
    defaultFormat?: string;
  };
}

export interface LoadedProjectConfig {
  config: ProjectConfig;
  /** Absolute path of the configuration file, or `null` when none was found. */
  path: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readNestedPath = (value: unknown, key: string): { path?: string } | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const nested = value[key];
  if (!isRecord(nested)) {
    return undefined;
  }
  const {path} = nested;
  return typeof path === 'string' ? { path } : {};
};

const normalise = (value: unknown, source: string): ProjectConfig => {
  if (!isRecord(value)) {
    throw fileError(
      'Configuration file must contain a JSON object.',
      'INVALID_CONFIG',
      [`File: ${source}`],
    );
  }

  const config: ProjectConfig = {};
  const {schemaVersion} = value;
  if (typeof schemaVersion === 'number' || typeof schemaVersion === 'string') {
    config.schemaVersion = schemaVersion;
  }

  const draft = readNestedPath(value, 'draft');
  if (draft) {
    config.draft = draft;
  }
  const bundle = readNestedPath(value, 'bundle');
  if (bundle) {
    config.bundle = bundle;
  }

  const {signature} = value;
  if (isRecord(signature) && typeof signature.publicKeyPath === 'string') {
    config.signature = { publicKeyPath: signature.publicKeyPath };
  }

  const {limits} = value;
  if (isRecord(limits) && typeof limits.maxFileBytes === 'number') {
    config.limits = { maxFileBytes: limits.maxFileBytes };
  }

  const {policies} = value;
  if (isRecord(policies)) {
    const {versioning} = policies;
    config.policies = {
      ...(isRecord(versioning) && typeof versioning.enabled === 'boolean'
        ? { versioning: { enabled: versioning.enabled } }
        : {}),
      ...(typeof policies.defaultFormat === 'string'
        ? { defaultFormat: policies.defaultFormat }
        : {}),
    };
  }

  return config;
};

/**
 * Loads `govplane.config.json` from the working folder, or an explicit file
 * supplied with `--config`. An explicit file that does not exist is an error;
 * a missing default file is not.
 */
export const loadProjectConfig = (
  workingFolder: string,
  explicitPath?: string,
): LoadedProjectConfig => {
  const path = explicitPath === undefined
    ? join(workingFolder, CONFIG_FILE_NAME)
    : resolvePath(explicitPath, workingFolder);

  if (!existsSync(path)) {
    if (explicitPath !== undefined) {
      throw fileError(`Configuration file not found: ${path}`, 'CONFIG_NOT_FOUND');
    }
    return { config: {}, path: null };
  }

  const parsed = parseJson(readTextFile(path));
  if (!parsed.ok) {
    throw fileError(
      'Configuration file is not valid JSON.',
      'INVALID_CONFIG',
      [`File: ${path}`, parsed.message],
    );
  }

  return { config: normalise(parsed.value, path), path };
};

export const resolveDraftPath = (
  config: ProjectConfig,
  workingFolder: string,
): string => resolvePath(config.draft?.path ?? DEFAULT_DRAFT_FILE, workingFolder);

export const resolveBundlePath = (
  config: ProjectConfig,
  workingFolder: string,
): string => resolvePath(config.bundle?.path ?? DEFAULT_BUNDLE_FILE, workingFolder);

export const resolveMaxFileBytes = (config: ProjectConfig): number => (
  config.limits?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
);
