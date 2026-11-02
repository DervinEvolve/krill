// Milestone escrow, as the Krill program runs it. Pure functions over plain
// objects: every call returns a new escrow or a refusal, never mutates.
// The guards and error names follow programs/krill (KrillError).

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const MAX_MILESTONES = 8;

export const PENDING = "Pending";
export const SUBMITTED = "Submitted";
export const RELEASED = "Released";

export const ACTIVE = "Active";
export const COMPLETED = "Completed";
export const CANCELLED = "Cancelled";

const refuse = (error, escrow) => ({ ok: false, error, escrow });
const accept = (escrow, moved = 0) => ({ ok: true, escrow, moved });
const freeze = (escrow) => Object.freeze({ ...escrow, milestones: Object.freeze(escrow.milestones.map((m) => Object.freeze({ ...m }))) });

/** `execute`: the passed proposal's total leaves the treasury in one step and lands in a new escrow. */
export function execute(treasury, amounts) {
  if (!Array.isArray(amounts) || amounts.length < 1 || amounts.length > MAX_MILESTONES || amounts.some((a) => !Number.isSafeInteger(a) || a <= 0)) {
    return { ok: false, error: "InvalidMilestones", treasury };
  }
  const total = amounts.reduce((sum, a) => sum + a, 0);
  if (!Number.isSafeInteger(total)) return { ok: false, error: "Overflow", treasury };
  if (total > treasury) return { ok: false, error: "InsufficientTreasury", treasury };
  const escrow = freeze({
    status: ACTIVE,
    total,
    released: 0,
    returned: 0,
    milestones: amounts.map((amount) => ({ amount, state: PENDING })),
  });
  return { ok: true, treasury: treasury - total, escrow };
}

/** Lamports still held by the escrow: everything not yet paid out or sent back. */
export const lockedOf = (escrow) => escrow.total - escrow.released - escrow.returned;

/** The milestone the contractor works on now: the first one not yet released, or -1. */
export const currentOf = (escrow) => (escrow.status === ACTIVE ? escrow.milestones.findIndex((m) => m.state !== RELEASED) : -1);

function guard(escrow, index) {
  if (escrow.status !== ACTIVE) return "InvalidState";
  if (!Number.isInteger(index) || index < 0 || index >= escrow.milestones.length) return "MilestoneIndexOutOfRange";
  return null;
}

/** Contractor: Pending → Submitted, only for i == 0 or when milestone i − 1 is Released. */
export function submit(escrow, index) {
  const error = guard(escrow, index);
  if (error) return refuse(error, escrow);
  if (index > 0 && escrow.milestones[index - 1].state !== RELEASED) return refuse("MilestoneOutOfOrder", escrow);
  if (escrow.milestones[index].state !== PENDING) return refuse("InvalidState", escrow);
  return accept(freeze({ ...escrow, milestones: escrow.milestones.map((m, i) => (i === index ? { ...m, state: SUBMITTED } : m)) }));
}

/** Council: Submitted → Released, paying exactly that milestone's amount to the contractor. */
export function approve(escrow, index) {
  const error = guard(escrow, index);
  if (error) return refuse(error, escrow);
  const milestone = escrow.milestones[index];
  if (milestone.state !== SUBMITTED) return refuse("InvalidState", escrow);
  const milestones = escrow.milestones.map((m, i) => (i === index ? { ...m, state: RELEASED } : m));
  const done = milestones.every((m) => m.state === RELEASED);
  return accept(freeze({ ...escrow, milestones, released: escrow.released + milestone.amount, status: done ? COMPLETED : ACTIVE }), milestone.amount);
}

/** Council: Submitted → Pending, for rework. No lamports move. */
export function reject(escrow, index) {
  const error = guard(escrow, index);
  if (error) return refuse(error, escrow);
  if (escrow.milestones[index].state !== SUBMITTED) return refuse("InvalidState", escrow);
  return accept(freeze({ ...escrow, milestones: escrow.milestones.map((m, i) => (i === index ? { ...m, state: PENDING } : m)) }));
}

/** Council, any time while Active: every unreleased lamport goes back to the treasury. */
export function cancel(escrow) {
  if (escrow.status !== ACTIVE) return refuse("InvalidState", escrow);
  const back = lockedOf(escrow);
  return accept(freeze({ ...escrow, status: CANCELLED, returned: escrow.returned + back }), back);
}

/** The only two places escrowed lamports can go. */
export const DESTINATIONS = Object.freeze({ approve: "contractor", cancel: "treasury" });
