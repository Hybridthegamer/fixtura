// ─── Shared bracket helpers (§6.1, §6.2, §6.4) ──────────────
// Pure, side-effect-free. No database imports.
import type { Entrant, Fixture, EngineMutation } from "./types";

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fisherYatesShuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Standard bracket seed order: recursively interleaved so that seed 1 and
 * seed 2 can only meet in the final, seeds 1-4 only from the semifinal on,
 * etc. seedOrder(16) = [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11] — the
 * classic "1v16, 8v9, ..." pairing the brief calls out in §6.1.
 * Returns 1-indexed seed numbers, length = bracketSize.
 */
export function standardSeedOrder(bracketSize: number): number[] {
  let order = [1];
  while (order.length < bracketSize) {
    const size = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, size + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * Advances an entrant into the next round's fixture, derived from a
 * fixture at (fromRound, fromSlot). Standard bracket topology: round r
 * slot s is fed by round r-1 slots 2s (home) and 2s+1 (away).
 */
export function advanceInto(
  fixtures: Fixture[],
  toRound: number,
  toSlot: number,
  home: boolean,
  entrantId: string,
  entrantSquadId: string | undefined,
): void {
  const target = fixtures.find(
    (f) => f.bracketRound === toRound && f.bracketSlot === toSlot,
  );
  if (!target) return;
  if (home) {
    target.homeEntrantId = entrantId;
    if (entrantSquadId) target.homeSquadId = entrantSquadId;
  } else {
    target.awayEntrantId = entrantId;
    if (entrantSquadId) target.awaySquadId = entrantSquadId;
  }
}

export function slotEntrant(
  seeded: (Entrant | undefined)[],
  seedNumber: number,
): Entrant | undefined {
  return seeded[seedNumber - 1];
}

export function mutationFor(
  fixtureId: string,
  home: boolean,
  entrantId: string,
): EngineMutation {
  return {
    type: "UPDATE_RESULT",
    payload: { fixtureId, field: home ? "homeEntrantId" : "awayEntrantId", entrantId },
  };
}

export const THIRD_PLACE_SUFFIX = "_tp";

/**
 * Builds a full single-elimination bracket (all rounds shelled, round 1
 * populated, byes resolved immediately) from an array of entrants already
 * in seed order (index 0 = top seed). Shared by SINGLE_ELIMINATION and the
 * knockout stage of GROUPS_KNOCKOUT so both get the same tested topology.
 */
export function buildEliminationBracket(
  seeded: Entrant[],
  idPrefix: string,
  opts: { thirdPlacePlayoff?: boolean; startRound?: number } = {},
): { fixtures: Fixture[]; numRounds: number; tppId: string | null } {
  const n = seeded.length;
  const startRound = opts.startRound ?? 1;
  const bracketSize = nextPowerOfTwo(n);
  const numRounds = Math.max(1, Math.log2(bracketSize));
  const order = standardSeedOrder(bracketSize);

  const fixtures: Fixture[] = [];
  let counter = 0;

  const roundIds: Record<number, string[]> = {};
  for (let round = 2; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    roundIds[round] = [];
    for (let slot = 0; slot < matchesInRound; slot++) {
      const matchId = `${idPrefix}${counter++}`;
      roundIds[round].push(matchId);
      fixtures.push({
        id: matchId,
        homeEntrantId: "",
        awayEntrantId: "",
        bracketRound: startRound + round - 1,
        bracketSlot: slot,
      });
    }
  }

  let tppId: string | null = null;
  if (opts.thirdPlacePlayoff && n >= 4) {
    tppId = `${idPrefix}${counter++}${THIRD_PLACE_SUFFIX}`;
    fixtures.push({
      id: tppId,
      homeEntrantId: "",
      awayEntrantId: "",
      bracketRound: startRound + numRounds,
      bracketSlot: 0,
    });
  }

  const matchesInRound1 = bracketSize / 2;
  for (let slot = 0; slot < matchesInRound1; slot++) {
    const seedA = order[slot * 2];
    const seedB = order[slot * 2 + 1];
    const entrantA = seedA <= n ? seeded[seedA - 1] : undefined;
    const entrantB = seedB <= n ? seeded[seedB - 1] : undefined;

    if (entrantA && entrantB) {
      const matchId = `${idPrefix}${counter++}`;
      fixtures.push({
        id: matchId,
        homeEntrantId: entrantA.id,
        awayEntrantId: entrantB.id,
        homeSquadId: entrantA.squadId,
        awaySquadId: entrantB.squadId,
        bracketRound: startRound,
        bracketSlot: slot,
      });
    } else {
      const bye = entrantA ?? entrantB;
      if (bye && numRounds >= 2) {
        advanceInto(
          fixtures,
          startRound + 1,
          Math.floor(slot / 2),
          slot % 2 === 0,
          bye.id,
          bye.squadId,
        );
      }
    }
  }

  return { fixtures, numRounds, tppId };
}

/**
 * Bracket-progression logic shared by any elimination-style adapter: given
 * a completed match, returns mutations advancing the winner into the next
 * round (and the loser into the third-place playoff, if present).
 */
export function eliminationOnResult(
  fixtures: Fixture[],
  result: { matchId: string; winnerId?: string; status: string; homeScore: number; awayScore: number },
): EngineMutation[] {
  const mutations: EngineMutation[] = [];
  const fixture = fixtures.find((f) => f.id === result.matchId);
  if (!fixture || fixture.bracketRound == null || fixture.bracketSlot == null) return mutations;
  if (
    result.status !== "COMPLETED" &&
    result.status !== "FORFEIT_HOME" &&
    result.status !== "FORFEIT_AWAY"
  ) {
    return mutations;
  }

  let winnerId = result.winnerId;
  if (!winnerId) {
    if (result.status === "FORFEIT_HOME") winnerId = fixture.awayEntrantId;
    else if (result.status === "FORFEIT_AWAY") winnerId = fixture.homeEntrantId;
    else winnerId = result.homeScore > result.awayScore ? fixture.homeEntrantId : fixture.awayEntrantId;
  }
  if (!winnerId) return mutations;
  const loserId = winnerId === fixture.homeEntrantId ? fixture.awayEntrantId : fixture.homeEntrantId;

  if (fixture.id.endsWith(THIRD_PLACE_SUFFIX)) return mutations; // terminal

  const bracketFixtures = fixtures.filter(
    (f) => f.bracketRound != null && !f.id.endsWith(THIRD_PLACE_SUFFIX),
  );
  const finalRound = Math.max(...bracketFixtures.map((f) => f.bracketRound!));

  if (fixture.bracketRound < finalRound) {
    const toRound = fixture.bracketRound + 1;
    const toSlot = Math.floor(fixture.bracketSlot / 2);
    const home = fixture.bracketSlot % 2 === 0;
    const target = fixtures.find((f) => f.bracketRound === toRound && f.bracketSlot === toSlot);
    if (target) mutations.push(mutationFor(target.id, home, winnerId));
  }

  const tpp = fixtures.find((f) => f.id.endsWith(THIRD_PLACE_SUFFIX));
  if (tpp && fixture.bracketRound === finalRound - 1 && loserId) {
    const home = fixture.bracketSlot === 0;
    mutations.push(mutationFor(tpp.id, home, loserId));
  }

  return mutations;
}

export function applyMutations(fixtures: Fixture[], mutations: EngineMutation[]): Fixture[] {
  const next = fixtures.map((f) => ({ ...f }));
  for (const m of mutations) {
    if (m.type === "UPDATE_RESULT") {
      const { fixtureId, field, entrantId } = m.payload as {
        fixtureId: string;
        field: "homeEntrantId" | "awayEntrantId";
        entrantId: string;
      };
      const target = next.find((f) => f.id === fixtureId);
      if (target) target[field] = entrantId;
    } else if (m.type === "ADD_FIXTURES") {
      const { fixtures: added } = m.payload as { fixtures: Fixture[] };
      next.push(...added);
    }
  }
  return next;
}
