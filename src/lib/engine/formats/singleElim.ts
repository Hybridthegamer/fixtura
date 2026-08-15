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
  EngineMutation,
  GameweekPlan,
} from "../types";
import {
  mulberry32,
  fisherYatesShuffle,
  buildEliminationBracket,
  eliminationOnResult,
  THIRD_PLACE_SUFFIX,
} from "../bracket";

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
    const seeded = seedEntrants(entrants, cfg.seedingSource ?? "random", seed);

    const { fixtures, numRounds, tppId } = buildEliminationBracket(seeded, "fx_se_", {
      thirdPlacePlayoff: cfg.thirdPlacePlayoff,
    });

    const gameweeks: GameweekPlan[] = [];
    for (let round = 1; round <= numRounds; round++) {
      const matchIds = fixtures
        .filter((f) => f.bracketRound === round && !f.id.endsWith(THIRD_PLACE_SUFFIX))
        .map((f) => f.id);
      gameweeks.push({
        number: round,
        label: round === numRounds ? "Final" : `Round ${round}`,
        matchIds,
      });
    }
    if (tppId) {
      gameweeks.push({ number: numRounds + 1, label: "Third Place Playoff", matchIds: [tppId] });
    }

    return {
      stages: [{ kind: "BRACKET", position: 0, config: cfg }],
      gameweeks,
      fixtures,
      totalMatches: n - 1 + (tppId ? 1 : 0),
    };
  },

  onResult(state: EngineState, result: MatchResult): EngineMutation[] {
    return eliminationOnResult(state.fixtures, result);
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    _rules: TiebreakerRule[],
    entrants: Entrant[],
  ): StandingsSet {
    const rows: StandingRow[] = [];
    const seen = new Set<string>();
    const bracketFixtures = fixtures.filter((f) => !f.id.endsWith(THIRD_PLACE_SUFFIX) && f.bracketRound != null);
    const finalRound = bracketFixtures.length > 0
      ? Math.max(...bracketFixtures.map((f) => f.bracketRound!))
      : 0;

    for (const f of fixtures) {
      const r = results.get(f.id);
      if (!r) continue;

      for (const eid of [f.homeEntrantId, f.awayEntrantId]) {
        if (!eid || seen.has(eid)) continue;
        seen.add(eid);

        const entrant = entrants.find((e) => e.id === eid);
        const wonHere = r.winnerId === eid;
        const isFinal = f.bracketRound === finalRound;
        const gf = eid === f.homeEntrantId ? (r.homeScore ?? 0) : (r.awayScore ?? 0);
        const ga = eid === f.homeEntrantId ? (r.awayScore ?? 0) : (r.homeScore ?? 0);
        rows.push({
          entityId: eid,
          entityName: entrant?.name ?? eid,
          squadId: entrant?.squadId,
          played: 1,
          won: wonHere ? 1 : 0,
          drawn: 0,
          lost: r.winnerId && r.winnerId !== eid ? 1 : 0,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDiff: gf - ga,
          points: wonHere ? 1 : 0,
          rank: isFinal && wonHere ? 1 : isFinal ? 2 : 0,
          rankShared: false,
          tiebreakTrace: [],
        });
      }
    }

    return { squad: rows, individual: rows };
  },

  isComplete(state: EngineState): boolean {
    const bracketFixtures = state.fixtures.filter(
      (f) => f.bracketRound != null && !f.id.endsWith(THIRD_PLACE_SUFFIX),
    );
    if (bracketFixtures.length === 0) return false;
    const finalRound = Math.max(...bracketFixtures.map((f) => f.bracketRound!));
    const finalMatch = bracketFixtures.find((f) => f.bracketRound === finalRound);
    if (!finalMatch) return false;
    const r = state.results.get(finalMatch.id);
    return r?.status === "COMPLETED" || r?.status === "FORFEIT_HOME" || r?.status === "FORFEIT_AWAY";
  },
};

// ─── Helpers ────────────────────────────────────────────────
function seedEntrants(
  entrants: Entrant[],
  source: string,
  seed?: number,
): Entrant[] {
  switch (source) {
    case "random":
      return fisherYatesShuffle(entrants, mulberry32(seed ?? Date.now()));
    case "rating":
      return [...entrants].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "manual":
    case "registration_order":
    default:
      return [...entrants];
  }
}
