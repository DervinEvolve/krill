import { formatCount } from "../../../shared/math";
import { daoPda } from "../../../shared/pdas";
import { UsageError } from "../args";
import { duration, sol } from "../chain";
import { parseInteger, parsePubkey } from "../units";
import type { Command } from "./command";

const MAX_NAME_BYTES = 32;
const MAX_QUORUM_BPS = 10_000n;

const percent = (bps: number | bigint): string => `${Number(bps) / 100}%`;

export const daoInit: Command = {
  path: ["dao", "init"],
  args: [],
  usage: "--name <s> --council <pubkey> --voting-period <secs> --quorum-bps <n>",
  accepts: ["name", "council", "voting-period", "quorum-bps"],
  summary: "create a DAO; you are its authority",
  async run(ctx) {
    const name = ctx.options.required("name");
    const bytes = new TextEncoder().encode(name).length;
    if (bytes === 0 || bytes > MAX_NAME_BYTES) throw new UsageError(`--name must be 1 to ${MAX_NAME_BYTES} bytes, got ${bytes}`);
    const council = parsePubkey(ctx.options.required("council"), "--council");
    const votingPeriod = parseInteger(ctx.options.required("voting-period"), "--voting-period");
    const quorumBps = parseInteger(ctx.options.required("quorum-bps"), "--quorum-bps");
    if (quorumBps > MAX_QUORUM_BPS) throw new UsageError(`--quorum-bps must be 0 to ${MAX_QUORUM_BPS}, got ${quorumBps}`);
    const authority = ctx.wallet();
    const signature = await ctx.client.initializeDao(authority, name, council, votingPeriod, Number(quorumBps));
    const dao = daoPda(authority.publicKey, name).toBase58();
    return {
      signature,
      line: `created DAO "${name}" · ${duration(votingPeriod)} voting · ${percent(quorumBps)} quorum · export KRILL_DAO=${dao}`,
      data: { dao, name, council: council.toBase58(), votingPeriod, quorumBps: Number(quorumBps) },
    };
  },
};

export const daoShow: Command = {
  path: ["dao", "show"],
  args: [],
  summary: "the DAO's settings and counters",
  async run(ctx) {
    const dao = await ctx.client.fetchDao(ctx.dao());
    return {
      line: `DAO "${dao.name}" at ${dao.address}`,
      rows: [
        ["authority", dao.authority],
        ["council", dao.council],
        ["voting", `${duration(dao.votingPeriod)} per proposal`],
        ["quorum", `${percent(dao.quorumBps)} of all credits must be spent`],
        ["treasury", `${sol(dao.pooledLamports)} pooled`],
        ["credits", `${formatCount(dao.totalCredits)} minted`],
        ["members", formatCount(dao.memberCount)],
        ["proposals", `${formatCount(dao.proposalCount)}${dao.proposalCount > 0n ? ` (#0 to #${dao.proposalCount - 1n})` : ""}`],
      ],
      data: { dao },
    };
  },
};
