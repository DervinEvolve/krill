import { ChainLink } from "./chain";
import { FeedLink, feedReachable } from "./feed";
import { RunShelf } from "./recorded";
import type { Store } from "./state";

/** Where the desk's runs come from: the arena's live feed, or the recorded runs shipped beside the page. */
export type SourceMode = "live" | "recorded";

const DEFAULT_RUN = "whale-vs-krill";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const PROBE_MS = 1500;
const POLL_EVERY_MS = 3000;
const POLL_TIMEOUT_MS = 1000;

/**
 * The desk's one source of truth for its mode. Live when the page is served
 * from this machine and the arena's feed answers; otherwise (or with
 * `?run=<name>` / `?replay=1`) a recorded run from `runs/`. On this machine a
 * recorded desk keeps polling the feed and turns live, once and for good, as
 * soon as it answers. A hosted page never probes 127.0.0.1.
 */
export class Source {
  readonly feed: FeedLink;
  readonly shelf = new RunShelf();
  private readonly listeners: (() => void)[] = [];

  private constructor(
    private readonly store: Store,
    private current: SourceMode,
    /** The recording a recorded desk plays first. */
    readonly first: string,
    /** Whether a recorded desk watches for the arena to come up. */
    private readonly watches: boolean,
  ) {
    this.feed = new FeedLink(store);
  }

  static async choose(store: Store): Promise<Source> {
    const q = new URLSearchParams(location.search);
    const named = q.get("run");
    const first = named ?? DEFAULT_RUN;
    if (named || q.get("replay") === "1" || !LOOPBACK.has(location.hostname)) return new Source(store, "recorded", first, false);
    const up = await feedReachable(PROBE_MS);
    return new Source(store, up ? "live" : "recorded", first, !up);
  }

  get mode(): SourceMode {
    return this.current;
  }

  /** Called after the switch to live, once the store holds a fresh live session. */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** Connects to the arena, or starts watching for it; call once the desk and notepad listen to the store. */
  start(): void {
    if (this.current === "live") this.connect();
    else if (this.watches) {
      this.store.watchForArena();
      this.poll();
    }
  }

  private poll(): void {
    setTimeout(() => void feedReachable(POLL_TIMEOUT_MS).then((up) => (up ? this.goLive() : this.poll())), POLL_EVERY_MS);
  }

  private goLive(): void {
    this.current = "live";
    this.store.startLive();
    this.connect();
    for (const l of this.listeners) l();
  }

  private connect(): void {
    new ChainLink(this.store);
    this.feed.connect();
  }
}
