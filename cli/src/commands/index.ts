import type { Command } from "./command";
import { daoInit, daoShow } from "./dao";
import { deposit, join } from "./membership";
import { approveMilestone, rejectMilestone, submitMilestone } from "./milestones";
import { cancel, execute, finalize, propose, vote } from "./proposals";
import { status, whoami } from "./status";

export type { Command } from "./command";

export const COMMANDS: readonly Command[] = [
  daoInit,
  daoShow,
  join,
  deposit,
  propose,
  vote,
  finalize,
  execute,
  submitMilestone,
  approveMilestone,
  rejectMilestone,
  cancel,
  status,
  whoami,
];

/** The command whose path starts `words`, e.g. `milestone submit` for `["milestone", "submit", "0", "1"]`. */
export function findCommand(words: readonly string[]): Command | null {
  return COMMANDS.find((c) => c.path.every((word, i) => words[i] === word)) ?? null;
}

const signature = (c: Command): string => ["krill", ...c.path, ...c.args, ...(c.usage ? [c.usage] : [])].join(" ");

export function usage(): string {
  const left = (c: Command): string => [...c.path, ...c.args].join(" ");
  const width = Math.max(...COMMANDS.map((c) => left(c).length));
  return [
    "usage: krill <command> [arguments] [options]",
    "",
    ...COMMANDS.flatMap((c) => [`  ${left(c).padEnd(width)}  ${c.summary}`, ...(c.usage ? [`  ${" ".repeat(width)}  ${c.usage}`] : [])]),
    "",
    "options for every command:",
    "  --url <rpc|localnet|devnet>  cluster (default localnet, http://127.0.0.1:8899)",
    "  --keypair <path>             signer and fee payer (default ~/.config/solana/id.json)",
    "  --dao <address>              the DAO to act on (or set KRILL_DAO)",
    "  --json                       print one JSON object instead of text",
    "",
    "Proposals and milestones are numbered from 0, as on chain. Amounts are in SOL; 1 credit = 0.001 SOL.",
  ].join("\n");
}

/** `krill milestone submit 0 1` → usage for that command alone, used after a usage error. */
export const commandUsage = (c: Command): string => `usage: ${signature(c)}`;
