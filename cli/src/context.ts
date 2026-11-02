import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import { KrillClient } from "../../shared/client";
import { RPC_URL } from "../../shared/constants";
import { UsageError } from "./args";
import type { Options } from "./args";
import { parsePubkey } from "./units";

/** Everything a command needs: the cluster, the signing wallet and the DAO it acts on. */

const CLUSTERS: Readonly<Record<string, string>> = {
  localnet: RPC_URL,
  devnet: "https://api.devnet.solana.com",
};

const DEFAULT_KEYPAIR = join(homedir(), ".config", "solana", "id.json");

function clusterUrl(option: string | undefined): string {
  const url = CLUSTERS[option ?? "localnet"] ?? option ?? RPC_URL;
  if (!/^https?:\/\//.test(url)) throw new UsageError(`--url must be localnet, devnet or an http(s) RPC URL, got "${url}"`);
  return url;
}

/** A Solana CLI keypair file: a JSON array of the 64 secret key bytes. */
function loadKeypair(path: string): Keypair {
  const file = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new UsageError(`cannot read keypair ${file}; pass --keypair <path> or create one with solana-keygen new`);
  }
  const bytes: unknown = JSON.parse(text);
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b < 256)) {
    throw new UsageError(`${file} is not a Solana keypair file (a JSON array of 64 bytes)`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export class Context {
  readonly url: string;
  readonly connection: Connection;
  readonly client: KrillClient;
  private signer: Keypair | null = null;

  constructor(
    readonly options: Options,
    readonly positionals: readonly string[],
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.url = clusterUrl(options.value("url"));
    this.connection = new Connection(this.url, "confirmed");
    this.client = new KrillClient(this.connection);
  }

  /** The keypair that signs and pays, loaded on first use. */
  wallet(): Keypair {
    this.signer ??= loadKeypair(this.options.value("keypair") ?? DEFAULT_KEYPAIR);
    return this.signer;
  }

  /** The DAO from `--dao` or `KRILL_DAO`, or null when neither is set. */
  daoIfSet(): PublicKey | null {
    const text = this.options.value("dao") ?? this.env.KRILL_DAO;
    return text ? parsePubkey(text, "DAO address") : null;
  }

  dao(): PublicKey {
    const dao = this.daoIfSet();
    if (!dao) throw new UsageError("no DAO: pass --dao <address> or set KRILL_DAO");
    return dao;
  }

  /** The n-th positional after the command name. */
  arg(n: number): string | undefined {
    return this.positionals[n];
  }
}
