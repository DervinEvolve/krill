import type { ChainSnapshot, FeedEvent } from "../../shared/feed";
import { formatCount, formatSol, formatVotes } from "../../shared/math";
import type { CastMember } from "./cast";

/** The narrated terminal transcript: one line per action, a summary table at the end. */

const ESC = "\u001b[";
type Paint = (s: string) => string;

export class Transcript {
  private readonly dim: Paint;
  private readonly red: Paint;
  private readonly green: Paint;
  private readonly bold: Paint;

  constructor(
    private readonly write: (line: string) => void,
    color: boolean,
  ) {
    const paint = (code: string): Paint => (color ? (s) => `${ESC}${code}m${s}${ESC}0m` : (s) => s);
    this.dim = paint("2");
    this.red = paint("31");
    this.green = paint("32");
    this.bold = paint("1");
  }

  line(text = ""): void {
    this.write(text);
  }

  header(title: string, rows: readonly [string, string][]): void {
    this.line(this.bold(title));
    for (const [k, v] of rows) this.line(`  ${this.dim(k.padEnd(10))} ${v}`);
    this.line();
  }

  event(e: FeedEvent, startedAt: number): void {
    const clock = this.dim(`${((e.t - startedAt) / 1000).toFixed(1).padStart(6)}s`);
    const what = `${e.action}${e.detail ? this.dim(` · ${e.detail}`) : ""}`;
    if (e.kind !== "step") {
      this.line(`${clock}  ${this.dim(e.actor.padEnd(9))} ${this.dim(e.action)}`);
      return;
    }
    const result = e.ok
      ? this.green(e.signature ? `ok ${short(e.signature)}` : "ok")
      : this.red(e.expected ? `refused: ${e.detail ?? ""}` : "FAILED");
    this.line(`${clock}  ${e.actor.padEnd(9)} ${e.ok ? what : this.red(e.action)}  ${result}`);
    if (e.reasoning) this.line(`${" ".repeat(19)}${this.dim(`"${e.reasoning}"`)}`);
  }

  failure(label: string, message: string): void {
    this.line();
    this.line(this.red(`${label}: ${message}`));
  }

  summary(scenario: string, snap: ChainSnapshot, cast: readonly CastMember[], baseline: ReadonlyMap<string, bigint>, checks: string): void {
    const p = snap.proposal;
    const e = snap.escrow;
    this.line();
    this.line(this.bold(`Summary · ${scenario}`));
    const rows: [string, string][] = [
      ["outcome", p?.state ?? "no proposal"],
      ["for", p ? formatVotes(p.forVotes) : "-"],
      ["against", p ? formatVotes(p.againstVotes) : "-"],
      ["quorum", p ? `${formatCount(p.creditsSpent)} credits spent of ${formatCount(p.quorumCredits)} required` : "-"],
      ["escrow", e ? `${formatSol(e.releasedLamports, 3)} SOL released, ${formatSol(returned(snap), 3)} SOL returned` : "not funded"],
      ["treasury", snap.dao ? `${formatSol(snap.dao.pooledLamports, 3)} SOL pooled` : "-"],
      ["checks", checks],
    ];
    for (const [k, v] of rows) this.line(`  ${k.padEnd(9)} ${v}`);
    this.line();
    this.line(`  ${"actor".padEnd(9)} ${"role".padEnd(8)} ${"SOL delta".padStart(12)} ${"credits".padStart(8)} ${"votes".padStart(14)}  side`);
    for (const m of cast) {
      const key = m.keypair.publicKey.toBase58();
      const delta = (snap.balances[key] ?? 0n) - (baseline.get(key) ?? 0n);
      const member = snap.members[key];
      const receipt = snap.receipts[key];
      this.line(
        `  ${m.name.padEnd(9)} ${m.role.padEnd(8)} ${formatSol(delta, 6).padStart(12)} ${(member ? formatCount(member.credits) : "-").padStart(8)} ${(receipt ? formatVotes(receipt.votes) : "-").padStart(14)}  ${receipt ? (receipt.support ? "for" : "against") : "-"}`,
      );
    }
  }
}

const short = (sig: string): string => `${sig.slice(0, 4)}…${sig.slice(-4)}`;

/** Lamports a cancelled escrow sent back to the treasury. */
function returned(snap: ChainSnapshot): bigint {
  const e = snap.escrow;
  if (!e || e.state !== "Cancelled") return 0n;
  return e.milestones.reduce((sum, m) => sum + m.amount, 0n) - e.releasedLamports;
}
