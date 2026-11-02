import { parseArgs } from "node:util";
import { Connection } from "@solana/web3.js";
import { FEED_URL, RPC_URL, WS_URL } from "../../shared/constants";
import { PROGRAM_ID } from "../../shared/program";
import { brainKind } from "./brains";
import { DEFAULT_SPEED_MS } from "./constants";
import { FeedServer } from "./feed";
import { emptyManifest, runScenario } from "./runner";
import { DEFAULT_SCENARIO, SCENARIOS, findScenario, scenarioInfo } from "./scenarios";
import { Transcript } from "./transcript";
import { LocalValidator, assertProgramDeployed } from "./validator";

const USAGE = `usage: npm run arena -- [--scenario <name>] [--speed <ms>] [--no-validator] [--serve]
scenarios: ${SCENARIOS.map((s) => s.name).join(", ")}`;

function options() {
  const { values } = parseArgs({
    options: {
      scenario: { type: "string", default: DEFAULT_SCENARIO },
      speed: { type: "string", default: String(DEFAULT_SPEED_MS) },
      "no-validator": { type: "boolean", default: false },
      serve: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  const speedMs = Number(values.speed);
  if (values.help || !Number.isFinite(speedMs) || speedMs < 0) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 2);
  }
  const scenario = findScenario(values.scenario);
  if (!scenario) {
    console.error(`unknown scenario "${values.scenario}"\n${USAGE}`);
    process.exit(2);
  }
  return { scenario, speedMs, serve: values.serve, attach: values["no-validator"] };
}

const validator = new LocalValidator();
const feed = new FeedServer(emptyManifest(), scenarioInfo());

function shutdown(code: number): never {
  feed.close();
  validator.stop();
  process.exit(code);
}

async function main(): Promise<void> {
  const opts = options();
  const connection = new Connection(RPC_URL, { commitment: "confirmed", wsEndpoint: WS_URL });
  const transcript = new Transcript((line) => console.log(line), process.stdout.isTTY);
  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  if (opts.attach) await assertProgramDeployed(connection);
  else await validator.start(connection, (line) => console.log(line));
  await feed.listen();

  transcript.header("Krill Arena", [
    ["program", PROGRAM_ID.toBase58()],
    ["cluster", `${RPC_URL}${opts.attach ? " (attached)" : " (fresh local validator)"}`],
    ["feed", FEED_URL],
    ["brain", brainKind()],
    ["speed", `${opts.speedMs} ms between steps`],
  ]);

  const run = async (name: string): Promise<boolean> => {
    const scenario = findScenario(name);
    if (!scenario) return false;
    transcript.line(`--- ${scenario.name}: ${scenario.description}`);
    const ok = await runScenario(scenario, { connection, feed, transcript, speedMs: opts.speedMs });
    transcript.line();
    return ok;
  };

  if (opts.serve) {
    feed.onRun(async (name) => {
      await run(name).catch((err: unknown) => {
        transcript.failure("run failed", err instanceof Error ? err.message : String(err));
        feed.updateManifest({ running: false });
      });
    });
    transcript.line(`serving; start a run from the desk or with: curl -X POST ${FEED_URL}/run/${DEFAULT_SCENARIO}`);
    await new Promise<never>(() => undefined);
  }
  const ok = await run(opts.scenario.name);
  shutdown(ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
