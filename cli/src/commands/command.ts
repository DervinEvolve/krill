import type { Context } from "../context";
import type { Report } from "../output";

/** One `krill` command. */
export interface Command {
  /** The words that select it, e.g. `["milestone", "submit"]`. */
  path: readonly string[];
  /** Positional arguments for the usage line; optional ones in brackets, e.g. `["[index]"]`. */
  args: readonly string[];
  /** Command-specific options for the usage line, e.g. `"--title <s>"`. */
  usage?: string;
  /** The option names it accepts besides the global ones. */
  accepts?: readonly string[];
  summary: string;
  run(ctx: Context): Promise<Report>;
}
