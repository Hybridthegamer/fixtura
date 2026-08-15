// ─── Double Elimination (§6.2) ──────────────────────────────
// "The format most implementations get subtly wrong" — the losers-bracket
// drop map below is written out explicitly and exercised by randomized
// simulation tests (see __tests__/engine.test.ts) that check, across many
// random outcomes at n=4,8,12,16: no entrant is eliminated before losing
// twice, and losers-bracket round 1 is never a rematch.
//
// LB rounds are built lazily via onResult (ADD_FIXTURES), not shelled
// entirely at plan() time: for a non-power-of-two field (e.g. n=12), WB
// round 1 has byes, so it produces fewer losers than a full bracket would —
// which means a later "drop" round can have more freshly-dropped WB losers
// than existing LB survivors to pair them against. Round *sizes* therefore
// can't be known from n and the round index alone; only the round *kind*
// sequence (seed → drop/pure alternation, driven by k) is fixed up front.
// Each round is built once its actual inputs are known: cross-pair
// survivors against WB losers 1:1 up to the shorter list, then pair
// whatever's left over (from the longer list) among itself — carrying a
// lone leftover straight to the next round as an unopposed "bye" fixture,
// mirroring how WB round 1 byes are represented.
import type {
  FormatAdapter,
  Entrant,
  Fixture,
  MatchResult,
  TournamentPlan,
  ValidationResult,
  StandingsSet,
  StandingRow,
  TiebreakerRule,
  EngineState,
  EngineMutation,
  GameweekPlan,
} from "../types";
import {
  nextPowerOfTwo,
  mulberry32,
  fisherYatesShuffle,
  buildEliminationBracket,
  mutationFor,
} from "../bracket";

export interface DoubleElimConfig {
  bracketReset?: boolean;
}

const WB_PREFIX = "fx_de_w_";
const LB_PREFIX = "fx_de_l_";
const GF_ID = "fx_de_gf";
const RESET_ID = "fx_de_br";

type LbRoundKind = "seed" | "pure" | "drop";
interface LbRoundInfo {
  round: number;
  kind: LbRoundKind;
  feedsFromWbRound?: number;
  feedsFromLbRound?: number;
}

/** The losers-bracket drop *sequence* — which round is fed by what — derived
 *  purely from k (winners-bracket rounds). Round widths are NOT fixed here;
 *  see the module doc above. */
function lbRoundMeta(k: number): LbRoundInfo[] {
  const meta: LbRoundInfo[] = [{ round: 1, kind: "seed" }];
  for (let m = 2; m <= k; m++) {
    const dropRound = 2 * m - 2;
    const feedsFromLbRound = m === 2 ? 1 : 2 * m - 3;
    meta.push({ round: dropRound, kind: "drop", feedsFromWbRound: m, feedsFromLbRound });
    if (m < k) {
      meta.push({ round: 2 * m - 1, kind: "pure", feedsFromLbRound: dropRound });
    }
  }
  return meta;
}

function isDecided(r?: MatchResult): boolean {
  return !!r && (r.status === "COMPLETED" || r.status === "FORFEIT_HOME" || r.status === "FORFEIT_AWAY");
}

function winnerOf(f: Fixture, r: MatchResult): string {
  if (r.winnerId) return r.winnerId;
  if (r.status === "FORFEIT_HOME") return f.awayEntrantId;
  if (r.status === "FORFEIT_AWAY") return f.homeEntrantId;
  return r.homeScore > r.awayScore ? f.homeEntrantId : f.awayEntrantId;
}

