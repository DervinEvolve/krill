import { isPlain, mark } from "./logo";

/** What a command produced: printed as a few aligned lines, or as one JSON object with `--json`. */
export interface Report {
  /** The transaction it sent, if any. */
  signature?: string;
  /** The one-line result. */
  line: string;
  /** Detail rows under the result, for the read commands. */
  rows?: readonly (readonly [string, string])[];
  /** The machine-readable result; bigints are written as decimal strings. */
  data: Record<string, unknown>;
}

/** Bigints (lamports, credits, fixed-point votes) as exact decimal strings. */
export const toJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2);

export class Printer {
  private readonly plain: boolean;

  constructor(
    private readonly json: boolean,
    env: NodeJS.ProcessEnv,
    private readonly out: NodeJS.WriteStream,
  ) {
    this.plain = isPlain(env, Boolean(out.isTTY));
  }

  private dim(text: string): string {
    return this.plain ? text : `\u001b[2m${text}\u001b[0m`;
  }

  report(report: Report): void {
    if (this.json) {
      const { signature, line, data } = report;
      this.out.write(`${toJson({ ...(signature ? { signature } : {}), result: line, ...data })}\n`);
      return;
    }
    const lines: string[] = [];
    if (report.signature) lines.push(`${this.dim("signature")}  ${report.signature}`);
    lines.push(`${mark(this.plain)} ${report.line}`);
    const width = Math.max(0, ...(report.rows ?? []).map(([k]) => k.length));
    for (const [k, v] of report.rows ?? []) lines.push(`   ${this.dim(k.padEnd(width))}  ${v}`);
    this.out.write(`${lines.join("\n")}\n`);
  }
}
