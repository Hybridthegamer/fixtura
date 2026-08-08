// ─── Double Elimination (§6.2) ──────────────────────────────
// Winners + losers brackets with correct counts.
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
  GameweekPlan,
} from "../types";

export interface DoubleElimConfig {
  bracketReset?: boolean;
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
    const k = Math.log2(bracketSize); // number of WB rounds
    const rng = mulberry32(seed ?? Date.now());
    const seeded = [...entrants].sort(() => rng() - 0.5);

    const fixtures: Fixture[] = [];
    const gameweeks: GameweekPlan[] = [];
    let fixtureId = 0;

    // ─── Winners bracket ──────────────────────────────────
    for (let round = 1; round <= k; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      const matchIds: string[] = [];

      for (let slot = 0; slot < matchesInRound; slot++) {
        const matchId = `fx_de_w_${fixtureId++}`;
        matchIds.push(matchId);

        let homeId = "";
        let awayId = "";

        if (round === 1) {
          const homeIdx = slot;
          const awayIdx = bracketSize - 1 - slot;
          if (homeIdx < n && seeded[homeIdx]) homeId = seeded[homeIdx].id;
          if (awayIdx < n && seeded[awayIdx]) awayId = seeded[awayIdx].id;
        }

        fixtures.push({
          id: matchId, homeEntrantId: homeId, awayEntrantId: awayId,
          bracketRound: round, bracketSlot: slot, stageIndex: 0,
        });
      }

      gameweeks.push({ number: round, label: `Winners Round ${round}`, matchIds });
    }

    // ─── Losers bracket ───────────────────────────────────
    // LB has 2k-2 rounds, match counts: [2^(k-2), 2^(k-2), 2^(k-3), 2^(k-3), ..., 1, 1]
    const lbRounds = 2 * k - 2;
    for (let r = 1; r <= lbRounds; r++) {
      const pairIndex = Math.floor((r - 1) / 2);
      const matchesInRound = Math.max(1, Math.pow(2, k - 2 - pairIndex));
      const matchIds: string[] = [];

      for (let slot = 0; slot < matchesInRound; slot++) {
        const matchId = `fx_de_l_${fixtureId++}`;
        matchIds.push(matchId);
        fixtures.push({
          id: matchId, homeEntrantId: "", awayEntrantId: "",
          bracketRound: r, bracketSlot: slot, stageIndex: 1,
        });
      }

      gameweeks.push({ number: k + r, label: `Losers Round ${r}`, matchIds });
    }

    // ─── Grand Final ──────────────────────────────────────
    const gfId = `fx_de_gf_${fixtureId++}`;
    fixtures.push({
      id: gfId, homeEntrantId: "", awayEntrantId: "",
      bracketRound: k + lbRounds + 1, bracketSlot: 0,
    });
    gameweeks.push({ number: k + lbRounds + 1, label: "Grand Final", matchIds: [gfId] });

    if (cfg.bracketReset) {
      const brId = `fx_de_br_${fixtureId++}`;
      fixtures.push({
        id: brId, homeEntrantId: "", awayEntrantId: "",
        bracketRound: k + lbRounds + 2, bracketSlot: 0,
      });
      gameweeks.push({ number: k + lbRounds + 2, label: "Grand Final Reset", matchIds: [brId] });
    }

    return {
      stages: [
        { kind: "BRACKET", position: 0, config: { bracket: "winners" } },
        { kind: "BRACKET", position: 1, config: { bracket: "losers" } },
      ],
      gameweeks,
      fixtures,
      totalMatches: fixtures.length,
    };
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
      const r = results.get(f.id);
      if (!r) continue;
      for (const eid of [f.homeEntrantId, f.awayEntrantId]) {
        if (!eid) continue;
        if (r.winnerId === eid) wins.set(eid, (wins.get(eid) ?? 0) + 1);
        else if (r.winnerId) losses.set(eid, (losses.get(eid) ?? 0) + 1);
      }
    }

    for (const e of entrants) {
      rows.push({
        entityId: e.id, entityName: e.name,
        played: (wins.get(e.id) ?? 0) + (losses.get(e.id) ?? 0),
        won: wins.get(e.id) ?? 0, drawn: 0, lost: losses.get(e.id) ?? 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: wins.get(e.id) ?? 0,
        rank: 0, rankShared: false, tiebreakTrace: [],
      });
    }

    rows.sort((a, b) => b.won - a.won || a.lost - b.lost);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { squad: rows, individual: [] };
  },

  isComplete(state: EngineState): boolean {
    const gf = state.fixtures.find((f) => f.id.includes("_gf_"));
    if (!gf) return false;
    return state.results.get(gf.id)?.status === "COMPLETED";
  },
};

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}