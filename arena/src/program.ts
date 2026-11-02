import { spawn } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROGRAM_BUILD_DIR, PROGRAM_MANIFEST, PROGRAM_SO } from "./constants";

/**
 * `anchor build` (platform-tools v1.57) emits an SBPF v3 ELF, which
 * solana-test-validator 3.1.x refuses ("invalid file header"); LiteSVM runs it
 * fine. For the validator the same sources are built once more for SBPF v0
 * into `arena/.program`, and rebuilt whenever `target/deploy/krill.so` is newer.
 */

const LOADABLE_SO = join(PROGRAM_BUILD_DIR, "krill.so");
const FIRST_UNSUPPORTED_SBPF = 3;

/** The SBPF version from the ELF header's e_flags (offset 0x30). */
function sbpfVersion(path: string): number {
  const header = Buffer.alloc(0x34);
  const fd = openSync(path, "r");
  try {
    readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  return header.readUInt32LE(0x30);
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function buildV0(cargoBuildSbf: string, log: (line: string) => void): Promise<void> {
  log("building an SBPF v0 copy of the program for the local validator (first run only, a few minutes)...");
  const args = ["--manifest-path", PROGRAM_MANIFEST, "--sbf-out-dir", PROGRAM_BUILD_DIR, "--arch", "v0", "--", "--locked"];
  const env = { ...process.env, CARGO_TARGET_DIR: join(PROGRAM_BUILD_DIR, "target") };
  const child = spawn(cargoBuildSbf, args, { stdio: ["ignore", "ignore", "inherit"], env });
  return new Promise((resolve, reject) =>
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cargo-build-sbf exited with code ${code ?? "?"}`)))),
  );
}

/** Path of a krill.so the validator can load, building it first if needed. */
export async function loadableProgram(findTool: (name: string) => string | null, log: (line: string) => void): Promise<string> {
  if (!mtime(PROGRAM_SO)) throw new Error(`${PROGRAM_SO} is missing: run \`anchor build\` first`);
  if (sbpfVersion(PROGRAM_SO) < FIRST_UNSUPPORTED_SBPF) return PROGRAM_SO;
  if (mtime(LOADABLE_SO) >= mtime(PROGRAM_SO)) return LOADABLE_SO;
  const tool = findTool("cargo-build-sbf");
  if (!tool) throw new Error("cargo-build-sbf is not on PATH; it is needed once to build an SBPF v0 copy of the program");
  await buildV0(tool, log);
  return LOADABLE_SO;
}
