import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { accessSync, constants, mkdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { Connection } from "@solana/web3.js";
import { PROGRAM_ID } from "../../shared/program";
import { LEDGER_DIR } from "./constants";
import { loadableProgram } from "./program";

const BINARY = "solana-test-validator";

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A fresh local validator with the Krill program preloaded at its declared id,
 * bound to 127.0.0.1, with its own ledger under `arena/.ledger`.
 */
export class LocalValidator {
  private child: ChildProcess | null = null;

  async start(connection: Connection, log: (line: string) => void): Promise<void> {
    const bin = findOnPath(BINARY);
    if (!bin) {
      throw new Error(
        `${BINARY} is not on PATH. Install the Agave CLI and add it, e.g.\n  export PATH="$HOME/.local/share/solana/install/bin:$PATH"`,
      );
    }
    const program = await loadableProgram(findOnPath, log);
    mkdirSync(LEDGER_DIR, { recursive: true });
    const args = ["--reset", "--quiet", "--bind-address", "127.0.0.1", "--ledger", LEDGER_DIR, "--bpf-program", PROGRAM_ID.toBase58(), program];
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    this.child = child;
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<never>((_, reject) =>
      child.once("exit", (code) => reject(new Error(`${BINARY} exited with code ${code ?? "?"}: ${stderr.trim()}`))),
    );
    await Promise.race([this.waitHealthy(connection), exited]);
  }

  private async waitHealthy(connection: Connection): Promise<void> {
    for (let i = 0; i < 120; i++) {
      try {
        const info = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
        if (info?.executable) return;
      } catch {
        // not listening yet
      }
      await sleep(500);
    }
    throw new Error(`${BINARY} did not become healthy within 60 s`);
  }

  stop(): void {
    this.child?.kill("SIGTERM");
    this.child = null;
  }
}

/** For `--no-validator`: fail early with a clear message if nothing is listening or the program is absent. */
export async function assertProgramDeployed(connection: Connection): Promise<void> {
  const info = await connection.getAccountInfo(PROGRAM_ID, "confirmed").catch(() => {
    throw new Error(`no validator answering at ${connection.rpcEndpoint}`);
  });
  if (!info?.executable) throw new Error(`program ${PROGRAM_ID.toBase58()} is not deployed on ${connection.rpcEndpoint}`);
}
