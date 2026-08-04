import {
  bold, cyan, dim, green, red, yellow,
} from './color.js';

export type OutputFormat = 'text' | 'json';

export interface WritableLike {
  write(chunk: string): unknown;
}

/**
 * Input a command can read from.
 *
 * Deliberately the Node stream shape rather than a custom prompt abstraction:
 * tests pass a real `Readable`, so the prompting code under test is the code
 * that ships rather than a stand-in for it.
 */
export interface ReadableLike extends NodeJS.ReadableStream {
  isTTY?: boolean;
}

export interface ReporterOptions {
  stdout: WritableLike;
  stderr: WritableLike;
  format?: OutputFormat;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
}

/**
 * Single output surface for the CLI.
 *
 * Commands never write to `process.stdout` directly: everything goes through a
 * reporter so that `--quiet`, `--verbose`, `--format json` and colour handling
 * behave identically across commands and remain testable.
 */
export class Reporter {
  private readonly stdout: WritableLike;

  private readonly stderr: WritableLike;

  readonly format: OutputFormat;

  readonly quiet: boolean;

  readonly verbose: boolean;

  readonly color: boolean;

  constructor(options: ReporterOptions) {
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.format = options.format ?? 'text';
    this.quiet = options.quiet ?? false;
    this.verbose = options.verbose ?? false;
    this.color = options.color ?? false;
  }

  /** Prints a line of human-readable output. Suppressed by `--quiet` and `--format json`. */
  line(text = ''): void {
    if (this.quiet || this.format !== 'text') {
      return;
    }
    this.stdout.write(`${text}\n`);
  }

  /** Prints several lines at once. */
  lines(values: string[]): void {
    values.forEach((value) => this.line(value));
  }

  /** Prints diagnostic output, only when `--verbose` is active. */
  debug(text: string): void {
    if (!this.verbose || this.quiet || this.format !== 'text') {
      return;
    }
    this.stdout.write(`${dim(text, this.color)}\n`);
  }

  /** Prints a JSON document. Always emitted, even in quiet mode. */
  json(value: unknown): void {
    this.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }

  /** Prints an error line to stderr. Never suppressed by `--quiet`. */
  error(text: string): void {
    this.stderr.write(`${text}\n`);
  }

  errorLines(values: string[]): void {
    values.forEach((value) => this.error(value));
  }

  success(text: string): string {
    return green(text, this.color);
  }

  failure(text: string): string {
    return red(text, this.color);
  }

  warning(text: string): string {
    return yellow(text, this.color);
  }

  heading(text: string): string {
    return bold(text, this.color);
  }

  accent(text: string): string {
    return cyan(text, this.color);
  }

  muted(text: string): string {
    return dim(text, this.color);
  }
}
