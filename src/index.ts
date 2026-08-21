/**
 * Public API of `@govplane/cli`.
 *
 * The CLI is primarily a command-line tool, but its validation, canonicalisation
 * and summary building blocks are exported so the Govplane Toolkit and other
 * tooling can reuse them without shelling out.
 */
export { run, main, type RunOptions, type CliStreams } from './cli.js';
export {
  commands, mergeCommands, findCommandIn, commandNames, allOptionSpecs,
  toolkitCommands,
} from './commands/registry.js';
export type {
  CommandContext, CommandDefinition, CommandArgument, CommandGroup,
} from './commands/types.js';
export type { OptionSpec, ParsedOptions, OptionType } from './args/types.js';
export {
  parseArgv, readBoolean, readList, readOptional, readString,
} from './args/parser.js';
export {
  commonOptions, formatOption, helpOption, quietOption, verboseOption,
  workingFolderOption, configOption,
} from './args/options.js';
export { loadToolkitCommands, TOOLKIT_PACKAGE } from './core/toolkitBridge.js';
export { renderCommandHelp, renderGeneralHelp, suggestCommand } from './commands/helpText.js';
export {
  resolveProject, loadDocument, resolveDocumentTargets,
  type ResolvedProject, type DocumentLoad,
} from './commands/context.js';

export { ExitCode, type ExitCodeValue } from './core/exitCodes.js';
export { CliError, isCliError } from './core/errors.js';
export {
  Reporter, type OutputFormat, type ReadableLike, type WritableLike,
} from './core/reporter.js';
export {
  resolveWorkingFolder, assertUsableWorkingFolder, WORKING_FOLDER_ENV,
  type ResolvedWorkingFolder, type WorkingFolderSource,
} from './core/workingFolder.js';
export {
  loadProjectConfig, resolveBundlePath, resolveDraftPath, CONFIG_FILE_NAME,
  DEFAULT_BUNDLE_FILE, DEFAULT_DRAFT_FILE, type ProjectConfig,
} from './core/projectConfig.js';
export { readUserConfig, writeUserConfig, type UserConfig } from './core/userConfig.js';
export {
  detectToolkit, toolkitRequiredMessage, type ToolkitStatus,
} from './core/toolkit.js';
export {
  atomicWriteFile, backupFile, ensureDirectory, isDirectory, isFile, readTextFile,
  DEFAULT_MAX_FILE_BYTES,
} from './core/files.js';
export { parseJson, stringifyJson, type JsonPosition } from './core/json.js';
export {
  systemClock, fixedClock, daysElapsed, fileTimestamp, type Clock,
} from './core/clock.js';
export {
  resolveGovplaneHome, userConfigPath, toolkitManifestPath, projectStatePath,
  projectTempPath, GOVPLANE_DIRECTORY,
} from './core/paths.js';
export { supportsColor } from './core/color.js';
export {
  readCliVersion, isSupportedNodeVersion, unsupportedNodeMessage, MINIMUM_NODE_MAJOR,
} from './core/environment.js';

export {
  canonicalPayload, canonicalDocument, computeChecksum, etagFromChecksum,
  projectCanonicalBundle, isDeterministicallyOrdered, verifyChecksum, sortKeysDeep,
} from './domain/canonical.js';
export { detectDocumentType, type DetectionResult } from './domain/detect.js';
export {
  inspectSignature, parsePublicKey, readSignatureMetadata,
  type SignatureInspection, type SignatureStatus,
} from './domain/signature.js';
export {
  summariseBundle, summariseDraft, collectTargets, collectContextUsage, formatTarget,
  type BundleSummary, type DraftSummary, type PolicySummary,
} from './domain/summary.js';
export {
  validateDocument, type ScopeOption, type ValidateDocumentInput,
} from './domain/validation/index.js';
export {
  validateBundle, type BundleScope, type ValidateBundleOptions,
} from './domain/validation/bundle.js';
export { validateDraft } from './domain/validation/draft.js';
export { ValidationCode, WarningCode } from './domain/validation/codes.js';
export type {
  ValidationIssue, ValidationResult, ValidationStats,
} from './domain/validation/result.js';
export * from './domain/types.js';
