import { AnchorError, ProgramError } from "@anchor-lang/core";
import { KRILL_ERRORS } from "./program";
import type { ProgramErrorInfo } from "./program";

/**
 * The program error behind a failed transaction: Anchor's own errors (a broken
 * account constraint) and Krill's (`MilestoneOutOfOrder`), with the message the
 * program declares. Null when the failure was not a program error.
 */
export function programError(err: unknown): ProgramErrorInfo | null {
  if (err instanceof AnchorError) {
    const { number, code } = err.error.errorCode;
    return { code: number, name: code, message: err.error.errorMessage };
  }
  if (err instanceof ProgramError) return KRILL_ERRORS.get(err.code) ?? null;
  const text = err instanceof Error ? err.message : String(err);
  const hex = /custom program error: (0x[0-9a-f]+)/i.exec(text)?.[1];
  return hex ? (KRILL_ERRORS.get(Number.parseInt(hex, 16)) ?? null) : null;
}

/** The program error name behind a failed transaction (`MilestoneOutOfOrder`), or null if it was not one. */
export const krillErrorName = (err: unknown): string | null => programError(err)?.name ?? null;

/** A one-line description of any failure, for the transcript. */
export function describeError(err: unknown): string {
  const name = krillErrorName(err);
  if (name) return name;
  const text = err instanceof Error ? err.message : String(err);
  return text.split("\n")[0] ?? text;
}
