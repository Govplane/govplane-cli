import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync,
  unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { ExitCode } from './exitCodes.js';
import { CliError, fileError } from './errors.js';

/** Default upper bound for documents the CLI is willing to read (8 MiB). */
export const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;

const UTF8_BOM = '\uFEFF';

export interface ReadTextOptions {
  maxBytes?: number;
}

export const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

export const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * Reads a UTF-8 text document, enforcing the file-validation stage documented
 * for `govplane validate`: the path must exist, be a regular file, be readable,
 * stay within the size limit and use a supported encoding.
 */
export const readTextFile = (path: string, options: ReadTextOptions = {}): string => {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_BYTES;

  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    throw fileError(`File not found: ${path}`, 'FILE_NOT_FOUND', [
      'Check the path, or run the command from the project directory.',
    ]).withCause(error);
  }

  if (stats.isDirectory()) {
    throw fileError(`Expected a file but found a directory: ${path}`, 'NOT_A_FILE');
  }

  if (stats.size > maxBytes) {
    throw fileError(
      `File is larger than the supported limit: ${path}`,
      'FILE_TOO_LARGE',
      [`Size: ${stats.size} bytes`, `Limit: ${maxBytes} bytes`],
    );
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(path);
  } catch (error) {
    throw fileError(`File could not be read: ${path}`, 'FILE_NOT_READABLE', [
      'Check the file permissions.',
    ]).withCause(error);
  }

  if (buffer.length >= 2) {
    const isUtf16Le = buffer[0] === 0xff && buffer[1] === 0xfe;
    const isUtf16Be = buffer[0] === 0xfe && buffer[1] === 0xff;
    if (isUtf16Le || isUtf16Be) {
      throw fileError(
        `Unsupported file encoding: ${path}`,
        'UNSUPPORTED_ENCODING',
        ['Govplane documents must be UTF-8 encoded.'],
      );
    }
  }

  const text = buffer.toString('utf8');
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
};

export const ensureDirectory = (path: string): void => {
  try {
    mkdirSync(path, { recursive: true });
  } catch (error) {
    throw new CliError(`Directory could not be created: ${path}`, {
      code: 'DIRECTORY_NOT_CREATED',
      exitCode: ExitCode.FileError,
      cause: error,
    });
  }
};

/**
 * Writes a file atomically: content is flushed to a temporary sibling, fsynced
 * and then renamed over the destination. A failed write therefore never leaves
 * a partially written policy document behind.
 */
export const atomicWriteFile = (path: string, content: string): void => {
  const directory = dirname(path);
  ensureDirectory(directory);
  const temporaryPath = join(directory, `.${Date.now()}-${process.pid}.govplane.tmp`);

  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, 'w');
    writeSync(descriptor, content, null, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        /* the original error is more useful than a close failure */
      }
    }
    if (existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        /* best effort cleanup */
      }
    }
    throw new CliError(`File could not be written: ${path}`, {
      code: 'FILE_NOT_WRITABLE',
      exitCode: ExitCode.FileError,
      cause: error,
    });
  }
};

/** Copies a file to `<path>.backup-<timestamp>` before it is overwritten. */
export const backupFile = (path: string, timestamp: string): string => {
  const backupPath = `${path}.backup-${timestamp}`;
  writeFileSync(backupPath, readFileSync(path));
  return backupPath;
};
