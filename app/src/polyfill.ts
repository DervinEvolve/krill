import { Buffer } from "buffer";

/** @solana/web3.js and Anchor expect Node's Buffer as a global; give the browser one before they load. */
declare global {
  var Buffer: typeof import("buffer").Buffer;
}
globalThis.Buffer ??= Buffer;
