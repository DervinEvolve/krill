import { PublicKey } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "../../shared/constants";
import { UsageError } from "./args";

/** Converts what a person types into the integers the program takes. No floats: SOL is parsed as a decimal string. */

/** "1", "0.5", "2.000000001" → lamports. */
export function parseSol(text: string, what = "amount"): bigint {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(text);
  if (!match) throw new UsageError(`${what} "${text}" is not a SOL amount like 1 or 0.25 (at most 9 decimals)`);
  const [, whole = "0", frac = ""] = match;
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
}

/** "10,10,10" → lamports per milestone. */
export const parseSolList = (text: string, what: string): bigint[] => text.split(",").map((part) => parseSol(part.trim(), what));

/** A whole number ≥ `min`, for indexes, credits and seconds. */
export function parseInteger(text: string | undefined, what: string, min = 0n): bigint {
  if (text === undefined) throw new UsageError(`${what} is required`);
  if (!/^\d+$/.test(text) || BigInt(text) < min) throw new UsageError(`${what} must be a whole number${min > 0n ? ` of at least ${min}` : ""}, got "${text}"`);
  return BigInt(text);
}

/** A milestone position inside an escrow; the program takes it as a u8. */
export function parseMilestone(text: string | undefined): number {
  const index = parseInteger(text, "milestone");
  if (index > 255n) throw new UsageError(`milestone ${index} is out of range`);
  return Number(index);
}

export function parsePubkey(text: string, what: string): PublicKey {
  try {
    return new PublicKey(text);
  } catch {
    throw new UsageError(`${what} "${text}" is not a valid public key`);
  }
}
