import { AnchorError, ProgramError } from "@anchor-lang/core";
import { KRILL_ERRORS } from "../../shared/program";

/** The program error name behind a failed transaction (`MilestoneOutOfOrder`), or null if it was not one. */
export function krillErrorName(err: unknown): string | null {
  if (err instanceof AnchorError) return err.error.errorCode.code;
  if (err instanceof ProgramError) return KRILL_ERRORS.get(err.code) ?? null;
  const text = err instanceof Error ? err.message : String(err);
  const hex = /custom program error: (0x[0-9a-f]+)/i.exec(text)?.[1];
  return hex ? (KRILL_ERRORS.get(Number.parseInt(hex, 16)) ?? null) : null;
}

/** A one-line description of any failure, for the transcript. */
export function describeError(err: unknown): string {
  const name = krillErrorName(err);
  if (name) return name;
  const text = err instanceof Error ? err.message : String(err);
  return text.split("\n")[0] ?? text;
}
