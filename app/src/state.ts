import type { ChainSnapshot, FeedEvent, Manifest } from "../../shared/feed";

/** A program event decoded from transaction logs (`VoteCast`, `ProposalFinalized`, ...). */
export interface ChainEvent {
  t: number;
  name: string;
  text: string;
  signature: string;
}

export interface LinkStatus {
  rpc: boolean;
  ws: boolean;
  feed: boolean;
}

/** Everything the page shows: what the chain says, plus the arena's narration. */
export interface ArenaState {
  manifest: Manifest | null;
  snapshot: ChainSnapshot | null;
  feed: FeedEvent[];
  chainEvents: ChainEvent[];
  status: LinkStatus;
  /** When the run on the desk was recorded, in replay-from-file mode; null when live. */
  recordedAt: number | null;
  /** Recorded on this machine while the desk polls for the arena; false once live, and on a hosted page. */
  watching: boolean;
}

type Listener = (state: ArenaState, change: Change) => void;
export type Change = "manifest" | "snapshot" | "feed" | "chain-event" | "status" | "run-start";

/** One plain state object and a list of listeners; every mutation names what changed. */
export class Store {
  readonly state: ArenaState = {
    manifest: null,
    snapshot: null,
    feed: [],
    chainEvents: [],
    status: { rpc: false, ws: false, feed: false },
    recordedAt: null,
    watching: false,
  };
  private readonly listeners: Listener[] = [];

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  private emit(change: Change): void {
    for (const l of this.listeners) l(this.state, change);
  }

  setManifest(manifest: Manifest): void {
    this.state.manifest = manifest;
    this.emit("manifest");
  }

  /** Clears the desk for a recorded run; its events and snapshots then arrive as the replay plays them. */
  loadRecording(manifest: Manifest, recordedAt: number): void {
    this.state.manifest = manifest;
    this.state.recordedAt = recordedAt;
    this.state.snapshot = null;
    this.state.feed = [];
    this.state.chainEvents = [];
    this.emit("manifest");
  }

  watchForArena(): void {
    this.state.watching = true;
    this.emit("status");
  }

  /** Clears the recording off the desk for a fresh live session; the arena's manifest and events then arrive over the feed. */
  startLive(): void {
    this.state.manifest = null;
    this.state.snapshot = null;
    this.state.feed = [];
    this.state.chainEvents = [];
    this.state.status = { rpc: false, ws: false, feed: false };
    this.state.recordedAt = null;
    this.state.watching = false;
    this.emit("manifest");
  }

  setSnapshot(snapshot: ChainSnapshot): void {
    this.state.snapshot = snapshot;
    this.emit("snapshot");
  }

  /** `live` is false for the history the feed replays on connect: a past start only clears the list. */
  addFeedEvent(event: FeedEvent, live: boolean): void {
    const fresh = event.kind === "start" && live;
    if (event.kind === "start") this.state.feed = [];
    if (fresh) {
      this.state.chainEvents = [];
      this.state.snapshot = null;
    }
    this.state.feed.push(event);
    this.emit(fresh ? "run-start" : "feed");
  }

  addChainEvent(event: ChainEvent): void {
    this.state.chainEvents.push(event);
    this.emit("chain-event");
  }

  setStatus(patch: Partial<LinkStatus>): void {
    this.state.status = { ...this.state.status, ...patch };
    this.emit("status");
  }
}
