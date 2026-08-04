export type OptionType = 'boolean' | 'string';

export interface OptionSpec {
  /** Long name without the leading dashes, e.g. `working-folder`. */
  name: string;
  type: OptionType;
  /** Single-character alias without the leading dash, e.g. `w`. */
  alias?: string;
  description: string;
  /** Placeholder shown in help output for value options, e.g. `<path>`. */
  placeholder?: string;
  /** Allowed values for string options. Anything else is an argument error. */
  choices?: string[];
  /** Value options that may be supplied more than once collect into an array. */
  repeatable?: boolean;
  /**
   * Value options whose value may be left out, as in `--trace` versus
   * `--trace full`. When omitted the option reads as `true`, so a caller can
   * tell "asked for, unspecified" apart from "not asked for".
   */
  optionalValue?: boolean;
}

export type ParsedOptions = Record<string, string | boolean | string[] | undefined>;

export interface ParsedArgv {
  positionals: string[];
  options: ParsedOptions;
}
