import { fromJson } from "../../shared/feed";
import type { FeedEvent, Manifest, ScenarioInfo } from "../../shared/feed";

/** A run the arena recorded (`npm run record`): the manifest and the feed's full history, snapshots included. */
export interface RecordedRun {
  manifest: Manifest;
  events: FeedEvent[];
}

/** One line of `runs/index.json`. */
export interface RunEntry extends ScenarioInfo {
  recordedAt: number;
}

/** The recorded runs shipped beside the page in `runs/`, fetched relative to the page's base path. */
export class RunShelf {
  private readonly base = `${import.meta.env.BASE_URL}runs/`;

  async list(): Promise<RunEntry[]> {
    const res = await fetch(`${this.base}index.json`);
    return res.ok ? fromJson<RunEntry[]>(await res.text()) : [];
  }

  async load(name: string): Promise<RecordedRun> {
    const res = await fetch(`${this.base}${name}.json`);
    if (!res.ok) throw new Error(`no recorded run named ${name}`);
    return fromJson<RecordedRun>(await res.text());
  }
}
