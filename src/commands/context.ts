import { existsSync } from 'node:fs';
import { readString } from '../args/parser.js';
import { readTextFile } from '../core/files.js';
import { parseJson, type JsonPosition } from '../core/json.js';
import {
  loadProjectConfig, resolveBundlePath, resolveDraftPath, resolveMaxFileBytes,
  type ProjectConfig,
} from '../core/projectConfig.js';
import { readUserConfig } from '../core/userConfig.js';
import {
  assertUsableWorkingFolder, resolvePath, resolveWorkingFolder, WORKING_FOLDER_SOURCE_LABEL,
  type ResolvedWorkingFolder,
} from '../core/workingFolder.js';
import type { CommandContext } from './types.js';

export interface ResolvedProject {
  workingFolder: ResolvedWorkingFolder;
  config: ProjectConfig;
  configPath: string | null;
  draftPath: string;
  bundlePath: string;
  maxFileBytes: number;
}

export interface ResolveProjectOptions {
  requireWritable?: boolean;
  /** Skips existence checks — used by `working-folder set --create`. */
  skipValidation?: boolean;
}

/**
 * Resolves everything a project-aware command needs: the working folder, the
 * configuration file and the default document paths.
 */
export const resolveProject = (
  context: CommandContext,
  options: ResolveProjectOptions = {},
): ResolvedProject => {
  const persisted = readUserConfig(context.env).workingFolder;
  const workingFolder = resolveWorkingFolder({
    flag: readString(context.options, 'working-folder'),
    env: context.env,
    persisted,
    cwd: context.cwd,
  });

  context.reporter.debug(`Working folder: ${workingFolder.path}`);
  context.reporter.debug(`Source: ${WORKING_FOLDER_SOURCE_LABEL[workingFolder.source]}`);

  if (!options.skipValidation) {
    assertUsableWorkingFolder(workingFolder.path, {
      requireWritable: options.requireWritable ?? false,
    });
  }

  const { config, path: configPath } = loadProjectConfig(
    workingFolder.path,
    readString(context.options, 'config'),
  );

  if (configPath !== null) {
    context.reporter.debug(`Configuration file: ${configPath}`);
  }

  return {
    workingFolder,
    config,
    configPath,
    draftPath: resolveDraftPath(config, workingFolder.path),
    bundlePath: resolveBundlePath(config, workingFolder.path),
    maxFileBytes: resolveMaxFileBytes(config),
  };
};

export interface DocumentLoadSuccess {
  ok: true;
  path: string;
  document: unknown;
}

export interface DocumentLoadFailure {
  ok: false;
  path: string;
  message: string;
  position?: JsonPosition;
}

export type DocumentLoad = DocumentLoadSuccess | DocumentLoadFailure;

/**
 * Reads and parses a JSON document.
 *
 * Filesystem problems throw (they are working-folder errors); malformed JSON is
 * returned as a failure so commands can report it as a document problem.
 */
export const loadDocument = (path: string, maxBytes?: number): DocumentLoad => {
  const text = readTextFile(path, maxBytes === undefined ? {} : { maxBytes });
  const parsed = parseJson(text);

  if (!parsed.ok) {
    return {
      ok: false,
      path,
      message: parsed.message,
      ...(parsed.position ? { position: parsed.position } : {}),
    };
  }

  return { ok: true, path, document: parsed.value };
};

export interface DocumentTargets {
  paths: string[];
  /** True when the paths came from configuration rather than an explicit argument. */
  fromDefaults: boolean;
}

/**
 * Resolves which documents a command should act on: an explicit file argument,
 * or the configured bundle and draft files that actually exist.
 */
export const resolveDocumentTargets = (
  context: CommandContext,
  project: ResolvedProject,
): DocumentTargets => {
  const explicit = context.positionals[0];
  if (explicit !== undefined) {
    return { paths: [resolvePath(explicit, context.cwd)], fromDefaults: false };
  }

  const candidates = [project.bundlePath, project.draftPath].filter((path) => existsSync(path));
  return { paths: candidates, fromDefaults: true };
};
