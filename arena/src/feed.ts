import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { FEED_PORT } from "../../shared/constants";
import { toJson } from "../../shared/feed";
import type { FeedEvent, Manifest, ScenarioInfo } from "../../shared/feed";

/** Starts a scenario by name; resolves when the run has finished. */
export type RunHandler = (name: string) => Promise<void>;

/**
 * The arena's feed on 127.0.0.1:8787 (`node:http`, CORS open for the Vite dev
 * server). It only adds what the chain cannot say: who acted, why, and the
 * signature; the desk reads the accounts themselves from the validator.
 */
export class FeedServer {
  private readonly server: Server;
  private readonly clients = new Set<ServerResponse>();
  private history: FeedEvent[] = [];
  private runHandler: RunHandler | null = null;

  constructor(
    private manifest: Manifest,
    private readonly scenarios: readonly ScenarioInfo[],
  ) {
    this.server = createServer((req, res) => this.route(req, res));
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", (err: NodeJS.ErrnoException) =>
        reject(err.code === "EADDRINUSE" ? new Error(`port ${FEED_PORT} is busy: is another arena running?`) : err),
      );
      this.server.listen(FEED_PORT, "127.0.0.1", () => resolve());
    });
  }

  close(): void {
    for (const c of this.clients) c.end();
    this.server.close();
  }

  /** Enables `POST /run/<name>`; without a handler the endpoint answers 409. */
  onRun(handler: RunHandler): void {
    this.runHandler = handler;
  }

  get running(): boolean {
    return this.manifest.running;
  }

  /** A new run: forget the previous history so a replay shows only this one. */
  beginRun(manifest: Manifest): void {
    this.history = [];
    this.updateManifest(manifest);
  }

  updateManifest(patch: Partial<Manifest>): void {
    this.manifest = { ...this.manifest, ...patch };
    this.broadcast("manifest", toJson(this.manifest));
  }

  push(event: FeedEvent): void {
    this.history.push(event);
    this.broadcast("message", toJson(event));
  }

  private broadcast(event: string, data: string): void {
    const frame = `${event === "message" ? "" : `event: ${event}\n`}data: ${data}\n\n`;
    for (const c of this.clients) c.write(frame);
  }

  private route(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (req.method === "GET" && path === "/manifest") return this.json(res, 200, toJson(this.manifest));
    if (req.method === "GET" && path === "/scenarios") return this.json(res, 200, toJson(this.scenarios));
    if (req.method === "GET" && path === "/events") return this.stream(req, res);
    const run = /^\/run\/([\w-]+)$/.exec(path)?.[1];
    if (req.method === "POST" && run) return this.startRun(res, run);
    this.json(res, 404, toJson({ error: "not found" }));
  }

  private json(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { "Content-Type": "application/json" }).end(body);
  }

  private stream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`event: manifest\ndata: ${toJson(this.manifest)}\n\n`);
    for (const e of this.history) res.write(`data: ${toJson(e)}\n\n`);
    this.clients.add(res);
    req.on("close", () => this.clients.delete(res));
  }

  private startRun(res: ServerResponse, name: string): void {
    if (!this.scenarios.some((s) => s.name === name)) return this.json(res, 404, toJson({ error: `no scenario ${name}` }));
    if (!this.runHandler || this.manifest.running) return this.json(res, 409, toJson({ error: "a scenario is already running" }));
    this.json(res, 202, toJson({ started: name }));
    void this.runHandler(name);
  }
}
