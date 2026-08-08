// ─── Engine Barrel Export ───────────────────────────────────
export type * from "./types";
export { crossSquadIndividualRR } from "./formats/crossSquadRR";
export { singleElimination } from "./formats/singleElim";
export { doubleElimination } from "./formats/doubleElim";
export { roundRobin } from "./formats/roundRobin";
export { groupsKnockout } from "./formats/groupsKnockout";
export { swiss } from "./formats/swiss";

import type { FormatAdapter, FormatKey } from "./types";
import { crossSquadIndividualRR } from "./formats/crossSquadRR";
import { singleElimination } from "./formats/singleElim";
import { doubleElimination } from "./formats/doubleElim";
import { roundRobin } from "./formats/roundRobin";
import { groupsKnockout } from "./formats/groupsKnockout";
import { swiss } from "./formats/swiss";

const adapters: Record<string, FormatAdapter> = {
  CROSS_SQUAD_INDIVIDUAL_RR: crossSquadIndividualRR,
  SINGLE_ELIMINATION: singleElimination,
  DOUBLE_ELIMINATION: doubleElimination,
  ROUND_ROBIN: roundRobin,
  GROUPS_KNOCKOUT: groupsKnockout,
  SWISS: swiss,
};

export function getFormatAdapter(key: FormatKey | string): FormatAdapter | undefined {
  return adapters[key];
}

export function getAllFormatKeys(): FormatKey[] {
  return Object.keys(adapters) as FormatKey[];
}