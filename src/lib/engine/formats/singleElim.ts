// ─── Single Elimination (§6.1) ──────────────────────────────
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

export interface SingleElimConfig {
  thirdPlacePlayoff?: boolean;
  bestOf?: number;
  seedingSource?: "manual" | "registration_order" | "random" | "rating";
}

export const singleElimination: FormatAdapter<SingleElimConfig> = {
  key: "SINGLE_ELIMINATION",

  validate(_config: SingleElimConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    if (entrants.length < 2) {
      errors.push("Single elimination requires at least 2 entrants.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  plan(
    config: SingleElimConfig,
    entrants: Entrant[],
    seed?: number,
  ): TournamentPlan {
    const cfg = { thirdPlacePlayoff: false, bestOf: 1, ...config };
    const n = entrants.length;
    const bracketSize = nextPowerOfTwo(n);
    const numByes = bracketSize - n;
    const numRounds = Math.log2(bracketSize);

    // Seed entrants
    const seeded = seedEntrants(entrants, cfg.seedingSource ?? "random", seed);

    // Build bracket
    const fixtures: Fixture[] = [];
    const gameweeks: GameweekPlan[] = [];
    let fixtureId = 0;

    for (let round = 1; round <= numRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      const matchIds: string[] = [];

      for (let slot = 0; slot < matchesInRound; slot++) {
        const matchId = `fx_se_${fixtureId++}`;
        matchIds.push(matchId);

        let homeId: string | undefined;
        let awayId: string | undefined;

        if (round === 1) {
          // First round: pair 1vN, 2v(N-1), etc.
          const homeIdx = slot;
          const awayIdx = bracketSize - 1 - slot;

          if (homeIdx < numByes) {
            // bye — skip this match, auto-advance
            continue;
          }

          homeId = seeded[homeIdx]?.id;
          awayId = seeded[awayIdx]?.id;
        }
        // Later rounds: positions filled by bracket progression (handled by onResult)

        fixtures.push({
          id: matchId,
          homeEntrantId: homeId ?? "",
          awayEntrantId: awayId ?? "",
          bracketRound: round,
          bracketSlot: slot,
        });
      }

      if (matchIds.length > 0) {
        gameweeks.push({
          number: round,
          label: round === numRounds ? "Final" : `Round ${round}`,
          matchIds,
        });
      }
    }

    // Third-place playoff
    if (cfg.thirdPlacePlayoff && n >= 4) {
      const tpId = `fx_se_${fixtureId++}`;
      fixtures.push({
        id: tpId,
        homeEntrantId: "",
        awayEntrantId: "",
        bracketRound: numRounds + 1,
        bracketSlot: 0,
      });
      gameweeks.push({
        number: numRounds + 1,
        label: "Third Place Playoff",
        matchIds: [tpId],
      });
    }

    // Count actual meaningful fixtures
    const totalMatches = fixtures.filter(
      (f) => f.homeEntrantId && f.awayEntrantId,
    ).length;

    return {
      stages: [{ kind: "BRACKET", position: 0, config: cfg }],
      gameweeks,
      fixtures,
      totalMatches,
    };
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    _rules: TiebreakerRule[],
    _entrants: Entrant[],
  ): StandingsSet {
    const rows: StandingRow[] = [];
    const seen = new Set<string>();

    for (const f of fixtures) {
      const r = results.get(f.id);
      if (!r) continue;

      for (const eid of [f.homeEntrantId, f.awayEntrantId]) {
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);

        const isFinal = f.bracketRound && f.bracketRound >= 2;
        rows.push({
          entityId: eid,
          entityName: eid,
          played: 1,
          won: r.winnerId === eid ? 1 : 0,
          drawn: 0,
          lost: r.winnerId && r.winnerId !== eid ? 1 : 0,
          goalsFor: r.homeScore ?? 0,
          goalsAgainst: r.awayScore ?? 0,
          goalDiff: (r.homeScore ?? 0) - (r.awayScore ?? 0),
          points: r.winnerId === eid ? 1 : 0,
          rank: isFinal && r.winnerId === eid ? 1 : 2,
          rankShared: false,
          tiebreakTrace: [],
        });
      }
    }

    return { squad: rows, individual: rows };
  },

  isComplete(state: EngineState): boolean {
    const finalRound = Math.max(
      ...state.fixtures.map((f) => f.bracketRound ?? 0),
    );
    const finalMatch = state.fixtures.find(
      (f) => f.bracketRound === finalRound,
    );
    if (!finalMatch) return false;
    const r = state.results.get(finalMatch.id);
    return r?.status === "COMPLETED";
  },
};

// ─── Helpers ────────────────────────────────────────────────
function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function seedEntrants(
  entrants: Entrant[],
  source: string,
  seed?: number,
): Entrant[] {
  const list = [...entrants];

  switch (source) {
    case "random": {
      const rng = mulberry32(seed ?? Date.now());
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      break;
    }
    case "rating":
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "manual":
    case "registration_order":
    default:
      // Keep original order
      break;
  }

  return list;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}