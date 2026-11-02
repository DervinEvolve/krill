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

/** Custom error codes, from the IDL, so failures read as `MilestoneOutOfOrder` rather than 0x177c. */
export const KRILL_ERRORS: ReadonlyMap<number, string> = new Map(rawIdl.errors.map((e) => [e.code, e.name]));
