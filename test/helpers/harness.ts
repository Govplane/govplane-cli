import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { run } from '../../src/cli.js';
import { stringifyJson } from '../../src/core/json.js';

export interface MemoryStream {
  isTTY: boolean;
  chunks: string[];
  write(chunk: string): boolean;
  text(): string;
}

export const memoryStream = (): MemoryStream => {
  const chunks: string[] = [];
  return {
    isTTY: false,
    chunks,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    text() {
      return chunks.join('');
    },
  };
};

export interface Sandbox {
  root: string;
  home: string;
  project: string;
  env: NodeJS.ProcessEnv;
  /** Writes a JSON file inside the project directory and returns its path. */
  writeJson(relativePath: string, value: unknown): string;
  writeText(relativePath: string, content: string): string;
  cleanup(): void;
}

export const createSandbox = (): Sandbox => {
  const root = mkdtempSync(join(tmpdir(), 'govplane-cli-test-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });

  return {
    root,
    home,
    project,
    env: { GOVPLANE_HOME: home },
    writeJson(relativePath: string, value: unknown) {
      const path = join(project, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, stringifyJson(value));
      return path;
    },
    writeText(relativePath: string, content: string) {
      const path = join(project, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      return path;
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
};

export interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
  json(): unknown;
}

/** Runs the CLI against a sandbox, capturing output instead of writing to the terminal. */
export const runCli = async (
  argv: string[],
  sandbox: Sandbox,
  overrides: { cwd?: string; env?: NodeJS.ProcessEnv; now?: () => Date } = {},
): Promise<CliRunResult> => {
  const stdout = memoryStream();
  const stderr = memoryStream();

  const code = await run(argv, {
    streams: { stdout, stderr },
    cwd: overrides.cwd ?? sandbox.project,
    env: { ...sandbox.env, ...overrides.env },
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });

  return {
    code,
    stdout: stdout.text(),
    stderr: stderr.text(),
    json() {
      return JSON.parse(stdout.text()) as unknown;
    },
  };
};
