/** A hand-written command-line parser: `--name value`, `--name=value`, boolean flags and positionals. */

/** Bad input from the person at the keyboard: printed with the usage hint, exit code 2. */
export class UsageError extends Error {
  override name = "UsageError";
}

/** Options every command accepts. */
const GLOBAL_OPTIONS = ["url", "keypair", "dao", "json", "help"] as const;

const VALUE_OPTIONS = new Set(["url", "keypair", "dao", "name", "council", "voting-period", "quorum-bps", "title", "contractor", "milestones"]);
const FLAG_OPTIONS = new Set(["json", "help", "for", "against"]);

export interface ParsedArgs {
  positionals: string[];
  values: ReadonlyMap<string, string>;
  flags: ReadonlySet<string>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h") {
      flags.add("help");
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq < 0 ? undefined : eq);
    const inline = eq < 0 ? undefined : arg.slice(eq + 1);
    if (FLAG_OPTIONS.has(name)) {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value`);
      flags.add(name);
    } else if (VALUE_OPTIONS.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) throw new UsageError(`--${name} needs a value`);
      values.set(name, value);
    } else {
      throw new UsageError(`unknown option ${arg}`);
    }
  }
  return { positionals, values, flags };
}

/** The options a command was given, checked against the ones it declares. */
export class Options {
  constructor(
    private readonly parsed: ParsedArgs,
    accepted: readonly string[],
  ) {
    const allowed = new Set<string>([...GLOBAL_OPTIONS, ...accepted]);
    for (const name of [...parsed.values.keys(), ...parsed.flags]) {
      if (!allowed.has(name)) throw new UsageError(`--${name} does not apply to this command`);
    }
  }

  value(name: string): string | undefined {
    return this.parsed.values.get(name);
  }

  required(name: string): string {
    const value = this.value(name);
    if (value === undefined) throw new UsageError(`--${name} is required`);
    return value;
  }

  flag(name: string): boolean {
    return this.parsed.flags.has(name);
  }
}
