import type { IdlEvents } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Krill } from "../../idl/krill";
import type { Manifest } from "../../shared/feed";
import { formatCount, formatSol, formatVotes } from "../../shared/math";
import { escrowPda, memberPda, votePda } from "../../shared/pdas";
import { PROGRAM_ID, krillEvents } from "../../shared/program";
import { readSnapshot } from "../../shared/snapshot";
import type { SnapshotRefs } from "../../shared/snapshot";
import type { Store } from "./state";

type Events = IdlEvents<Krill>;
const big = (n: { toString(): string }): bigint => BigInt(n.toString());

/**
 * Watches the validator directly: `onAccountChange` on every account the
 * manifest names (each change re-reads the whole snapshot in one call), and
 * `onLogs` for the program's own events. A slot subscription doubles as the
 * websocket heartbeat.
 */
export class ChainLink {
  private connection: Connection | null = null;
  private cluster = "";
  private readonly subs = new Map<string, number>();
  private refs: SnapshotRefs = { dao: null, proposal: null, wallets: [] };
  private names = new Map<string, string>();
  private pending: ReturnType<typeof setTimeout> | null = null;
  private lastSlotAt = 0;

  constructor(private readonly store: Store) {
    store.subscribe((state, change) => {
      if ((change === "manifest" || change === "run-start") && state.manifest) this.sync(state.manifest);
    });
    setInterval(() => {
      const live = Date.now() - this.lastSlotAt < 3000;
      if (this.store.state.status.ws !== live) this.store.setStatus({ ws: live });
    }, 1000);
  }

  private sync(manifest: Manifest): void {
    if (manifest.cluster !== this.cluster) this.open(manifest);
    this.names = new Map(manifest.cast.map((c) => [c.pubkey, c.name]));
    this.refs = { dao: manifest.dao, proposal: manifest.proposal, wallets: manifest.cast.map((c) => c.pubkey) };
    const watch = new Set(this.watchList(manifest));
    for (const [address, id] of this.subs) {
      if (watch.has(address)) continue;
      void this.connection?.removeAccountChangeListener(id);
      this.subs.delete(address);
    }
    for (const address of watch) {
      if (this.subs.has(address) || !this.connection) continue;
      this.subs.set(address, this.connection.onAccountChange(new PublicKey(address), () => this.refresh(), { commitment: "confirmed" }));
    }
    this.refresh();
  }

  private open(manifest: Manifest): void {
    this.cluster = manifest.cluster;
    this.subs.clear();
    const connection = new Connection(manifest.cluster, { commitment: "confirmed", wsEndpoint: manifest.ws });
    this.connection = connection;
    connection.onLogs(PROGRAM_ID, (logs) => this.onLogs(logs.logs, logs.signature), "confirmed");
    connection.onSlotChange(() => {
      this.lastSlotAt = Date.now();
    });
  }

  private watchList(manifest: Manifest): string[] {
    const dao = manifest.dao ? new PublicKey(manifest.dao) : null;
    const proposal = manifest.proposal ? new PublicKey(manifest.proposal) : null;
    const wallets = manifest.cast.map((c) => new PublicKey(c.pubkey));
    return [
      ...(dao ? [dao] : []),
      ...(proposal ? [proposal, escrowPda(proposal)] : []),
      ...wallets,
      ...(dao ? wallets.map((w) => memberPda(dao, w)) : []),
      ...(proposal ? wallets.map((w) => votePda(proposal, w)) : []),
    ].map((k) => k.toBase58());
  }

  /** Coalesces bursts of account notifications into one snapshot read. */
  private refresh(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      const connection = this.connection;
      if (!connection) return;
      readSnapshot(connection, this.refs)
        .then((snap) => {
          this.store.setStatus({ rpc: true });
          this.store.setSnapshot(snap);
        })
        .catch(() => this.store.setStatus({ rpc: false }));
    }, 80);
  }

  private name(key: PublicKey): string {
    return this.names.get(key.toBase58()) ?? `${key.toBase58().slice(0, 4)}…`;
  }

  private onLogs(logs: string[], signature: string): void {
    for (const event of krillEvents.parseLogs(logs)) {
      const text = this.describe(event.name, event.data);
      if (text) this.store.addChainEvent({ t: Date.now(), name: event.name, text, signature });
    }
  }

  private describe(name: string, data: unknown): string | null {
    switch (name) {
      case "voteCast": {
        const e = data as Events["voteCast"];
        return `${this.name(e.voter)} · ${formatCount(big(e.credits))} credits → +${formatVotes(big(e.votes), 3)} votes ${e.support ? "for" : "against"}`;
      }
      case "proposalCreated": {
        const e = data as Events["proposalCreated"];
        return `proposal #${big(e.index)} for ${formatSol(big(e.amount), 0)} SOL`;
      }
      case "proposalFinalized": {
        const e = data as Events["proposalFinalized"];
        return `${e.passed ? "passed" : "rejected"} · ${formatVotes(big(e.forVotes), 3)} for, ${formatVotes(big(e.againstVotes), 3)} against`;
      }
      case "milestoneReleased": {
        const e = data as Events["milestoneReleased"];
        return `M${e.index + 1} released · ${formatSol(big(e.amount), 0)} SOL`;
      }
      default:
        return null;
    }
  }
}