function loserOf(f: Fixture, r: MatchResult): string {
  const w = winnerOf(f, r);
  return w === f.homeEntrantId ? f.awayEntrantId : f.homeEntrantId;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function bySlot(a: Fixture, b: Fixture): number {
  return (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0);
}

/** A fixture with no away entrant is a bye: the home entrant auto-advances,
 *  no match is ever played, so it's "decided" the moment it's created. */
function isByeFixture(f: Fixture): boolean {
  return !!f.homeEntrantId && !f.awayEntrantId;
}

function roundOutcome(f: Fixture, results: Map<string, MatchResult>): string | undefined {
  if (isByeFixture(f)) return f.homeEntrantId;
  const r = results.get(f.id);
  return r ? winnerOf(f, r) : undefined;
}

function roundIsFullyDecided(fixtures: Fixture[], results: Map<string, MatchResult>): boolean {
  return fixtures.length > 0 && fixtures.every((f) => isByeFixture(f) || isDecided(results.get(f.id)));
}

function buildPlayedPairs(fixtures: Fixture[], results: Map<string, MatchResult>): Set<string> {
  const set = new Set<string>();
  for (const f of fixtures) {
    if (isByeFixture(f) || !f.homeEntrantId || !f.awayEntrantId) continue;
    if (!isDecided(results.get(f.id))) continue;
    set.add(pairKey(f.homeEntrantId, f.awayEntrantId));
  }
  return set;
}

function withinListMatch(list: string[], playedPairs: Set<string>): [string, string][] | null {
  if (list.length === 0) return [];
  const [first, ...rest] = list;
  for (let i = 0; i < rest.length; i++) {
    if (playedPairs.has(pairKey(first, rest[i]))) continue;
    const remaining = rest.filter((_, idx) => idx !== i);
    const sub = withinListMatch(remaining, playedPairs);
    if (sub !== null) return [[first, rest[i]], ...sub];
  }
  return null;
}

function pairWithinBestEffort(list: string[], playedPairs: Set<string>): [string, string][] {
  const rematchFree = withinListMatch(list, playedPairs);
  if (rematchFree) return rematchFree;
  const pool = [...list];
  const pairs: [string, string][] = [];
  while (pool.length > 1) {
    const a = pool.shift()!;
    let idx = pool.findIndex((b) => !playedPairs.has(pairKey(a, b)));
    if (idx === -1) idx = 0;
    pairs.push([a, pool.splice(idx, 1)[0]]);
  }
  return pairs;
}

/** Perfect bipartite matching (Kuhn's algorithm) between two equal-length
 *  lists that avoids every pair in `playedPairs`, or null if none exists. */
function bipartiteRematchFreeMatch(a: string[], b: string[], playedPairs: Set<string>): [string, string][] | null {
  const matchOfB: number[] = new Array(b.length).fill(-1);

  function tryAugment(i: number, visited: boolean[]): boolean {
    for (let j = 0; j < b.length; j++) {
      if (visited[j] || playedPairs.has(pairKey(a[i], b[j]))) continue;
      visited[j] = true;
      if (matchOfB[j] === -1 || tryAugment(matchOfB[j], visited)) {
        matchOfB[j] = i;
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (!tryAugment(i, new Array(b.length).fill(false))) return null;
  }

  const pairs: [string, string][] = [];
  for (let j = 0; j < b.length; j++) {
    if (matchOfB[j] !== -1) pairs.push([a[matchOfB[j]], b[j]]);
  }
  return pairs;
}

function pairAcrossBestEffort(a: string[], b: string[], playedPairs: Set<string>): [string, string][] {
  const rematchFree = bipartiteRematchFreeMatch(a, b, playedPairs);
  if (rematchFree) return rematchFree;
  const poolB = [...b];
  const pairs: [string, string][] = [];
  for (const x of a) {
    let idx = poolB.findIndex((y) => !playedPairs.has(pairKey(x, y)));
    if (idx === -1) idx = 0;
    pairs.push([x, poolB.splice(idx, 1)[0]]);
  }
  return pairs;
}

/**
 * Builds the fixtures for one dynamically-sized LB round. `groupA` and
 * `groupB` are the two incoming streams (survivors and freshly-dropped WB
 * losers for a "drop" round; a single stream with the other left empty for
 * "seed"/"pure" rounds). Cross-pairs up to the shorter list's length, pairs
 * any overflow from the longer list among itself, and carries a lone
 * leftover straight through as a bye fixture (no match, auto-advances).
 */
function buildLbRound(
  groupA: string[],
  groupB: string[],
  playedPairs: Set<string>,
  bracketRound: number,
  idStart: number,
): Fixture[] {
  const fixtures: Fixture[] = [];
  let counter = idStart;
  let slot = 0;

  function addMatch(home: string, away: string) {
    fixtures.push({
      id: `${LB_PREFIX}${counter++}`,
      homeEntrantId: home,
      awayEntrantId: away,
      bracketRound,
      bracketSlot: slot++,
      stageIndex: 1,
    });
  }
  function addBye(home: string) {
    fixtures.push({
      id: `${LB_PREFIX}${counter++}`,
      homeEntrantId: home,
      awayEntrantId: "",
      bracketRound,
      bracketSlot: slot++,
      stageIndex: 1,
    });
  }
  function pairOverflow(list: string[]) {
    const pool = [...list];
    if (pool.length % 2 !== 0) addBye(pool.pop()!);
    for (const [x, y] of pairWithinBestEffort(pool, playedPairs)) addMatch(x, y);
  }

  if (groupB.length === 0) {
    pairOverflow(groupA);
    return fixtures;
  }

  const minLen = Math.min(groupA.length, groupB.length);
  const [shorter, longer] = groupA.length <= groupB.length ? [groupA, groupB] : [groupB, groupA];
  const crossPortion = longer.slice(0, minLen);
  const overflowPortion = longer.slice(minLen);

  for (const [x, y] of pairAcrossBestEffort(shorter, crossPortion, playedPairs)) addMatch(x, y);
  if (overflowPortion.length > 0) pairOverflow(overflowPortion);

  return fixtures;
}

function tryBuildNextLbRound(
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  k: number,
): EngineMutation[] {
  const existingLbRounds = new Set(
    fixtures.filter((f) => f.id.startsWith(LB_PREFIX)).map((f) => f.bracketRound! - k),
  );
  const nextRound = existingLbRounds.size === 0 ? 1 : Math.max(...existingLbRounds) + 1;
  const meta = lbRoundMeta(k).find((m) => m.round === nextRound);
  if (!meta) return [];
  if (fixtures.some((f) => f.id.startsWith(LB_PREFIX) && f.bracketRound! - k === nextRound)) return [];

  let survivors: string[] = [];
  let wbLosers: string[] = [];

  if (meta.kind === "seed") {
    const wb1 = fixtures.filter((f) => f.id.startsWith(WB_PREFIX) && f.bracketRound === 1).sort(bySlot);
    if (wb1.length === 0 || !wb1.every((f) => isDecided(results.get(f.id)))) return [];
    wbLosers = wb1.map((f) => loserOf(f, results.get(f.id)!));
  } else {
    const prevRound = fixtures
      .filter((f) => f.id.startsWith(LB_PREFIX) && f.bracketRound! - k === meta.feedsFromLbRound)
      .sort(bySlot);
    if (!roundIsFullyDecided(prevRound, results)) return [];
    survivors = prevRound.map((f) => roundOutcome(f, results)!);

    if (meta.kind === "drop") {
      const wbRound = fixtures
        .filter((f) => f.id.startsWith(WB_PREFIX) && f.bracketRound === meta.feedsFromWbRound)
        .sort(bySlot);
      if (wbRound.length === 0 || !wbRound.every((f) => isDecided(results.get(f.id)))) return [];
      wbLosers = wbRound.map((f) => loserOf(f, results.get(f.id)!));
    }
  }

  const idStart = fixtures.filter((f) => f.id.startsWith(LB_PREFIX)).length;
  const playedPairs = buildPlayedPairs(fixtures, results);
  const newFixtures =
    meta.kind === "drop"
      ? buildLbRound(survivors, wbLosers, playedPairs, k + nextRound, idStart)
      : buildLbRound(meta.kind === "seed" ? wbLosers : survivors, [], playedPairs, k + nextRound, idStart);

  if (newFixtures.length === 0) return [];
  return [{ type: "ADD_FIXTURES", payload: { fixtures: newFixtures } }];
}

export const doubleElimination: FormatAdapter<DoubleElimConfig> = {
  key: "DOUBLE_ELIMINATION",

  validate(_config: DoubleElimConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    if (entrants.length < 4) {
      errors.push("Double elimination requires at least 4 entrants.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  plan(
    config: DoubleElimConfig,
    entrants: Entrant[],
    seed?: number,
  ): TournamentPlan {
    const cfg = { bracketReset: false, ...config };
    const n = entrants.length;
    const bracketSize = nextPowerOfTwo(n);
    const k = Math.max(1, Math.log2(bracketSize));
    const seeded = fisherYatesShuffle(entrants, mulberry32(seed ?? Date.now()));

    const { fixtures: wbFixtures } = buildEliminationBracket(seeded, WB_PREFIX, {});

    const gfFixture: Fixture = {
      id: GF_ID,
      homeEntrantId: "",
      awayEntrantId: "",
      bracketRound: k + (2 * k - 2) + 1,
      bracketSlot: 0,
    };

    const fixtures = [...wbFixtures, gfFixture];
    if (cfg.bracketReset) {
      fixtures.push({
        id: RESET_ID,
        homeEntrantId: "",
        awayEntrantId: "",
        bracketRound: gfFixture.bracketRound! + 1,
        bracketSlot: 0,
      });
    }

    const gameweeks: GameweekPlan[] = [];
    for (let round = 1; round <= k; round++) {
      const matchIds = fixtures.filter((f) => f.id.startsWith(WB_PREFIX) && f.bracketRound === round).map((f) => f.id);
      gameweeks.push({ number: round, label: `Winners Round ${round}`, matchIds });
    }
    gameweeks.push({ number: gfFixture.bracketRound!, label: "Grand Final", matchIds: [GF_ID] });
    if (cfg.bracketReset) {
      gameweeks.push({ number: gfFixture.bracketRound! + 1, label: "Grand Final Reset", matchIds: [RESET_ID] });
    }

    return {
      stages: [
        { kind: "BRACKET", position: 0, config: { bracket: "winners" } },
        { kind: "BRACKET", position: 1, config: { bracket: "losers" } },
      ],
      gameweeks,
      fixtures,
      totalMatches: 2 * n - 2 + (cfg.bracketReset ? 1 : 0),
    };
  },

  onResult(state: EngineState, result: MatchResult): EngineMutation[] {
    const fixture = state.fixtures.find((f) => f.id === result.matchId);
    if (!fixture) return [];
    if (!isDecided(result)) return [];

    const n = state.entrants.length;
    const bracketSize = nextPowerOfTwo(n);
    const k = Math.max(1, Math.log2(bracketSize));

    const winnerId = winnerOf(fixture, result);
    const resultsWithLatest = new Map(state.results);
    resultsWithLatest.set(result.matchId, result);

    const mutations: EngineMutation[] = [];

    if (fixture.id.startsWith(WB_PREFIX)) {
      const round = fixture.bracketRound!;
      if (round < k) {
        const toRound = round + 1;
        const toSlot = Math.floor(fixture.bracketSlot! / 2);
        const home = fixture.bracketSlot! % 2 === 0;
        const target = state.fixtures.find(
          (f) => f.id.startsWith(WB_PREFIX) && f.bracketRound === toRound && f.bracketSlot === toSlot,
        );
        if (target) mutations.push(mutationFor(target.id, home, winnerId));
      } else {
        mutations.push(mutationFor(GF_ID, true, winnerId));
      }

      const roundFixtures = state.fixtures.filter((f) => f.id.startsWith(WB_PREFIX) && f.bracketRound === round);
      if (roundFixtures.every((f) => isDecided(resultsWithLatest.get(f.id)))) {
        mutations.push(...tryBuildNextLbRound(state.fixtures, resultsWithLatest, k));
      }
    } else if (fixture.id.startsWith(LB_PREFIX)) {
      const lbRound = fixture.bracketRound! - k;
      const roundFixtures = state.fixtures.filter((f) => f.id.startsWith(LB_PREFIX) && f.bracketRound! - k === lbRound);

      if (lbRound === 2 * k - 2) {
        mutations.push(mutationFor(GF_ID, false, winnerId));
      } else if (roundIsFullyDecided(roundFixtures, resultsWithLatest)) {
        mutations.push(...tryBuildNextLbRound(state.fixtures, resultsWithLatest, k));
      }
    } else if (fixture.id === GF_ID) {
      const awayWon = winnerId === fixture.awayEntrantId;
      if (awayWon) {
        const reset = state.fixtures.find((f) => f.id === RESET_ID);
        if (reset) {
          mutations.push(mutationFor(RESET_ID, true, fixture.homeEntrantId));
          mutations.push(mutationFor(RESET_ID, false, fixture.awayEntrantId));
        }
      }
    }
    // RESET_ID is terminal — no further mutation.

    return mutations;
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    _rules: TiebreakerRule[],
    entrants: Entrant[],
  ): StandingsSet {
    const rows: StandingRow[] = [];
    const losses = new Map<string, number>();
    const wins = new Map<string, number>();

    for (const e of entrants) { losses.set(e.id, 0); wins.set(e.id, 0); }

    for (const f of fixtures) {
      if (isByeFixture(f)) continue;
      const r = results.get(f.id);
      if (!isDecided(r)) continue;
      const w = winnerOf(f, r!);
      const l = loserOf(f, r!);
      if (wins.has(w)) wins.set(w, (wins.get(w) ?? 0) + 1);
      if (losses.has(l)) losses.set(l, (losses.get(l) ?? 0) + 1);
    }

    for (const e of entrants) {
      rows.push({
        entityId: e.id, entityName: e.name, squadId: e.squadId,
        played: (wins.get(e.id) ?? 0) + (losses.get(e.id) ?? 0),
        won: wins.get(e.id) ?? 0, drawn: 0, lost: losses.get(e.id) ?? 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: wins.get(e.id) ?? 0,
        rank: 0, rankShared: false, tiebreakTrace: [],
      });
    }

    rows.sort((a, b) => a.lost - b.lost || b.won - a.won);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { squad: rows, individual: rows };
  },

  isComplete(state: EngineState): boolean {
    const gf = state.fixtures.find((f) => f.id === GF_ID);
    if (!gf) return false;
    const gfResult = state.results.get(gf.id);
    if (!isDecided(gfResult)) return false;

    const reset = state.fixtures.find((f) => f.id === RESET_ID);
    if (!reset) return true;

    const awayWon = winnerOf(gf, gfResult!) === gf.awayEntrantId;
    if (!awayWon) return true; // winners-bracket champion won outright — no reset needed

    return isDecided(state.results.get(reset.id));
  },
};
