import { FEED_URL } from "../../shared/constants";
import { fromJson } from "../../shared/feed";
import type { FeedEvent, Manifest, ScenarioInfo } from "../../shared/feed";
import type { Store } from "./state";

/** Result of asking the arena to start a scenario. */
export type RunRequest = "started" | "busy" | "offline";

/** Whether the arena's feed answers on this machine (it gives up after `ms`). */
export async function feedReachable(ms: number): Promise<boolean> {
  try {
    return (await fetch(`${FEED_URL}/manifest`, { signal: AbortSignal.timeout(ms) })).ok;
  } catch {
    return false;
  }
}

/** The arena's feed: `/manifest` and the `/events` SSE stream, plus `POST /run/<name>`. */
export class FeedLink {
  private source: EventSource | null = null;

  constructor(private readonly store: Store) {}

  connect(): void {
    this.source?.close();
    const source = new EventSource(`${FEED_URL}/events`);
    this.source = source;
    let openedAt = Date.now();
    source.onopen = () => {
      openedAt = Date.now();
      this.store.setStatus({ feed: true });
    };
    source.onerror = () => this.store.setStatus({ feed: false });
    source.addEventListener("manifest", (e: MessageEvent<string>) => this.store.setManifest(fromJson<Manifest>(e.data)));
    source.onmessage = (e: MessageEvent<string>) => {
      const event = fromJson<FeedEvent>(e.data);
      this.store.addFeedEvent(event, event.t >= openedAt);
    };
  }

  async scenarios(): Promise<ScenarioInfo[]> {
    try {
      const res = await fetch(`${FEED_URL}/scenarios`);
      return res.ok ? fromJson<ScenarioInfo[]>(await res.text()) : [];
    } catch {
      return [];
    }
  }

  async run(name: string): Promise<RunRequest> {
    try {
      const res = await fetch(`${FEED_URL}/run/${name}`, { method: "POST" });
      return res.status === 202 ? "started" : res.status === 409 ? "busy" : "offline";
    } catch {
      return "offline";
    }
  }
}
