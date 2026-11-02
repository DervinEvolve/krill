import type { FeedEvent } from "../../shared/feed";
import { formatCount, formatSol, formatVotes } from "../../shared/math";
import type { ArenaState } from "./state";

/** The ruled notepad beside the desk: run header, the feed (newest first) and a ledger of every agent. */

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const short = (s: string): string => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** The program's page on the Solana explorer: it is deployed and verified on devnet. */
function explorerLink(programId: string): string {
  const href = `https://explorer.solana.com/address/${encodeURIComponent(programId)}?cluster=devnet`;
  return `<a class="np-link" href="${href}" target="_blank" rel="noopener" title="verified build on devnet">${short(programId)}</a> <span class="np-muted">devnet ↗</span>`;
}

function dot(label: string, live: boolean): string {
  return `<span class="dot${live ? " live" : ""}" title="${label} ${live ? "connected" : "offline"}"></span>${label}`;
}

const day = (t: number): string => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function header(state: ArenaState): string {
  const m = state.manifest;
  const last = state.chainEvents[state.chainEvents.length - 1];
  return `<header class="np-head">
    <div class="np-row"><span class="k">scenario</span><span>${esc(m?.scenario ? m.scenario.replace(/-/g, " ") : "no run yet")}${m?.running ? " · running" : ""}</span></div>
    <div class="np-row"><span class="k">cluster</span><span>${esc(m?.cluster ?? "localnet")}</span></div>
    <div class="np-row"><span class="k">program</span><span>${m ? explorerLink(m.programId) : "–"}</span></div>
    ${state.recordedAt === null
      ? `<div class="np-row dots">${dot("rpc", state.status.rpc)}${dot("ws", state.status.ws)}${dot("feed", state.status.feed)}</div>`
      : `<div class="np-row recorded">recorded run · ${day(state.recordedAt)}${state.watching ? " · waiting for the arena" : ""}</div>`}
    ${last ? `<div class="np-row event"><span class="k">on chain</span><span>${esc(last.text)}</span></div>` : ""}
  </header>`;
}

function entry(e: FeedEvent): string {
  const cls = e.kind === "step" ? (e.ok ? "" : " refused") : " aside";
  const detail = e.detail ? ` <span class="detail">${esc(e.detail)}</span>` : "";
  const why = e.reasoning ? `<div class="why">${esc(e.reasoning)}</div>` : "";
  const sig = e.signature ? ` <button class="sig" data-sig="${e.signature}" title="copy signature">${short(e.signature)}</button>` : "";
  return `<li class="np-line${cls}"><span class="who">${esc(e.actor)}</span> · <span class="what">${esc(e.action)}</span>${detail}${sig}${why}</li>`;
}

function ledger(state: ArenaState): string {
  const snap = state.snapshot;
  const rows = (state.manifest?.cast ?? []).map((c) => {
    const member = snap?.members[c.pubkey];
    const receipt = snap?.receipts[c.pubkey];
    const lamports = snap?.balances[c.pubkey];
    return `<tr><td>${esc(c.name)}</td><td>${c.role}</td><td class="n">${lamports === undefined ? "–" : formatSol(lamports, 2)}</td>`
      + `<td class="n">${member ? formatCount(member.credits) : "–"}</td><td class="n">${receipt ? formatVotes(receipt.votes, 2) : "–"}</td>`
      + `<td>${receipt ? (receipt.support ? "for" : "against") : "–"}</td></tr>`;
  });
  return `<table class="ledger"><thead><tr><th>agent</th><th>role</th><th class="n">SOL</th><th class="n">credits</th><th class="n">votes</th><th>side</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="6" class="aside">waiting for the arena</td></tr>'}</tbody></table>`;
}

export class Notepad {
  private queued = false;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("button.sig") : null;
      const sig = btn?.dataset.sig;
      if (!btn || !sig) return;
      void navigator.clipboard?.writeText(sig).then(() => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 900);
      });
    });
  }

  /** Re-renders at most once per frame. */
  update(state: ArenaState): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      const lines = [...state.feed].reverse().map(entry).join("");
      const scrolled = this.el.firstElementChild?.scrollTop ?? 0;
      this.el.innerHTML = `<div class="np-scroll">${header(state)}<h2>feed</h2><ol class="feed">${lines || '<li class="np-line aside">press Run to start a scenario</li>'}</ol><h2>ledger</h2>${ledger(state)}</div>`;
      if (this.el.firstElementChild) this.el.firstElementChild.scrollTop = scrolled;
    });
  }
}
