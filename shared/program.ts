import { BorshCoder, EventParser, convertIdlToCamelCase } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import rawIdl from "../idl/krill.json";
import type { Krill } from "../idl/krill";

/** The program's IDL as Anchor's client expects it (names in camelCase at runtime). */
export const KRILL_IDL = rawIdl as Krill;

export const PROGRAM_ID = new PublicKey(rawIdl.address);

/** Decodes accounts and events with camelCase names, the same shape `Program<Krill>` returns. */
export const krillCoder = new BorshCoder(convertIdlToCamelCase(KRILL_IDL));

export const krillEvents = new EventParser(PROGRAM_ID, krillCoder);

/** A program error as the IDL declares it: `6012`, `MilestoneOutOfOrder`, and the message a person can act on. */
export interface ProgramErrorInfo {
  code: number;
  name: string;
  message: string;
}

/** Custom error codes, from the IDL, so failures read as `MilestoneOutOfOrder` rather than 0x177c. */
export const KRILL_ERRORS: ReadonlyMap<number, ProgramErrorInfo> = new Map(
  rawIdl.errors.map((e) => [e.code, { code: e.code, name: e.name, message: e.msg }]),
);
