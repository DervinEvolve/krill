import type { ScenarioInfo } from "../../../shared/feed";
import { cancel } from "./cancel";
import { rework } from "./rework";
import { sybilWhale } from "./sybil-whale";
import type { Scenario } from "./types";
import { whaleVsKrill } from "./whale-vs-krill";

export const SCENARIOS: readonly Scenario[] = [whaleVsKrill, rework, cancel, sybilWhale];

export const DEFAULT_SCENARIO = whaleVsKrill.name;

export const findScenario = (name: string): Scenario | undefined => SCENARIOS.find((s) => s.name === name);

export const scenarioInfo = (): ScenarioInfo[] => SCENARIOS.map(({ name, description }) => ({ name, description }));
