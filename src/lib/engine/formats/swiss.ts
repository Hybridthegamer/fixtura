// ─── Swiss System (§6.5) ────────────────────────────────────
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

export interface SwissConfig {
  rounds?: number;
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
    const numRounds = config.rounds ?? Math.ceil(Math.log2(entrants.length));
    const n = entrants.length;
    const isOdd = n % 2 !== 0;
    const effN = isOdd ? n + 1 : n;
    const teams = isOdd
      ? [...entrants, { id: "BYE", name: "BYE", seed: 999 }]
      : [...entrants];

    // Shuffle for random draw
    const rng = mulberry32(seed ?? Date.now());
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }

    // Use circle method to generate rematch-free pairings for up to N-1 rounds
    const fixtures: Fixture[] = [];
    let fixtureId = 0;

    for (let round = 0; round < Math.min(numRounds, effN - 1); round++) {
      for (let i = 0; i < effN / 2; i++) {
        const home = teams[i];
        const away = teams[effN - 1 - i];
        if (home.id === "BYE" || away.id === "BYE") continue;

        fixtures.push({
          id: `fx_sw_${fixtureId++}`,
          homeEntrantId: home.id,
          awayEntrantId: away.id,
          gameweek: round + 1,
        });
      }

      // Rotate: keep teams[0], shift teams[1..] right
      const last = teams[effN - 1];
      for (let i = effN - 1; i > 1; i--) teams[i] = teams[i - 1];
      teams[1] = last;
    }

    const gameweeks: GameweekPlan[] = [];
    for (let r = 1; r <= numRounds; r++) {
      const matchIds = fixtures.filter((f) => f.gameweek === r).map((f) => f.id);
      gameweeks.push({ number: r, label: `Round ${r}`, matchIds });
    }

    return {
      stages: [{ kind: "SWISS", position: 0, config: { rounds: numRounds } }],
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
    const PTS_WIN = 3, PTS_DRAW = 1;
    const stats = new Map<string, StandingRow>();
    const opponentScores = new Map<string, number[]>();

    for (const e of entrants) {
      stats.set(e.id, {
        entityId: e.id, entityName: e.name,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
        rank: 0, rankShared: false, tiebreakTrace: [],
      });
      opponentScores.set(e.id, []);
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
      opponentScores.get(home.entityId)?.push(away.points);
      opponentScores.get(away.entityId)?.push(home.points);
    }

    const rows = Array.from(stats.values()).map((r) => {
      const oppScores = opponentScores.get(r.entityId) ?? [];
      const buchholz = oppScores.reduce((a, b) => a + b, 0);
      return { ...r, goalDiff: r.goalsFor - r.goalsAgainst };
    });

    rows.sort((a, b) => {
      const ba = (opponentScores.get(a.entityId) ?? []).reduce((x, y) => x + y, 0);
      const bb = (opponentScores.get(b.entityId) ?? []).reduce((x, y) => x + y, 0);
      return b.points - a.points || bb - ba || b.goalDiff - a.goalDiff;
    });

    rows.forEach((r, i) => { r.rank = i + 1; });
    return { squad: rows, individual: [] };
  },

  isComplete(state: EngineState): boolean {
    for (const f of state.fixtures) {
      const r = state.results.get(f.id);
      if (!r || r.status === "SCHEDULED") return false;
    }
    return true;
  },
};

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}