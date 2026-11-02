import { llmBrain } from "./llm";
import { scriptedBrain } from "./scripted";
import type { Brain } from "./types";

export type BrainKind = "scripted" | "llm";

/** `KRILL_BRAIN=llm` (with an API key) lets a model vote; anything else is the deterministic script. */
export const brainKind = (): BrainKind => (process.env.KRILL_BRAIN === "llm" ? "llm" : "scripted");

export const brainFor = (name: string): Brain => (brainKind() === "llm" ? llmBrain(name) : scriptedBrain(name));
