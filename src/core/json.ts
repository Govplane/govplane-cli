export interface JsonPosition {
  offset: number;
  line: number;
  column: number;
}

export interface JsonParseSuccess {
  ok: true;
  value: unknown;
}

export interface JsonParseFailure {
  ok: false;
  message: string;
  position?: JsonPosition;
}

export type JsonParseResult = JsonParseSuccess | JsonParseFailure;

const offsetToPosition = (source: string, offset: number): JsonPosition => {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  const consumed = source.slice(0, safeOffset);
  const lines = consumed.split('\n');
  return {
    offset: safeOffset,
    line: lines.length,
    column: (lines[lines.length - 1] ?? '').length + 1,
  };
};

/**
 * Parses JSON without throwing, resolving the failing offset into a
 * line/column pair so validation errors can point at the exact spot.
 */
export const parseJson = (source: string): JsonParseResult => {
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /at position (\d+)/.exec(message);
    if (!match) {
      return { ok: false, message };
    }
    return {
      ok: false,
      message,
      position: offsetToPosition(source, Number.parseInt(match[1] as string, 10)),
    };
  }
};

/** Serialises a document the way the CLI persists files: 2-space indent, trailing newline. */
export const stringifyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
