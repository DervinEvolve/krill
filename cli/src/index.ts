import { programError } from "../../shared/errors";
import { Options, UsageError, parseArgs } from "./args";
import { COMMANDS, commandUsage, findCommand, usage } from "./commands";
import type { Command } from "./commands";
import { Context } from "./context";
import { banner } from "./logo";
import { Printer, toJson } from "./output";

/** `krill <command> [args] [options]`: parse, run one command, print its report, exit non-zero on any failure. */

const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

/** A failure as one line and a JSON object: program errors by name and declared message. */
function explain(err: unknown, url: string): { text: string; json: Record<string, unknown> } {
  const known = programError(err);
  if (known) return { text: `${known.name} (${known.code}): ${known.message}`, json: { ...known } };
  const message = err instanceof Error ? err.message : String(err);
  const unreachable = /fetch failed|ECONNREFUSED/.test(message) || (err instanceof Error && /ECONNREFUSED/.test(String(err.cause)));
  const text = unreachable ? `no RPC node answering at ${url}` : (message.split("\n")[0] ?? message);
  return { text, json: { message: text } };
}

function arity(command: Command, given: readonly string[]): void {
  const required = command.args.filter((a) => !a.startsWith("[")).length;
  if (given.length < required) throw new UsageError(`missing ${command.args.slice(given.length, required).join(" ")}`);
  if (given.length > command.args.length) throw new UsageError(`unexpected argument "${given[command.args.length] ?? ""}"`);
}

async function main(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const fail = (code: number, text: string, detail: Record<string, unknown> = { message: text }): number => {
    process.stderr.write(json ? `${toJson({ error: detail })}\n` : `error: ${text}\n`);
    return code;
  };

  let command: Command | null = null;
  let url = "";
  try {
    const parsed = parseArgs(argv);
    command = findCommand(parsed.positionals);
    if (!command) {
      if (parsed.positionals.length === 0) {
        process.stdout.write(`${banner()}\n\n${usage()}\n`);
        return 0;
      }
      const [word] = parsed.positionals;
      const group = COMMANDS.filter((c) => c.path.length > 1 && c.path[0] === word);
      if (group.length > 0) throw new UsageError(`"${word}" needs one of: ${group.map((c) => c.path[1]).join(", ")}`);
      throw new UsageError(`unknown command "${parsed.positionals.join(" ")}"; commands: ${[...new Set(COMMANDS.map((c) => c.path[0]))].join(", ")}`);
    }
    if (parsed.flags.has("help")) {
      process.stdout.write(`${commandUsage(command)}\n  ${command.summary}\n`);
      return 0;
    }
    const args = parsed.positionals.slice(command.path.length);
    arity(command, args);
    const ctx = new Context(new Options(parsed, command.accepts ?? []), args, process.env);
    url = ctx.url;
    new Printer(json, process.env, process.stdout).report(await command.run(ctx));
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      const hint = command ? commandUsage(command) : "run krill --help for the commands";
      return fail(EXIT_USAGE, `${err.message}\n${hint}`, { message: err.message, usage: hint });
    }
    const { text, json: detail } = explain(err, url);
    return fail(EXIT_FAILED, text, detail);
  }
}

process.exitCode = await main(process.argv.slice(2));
