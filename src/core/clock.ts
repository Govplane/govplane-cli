/**
 * Time access for the CLI.
 *
 * Commands read the current time through an injected clock rather than calling
 * `new Date()` directly, so time-dependent behaviour — timestamps in generated
 * files, and the toolkit's activation grace period — can be tested at any
 * instant without touching the system clock.
 */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** A clock frozen at a fixed instant. Intended for tests and reproducible runs. */
export const fixedClock = (instant: Date | string): Clock => {
  const frozen = instant instanceof Date ? instant : new Date(instant);
  return () => new Date(frozen.getTime());
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days elapsed from `from` to `to`, floored and never negative.
 *
 * A clock that has moved backwards — a corrected system time, or a licence
 * timestamp from the future — yields `0` rather than a negative count, so
 * elapsed-time checks cannot be shortened by moving the clock back.
 */
export const daysElapsed = (from: Date, to: Date): number => {
  const difference = to.getTime() - from.getTime();
  if (!Number.isFinite(difference) || difference <= 0) {
    return 0;
  }
  return Math.floor(difference / MILLISECONDS_PER_DAY);
};

/** Timestamp form used in filenames, e.g. `2026-07-29T12-00-00-000Z`. */
export const fileTimestamp = (instant: Date): string => (
  instant.toISOString().replace(/[:.]/g, '-')
);
