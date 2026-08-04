/**
 * Minimal, dependency-free ANSI styling.
 *
 * Colour is opt-out through the `NO_COLOR` convention and is disabled whenever
 * the stream is not a TTY, so piped and CI output stays plain text.
 */
export interface ColorSupportInput {
  isTty: boolean;
  env: NodeJS.ProcessEnv;
}

export const supportsColor = ({ isTty, env }: ColorSupportInput): boolean => {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') {
    return true;
  }
  if (env.TERM === 'dumb') {
    return false;
  }
  return isTty;
};

const ESC = '\u001B[';

const wrap = (open: number, close: number) => (
  (value: string, enabled: boolean): string => (
    enabled ? `${ESC}${open}m${value}${ESC}${close}m` : value
  )
);

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
