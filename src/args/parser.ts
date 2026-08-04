import { invalidArguments } from '../core/errors.js';
import type { OptionSpec, ParsedArgv, ParsedOptions } from './types.js';

const buildLookup = (specs: OptionSpec[]) => {
  const byName = new Map<string, OptionSpec>();
  const byAlias = new Map<string, OptionSpec>();
  specs.forEach((spec) => {
    byName.set(spec.name, spec);
    if (spec.alias) {
      byAlias.set(spec.alias, spec);
    }
  });
  return { byName, byAlias };
};

const assign = (options: ParsedOptions, spec: OptionSpec, value: string | boolean): void => {
  if (!spec.repeatable) {
     
    options[spec.name] = value;
    return;
  }
  const current = options[spec.name];
  const list = Array.isArray(current) ? current : [];
   
  options[spec.name] = [...list, String(value)];
};

const assertChoice = (spec: OptionSpec, value: string): void => {
  if (spec.choices && !spec.choices.includes(value)) {
    throw invalidArguments(
      `Invalid value for --${spec.name}: ${value}`,
      [`Supported values: ${spec.choices.join(', ')}`],
    );
  }
};

/**
 * Parses an argv slice against a set of option specs.
 *
 * The parser is deliberately dependency-free and supports the shapes the
 * Govplane CLI documents:
 *
 *   --flag                 boolean option
 *   --no-flag              explicit negation of a boolean option
 *   --name value           value option
 *   --name=value           value option, inline form
 *   -w value               aliased value option
 *   -h                     aliased boolean option
 *   --                     everything after is treated as a positional
 *
 * Options may appear before or after positionals, so both
 * `govplane --working-folder ./x validate` and `govplane validate -w ./x` work.
 */
export const parseArgv = (argv: string[], specs: OptionSpec[]): ParsedArgv => {
  const { byName, byAlias } = buildLookup(specs);
  const positionals: string[] = [];
  const options: ParsedOptions = {};
  let passthrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;

    if (passthrough) {
      positionals.push(token);
    } else if (token === '--') {
      passthrough = true;
    } else if (token.startsWith('--')) {
      const body = token.slice(2);
      const separator = body.indexOf('=');
      const name = separator === -1 ? body : body.slice(0, separator);
      const inlineValue = separator === -1 ? undefined : body.slice(separator + 1);

      const negated = name.startsWith('no-') && byName.has(name.slice(3));
      const spec = negated ? byName.get(name.slice(3)) : byName.get(name);

      if (!spec) {
        throw invalidArguments(`Unknown option: --${name}`, ['Run: govplane help']);
      }

      if (spec.type === 'boolean') {
        if (inlineValue !== undefined) {
          throw invalidArguments(`Option --${spec.name} does not accept a value.`);
        }
        assign(options, spec, !negated);
      } else {
        const value = inlineValue ?? argv[index + 1];
        const missing = value === undefined || (inlineValue === undefined && value.startsWith('-'));

        if (missing && spec.optionalValue === true) {
          assign(options, spec, true);
        } else if (missing) {
          throw invalidArguments(`Option --${spec.name} requires a value.`);
        } else {
          if (inlineValue === undefined) {
            index += 1;
          }
          assertChoice(spec, value);
          assign(options, spec, value);
        }
      }
    } else if (token.startsWith('-') && token.length > 1) {
      const alias = token.slice(1);
      const spec = byAlias.get(alias);
      if (!spec) {
        throw invalidArguments(`Unknown option: -${alias}`, ['Run: govplane help']);
      }
      if (spec.type === 'boolean') {
        assign(options, spec, true);
      } else {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('-')) {
          throw invalidArguments(`Option -${alias} requires a value.`);
        }
        index += 1;
        assertChoice(spec, value);
        assign(options, spec, value);
      }
    } else {
      positionals.push(token);
    }
  }

  return { positionals, options };
};

export const readString = (options: ParsedOptions, name: string): string | undefined => {
  const value = options[name];
  return typeof value === 'string' ? value : undefined;
};

export const readBoolean = (options: ParsedOptions, name: string): boolean => (
  options[name] === true
);

export const readList = (options: ParsedOptions, name: string): string[] => {
  const value = options[name];
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === 'string' ? [value] : [];
};

/**
 * Reads an option whose value is optional.
 *
 * Returns the value when one was given, `true` when the flag appeared without
 * one, and `undefined` when it did not appear at all — so a caller can tell
 * "asked for, unspecified" apart from "not asked for".
 */
export const readOptional = (
  options: ParsedOptions,
  name: string,
): string | true | undefined => {
  const value = options[name];
  if (value === true) {
    return true;
  }
  return typeof value === 'string' ? value : undefined;
};
