#!/usr/bin/env node
// The `krill` command: runs the TypeScript sources through tsx, resolved from this package.
import { register } from "tsx/esm/api";

register();
await import("../src/index.ts");
