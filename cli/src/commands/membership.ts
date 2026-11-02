import { LAMPORTS_PER_CREDIT } from "../../../shared/constants";
import { formatCount } from "../../../shared/math";
import { UsageError } from "../args";
import { sol } from "../chain";
import { parseSol } from "../units";
import type { Command } from "./command";

function amount(text: string | undefined): bigint {
  if (text === undefined) throw new UsageError("say how much SOL, e.g. 1 or 0.25");
  return parseSol(text);
}

export const join: Command = {
  path: ["join"],
  args: ["<sol>"],
  summary: "become a member: 1 credit per 0.001 SOL deposited",
  async run(ctx) {
    const lamports = amount(ctx.arg(0));
    const wallet = ctx.wallet();
    const dao = ctx.dao();
    const signature = await ctx.client.join(wallet, dao, lamports);
    const [daoView, member] = await Promise.all([ctx.client.fetchDao(dao), ctx.client.fetchMember(dao, wallet.publicKey)]);
    return {
      signature,
      line: `joined "${daoView.name}" with ${sol(lamports)} → ${formatCount(member.credits)} credits · member ${formatCount(daoView.memberCount)}`,
      data: { dao: dao.toBase58(), deposited: lamports, member },
    };
  },
};

export const deposit: Command = {
  path: ["deposit"],
  args: ["<sol>"],
  summary: "add SOL as an existing member, for more credits",
  async run(ctx) {
    const lamports = amount(ctx.arg(0));
    const wallet = ctx.wallet();
    const dao = ctx.dao();
    const signature = await ctx.client.deposit(wallet, dao, lamports);
    const member = await ctx.client.fetchMember(dao, wallet.publicKey);
    return {
      signature,
      line: `deposited ${sol(lamports)} → +${formatCount(lamports / LAMPORTS_PER_CREDIT)} credits · ${formatCount(member.credits)} unspent`,
      data: { dao: dao.toBase58(), deposited: lamports, member },
    };
  },
};
