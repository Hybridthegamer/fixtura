// ─── Swiss System (§6.5) ────────────────────────────────────
// Rounds are paired on score, so only round 1 can be generated up front —
// later rounds are generated incrementally by onResult() once every match
// in the current round has a result.
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
  PointsConfig,
} from "../types";
import { DEFAULT_POINTS } from "../types";
import { mulberry32, fisherYatesShuffle } from "../bracket";

export interface SwissConfig {
  rounds?: number;
}

function numRoundsFor(config: SwissConfig | undefined, n: number): number {
  return config?.rounds ?? Math.ceil(Math.log2(Math.max(n, 2)));
}

export const swiss: FormatAdapter<SwissConfig> = {
  key: "SWISS",

  validate(_config: SwissConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    if (entrants.length < 4) errors.push("Swiss requires at least 4 entrants.");
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  plan(
    config: SwissConfig,
    entrants: Entrant[],
    seed?: number,
  ): TournamentPlan {
    const numRounds = numRoundsFor(config, entrants.length);
    const rng = mulberry32(seed ?? Date.now());
    const shuffled = fisherYatesShuffle(entrants, rng);

    const round1 = pairRound(shuffled, new Set(), 1, "fx_sw_0_");

    const gameweeks: GameweekPlan[] = [
      { number: 1, label: "Round 1", matchIds: round1.fixtures.map((f) => f.id) },
    ];
    for (let r = 2; r <= numRounds; r++) {
      gameweeks.push({ number: r, label: `Round ${r}`, matchIds: [] });
    }

    return {
      stages: [{ kind: "SWISS", position: 0, config: { rounds: numRounds } }],
      gameweeks,
      fixtures: round1.fixtures,
      totalMatches: numRounds * Math.floor(entrants.length / 2),
    };
  },

  onResult(state: EngineState, result: MatchResult): EngineMutation[] {
    const fixture = state.fixtures.find((f) => f.id === result.matchId);
    if (!fixture || fixture.gameweek == null) return [];
    if (
      result.status !== "COMPLETED" &&
      result.status !== "FORFEIT_HOME" &&
      result.status !== "FORFEIT_AWAY"
    ) {
      return [];
    }

    const currentRound = fixture.gameweek;
    const numRounds = numRoundsFor(state.formatConfig as SwissConfig | undefined, state.entrants.length);
    if (currentRound >= numRounds) return [];

    // Only generate the next round once every fixture in this round is decided.
    const roundFixtures = state.fixtures.filter((f) => f.gameweek === currentRound);
    const allDecided = roundFixtures.every((f) => {
      const r = f.id === result.matchId ? result : state.results.get(f.id);
      return r && (r.status === "COMPLETED" || r.status === "FORFEIT_HOME" || r.status === "FORFEIT_AWAY");
    });
    if (!allDecided) return [];

    // Don't regenerate if the next round already exists.
    if (state.fixtures.some((f) => f.gameweek === currentRound + 1)) return [];

    const resultsWithLatest = new Map(state.results);
    resultsWithLatest.set(result.matchId, result);

    const standings = computeSwissStandings(state.fixtures, resultsWithLatest, state.entrants);
    const playedPairs = new Set<string>();
    for (const f of state.fixtures) {
      if (!f.homeEntrantId || !f.awayEntrantId) continue;
      playedPairs.add(pairKey(f.homeEntrantId, f.awayEntrantId));
    }

    // Order by (points desc, buchholz desc) — pair adjacent, minimizing repeats.
    const ordered = standings
      .map((s) => state.entrants.find((e) => e.id === s.entityId)!)
      .filter(Boolean);

    const { fixtures } = pairRound(ordered, playedPairs, currentRound + 1, `fx_sw_${currentRound}_`);
    if (fixtures.length === 0) return [];

    return [{ type: "ADD_FIXTURES", payload: { fixtures, gameweek: currentRound + 1 } }];
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    _rules: TiebreakerRule[],
    entrants: Entrant[],
    pointsConfig?: PointsConfig,
  ): StandingsSet {
    const { win: PTS_WIN, draw: PTS_DRAW } = pointsConfig ?? DEFAULT_POINTS;
    const stats = new Map<string, StandingRow>();
    const opponentPoints = new Map<string, number[]>();

    for (const e of entrants) {
      stats.set(e.id, {
        entityId: e.id, entityName: e.name,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
        rank: 0, rankShared: false, tiebreakTrace: [],
      });
      opponentPoints.set(e.id, []);
    }

    for (const f of fixtures) {
      const r = results.get(f.id);
      if (!r || r.status === "VOID") continue;
      const home = stats.get(f.homeEntrantId);
      const away = stats.get(f.awayEntrantId);
      if (!home || !away) continue;

      home.played++; away.played++;
      if (r.status === "FORFEIT_HOME") { away.won++; home.lost++; away.points += PTS_WIN; }
      else if (r.status === "FORFEIT_AWAY") { home.won++; away.lost++; home.points += PTS_WIN; }
      else if (r.homeScore !== undefined && r.awayScore !== undefined) {
        home.goalsFor += r.homeScore; home.goalsAgainst += r.awayScore;
        away.goalsFor += r.awayScore; away.goalsAgainst += r.homeScore;
        if (r.homeScore > r.awayScore) { home.won++; away.lost++; home.points += PTS_WIN; }
        else if (r.awayScore > r.homeScore) { away.won++; home.lost++; away.points += PTS_WIN; }
        else { home.drawn++; away.drawn++; home.points += PTS_DRAW; away.points += PTS_DRAW; }
      }
    }

    for (const f of fixtures) {
      const r = results.get(f.id);
      if (!r || r.status === "VOID") continue;
      const home = stats.get(f.homeEntrantId);
      const away = stats.get(f.awayEntrantId);
      if (!home || !away) continue;
      opponentPoints.get(home.entityId)?.push(away.points);
      opponentPoints.get(away.entityId)?.push(home.points);
    }

    const rows = Array.from(stats.values()).map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
    const buchholz = (id: string) => (opponentPoints.get(id) ?? []).reduce((a, b) => a + b, 0);
    const medianBuchholz = (id: string) => {
      const scores = [...(opponentPoints.get(id) ?? [])].sort((a, b) => a - b);
      if (scores.length <= 2) return scores.reduce((a, b) => a + b, 0);
      return scores.slice(1, -1).reduce((a, b) => a + b, 0);
    };

    rows.sort((a, b) =>
      b.points - a.points ||
      buchholz(b.entityId) - buchholz(a.entityId) ||
      medianBuchholz(b.entityId) - medianBuchholz(a.entityId),
    );

    let rank = 1;
    for (let i = 0; i < rows.length; i++) {
      if (
        i > 0 &&
        rows[i].points === rows[i - 1].points &&
        buchholz(rows[i].entityId) === buchholz(rows[i - 1].entityId)
      ) {
        rows[i].rank = rows[i - 1].rank;
        rows[i].rankShared = true;
        rows[i - 1].rankShared = true;
      } else {
        rows[i].rank = rank;
      }
      rank++;
    }

    return { squad: rows, individual: [] };
  },

  isComplete(state: EngineState): boolean {
    const numRounds = numRoundsFor(state.formatConfig as SwissConfig | undefined, state.entrants.length);
    const lastRoundFixtures = state.fixtures.filter((f) => f.gameweek === numRounds);
    if (lastRoundFixtures.length === 0) return false;
    for (const f of lastRoundFixtures) {
      const r = state.results.get(f.id);
      if (!r || r.status === "SCHEDULED" || r.status === "LIVE") return false;
    }
    return true;
  },
};

// ─── Helpers ────────────────────────────────────────────────
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function computeSwissStandings(
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  entrants: Entrant[],
): StandingRow[] {
  return swiss.standings(fixtures, results, [], entrants).squad;
}

/**
 * Pairs entrants (already ordered best-to-worst) into a round, avoiding
 * repeat pairings where possible. Uses a greedy scan: for each unpaired
 * entrant (highest remaining score first), pair with the next unpaired
 * entrant they haven't already played — a "floater" who can't be paired
 * cleanly is pushed down and paired against the first available opponent.
 */
function pairRound(
  ordered: Entrant[],
  playedPairs: Set<string>,
  roundNumber: number,
  idPrefix: string,
): { fixtures: Fixture[] } {
  const pool = [...ordered];
  const fixtures: Fixture[] = [];
  let counter = 0;

  // Odd count: lowest-ranked entrant who hasn't yet had a bye gets one.
  if (pool.length % 2 !== 0) {
    pool.pop();
  }

  const unpaired = [...pool];
  while (unpaired.length > 1) {
    const a = unpaired.shift()!;
    let matchIdx = unpaired.findIndex((b) => !playedPairs.has(pairKey(a.id, b.id)));
    if (matchIdx === -1) matchIdx = 0; // no fresh opponent left — floater plays the next best
    const b = unpaired.splice(matchIdx, 1)[0];

    fixtures.push({
      id: `${idPrefix}${counter++}`,
      homeEntrantId: a.id,
      awayEntrantId: b.id,
      gameweek: roundNumber,
    });
    playedPairs.add(pairKey(a.id, b.id));
  }

  return { fixtures };
}
