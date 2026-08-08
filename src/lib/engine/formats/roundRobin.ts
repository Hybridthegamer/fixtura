// ─── Round Robin (§6.3) ─────────────────────────────────────
// Circle method for balanced schedule.
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

export interface RoundRobinConfig {
  double?: boolean;
  matchesPerGameweek?: number;
}

export const roundRobin: FormatAdapter<RoundRobinConfig> = {
  key: "ROUND_ROBIN",

  validate(_config: RoundRobinConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    if (entrants.length < 2) {
      errors.push("Round robin requires at least 2 entrants.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  plan(
    config: RoundRobinConfig,
    entrants: Entrant[],
    _seed?: number,
  ): TournamentPlan {
    const cfg = { double: false, matchesPerGameweek: 2, ...config };
    const n = entrants.length;
    const isOdd = n % 2 !== 0;
    const effN = isOdd ? n + 1 : n;
    const teams = isOdd
      ? [...entrants, { id: "BYE", name: "BYE", seed: 999 }]
      : [...entrants];

    const allFixtures: Fixture[] = [];
    let fixtureId = 0;

    // Circle method: team[0] is fixed, rotate team[1..N-1]
    for (let round = 0; round < effN - 1; round++) {
      for (let i = 0; i < effN / 2; i++) {
        const home = teams[i];
        const away = teams[effN - 1 - i];

        if (home.id === "BYE" || away.id === "BYE") continue;

        const matchId = `fx_rr_${fixtureId++}`;
        allFixtures.push({
          id: matchId,
          homeEntrantId: home.id,
          awayEntrantId: away.id,
          gameweek: round + 1,
        });

        if (cfg.double) {
          const revId = `fx_rr_${fixtureId++}`;
          allFixtures.push({
            id: revId,
            homeEntrantId: away.id,
            awayEntrantId: home.id,
            gameweek: effN - 1 + round + 1,
          });
        }
      }

      // Rotate: keep teams[0] fixed, shift teams[1..] right by 1
      const last = teams[effN - 1];
      for (let i = effN - 1; i > 1; i--) {
        teams[i] = teams[i - 1];
      }
      teams[1] = last;
    }

    const totalGameweeks = cfg.double ? (effN - 1) * 2 : effN - 1;
    const gameweeks: GameweekPlan[] = [];
    for (let gw = 1; gw <= totalGameweeks; gw++) {
      const matchIds = allFixtures.filter((f) => f.gameweek === gw).map((f) => f.id);
      if (matchIds.length > 0) {
        gameweeks.push({ number: gw, label: `Gameweek ${gw}`, matchIds });
      }
    }

    return {
      stages: [{ kind: "LEAGUE", position: 0, config: cfg }],
      gameweeks,
      fixtures: allFixtures,
      totalMatches: allFixtures.length,
    };
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    rules: TiebreakerRule[],
    entrants: Entrant[],
  ): StandingsSet {
    return computeRoundRobinStandings(fixtures, results, rules, entrants);
  },

  isComplete(state: EngineState): boolean {
    for (const f of state.fixtures) {
      const r = state.results.get(f.id);
      if (!r || r.status === "SCHEDULED" || r.status === "LIVE") return false;
    }
    return true;
  },
};

function computeRoundRobinStandings(
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  _rules: TiebreakerRule[],
  entrants: Entrant[],
): StandingsSet {
  const PTS_WIN = 3, PTS_DRAW = 1;
  const stats = new Map<string, StandingRow>();

  for (const e of entrants) {
    stats.set(e.id, {
      entityId: e.id, entityName: e.name,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
      rank: 0, rankShared: false, tiebreakTrace: [],
    });
  }

  for (const f of fixtures) {
    const r = results.get(f.id);
    if (!r || r.status === "VOID") continue;

    const home = stats.get(f.homeEntrantId);
    const away = stats.get(f.awayEntrantId);
    if (!home || !away) continue;

    home.played++; away.played++;

    if (r.status === "FORFEIT_HOME") {
      away.won++; home.lost++; away.points += PTS_WIN;
    } else if (r.status === "FORFEIT_AWAY") {
      home.won++; away.lost++; home.points += PTS_WIN;
    } else if (r.homeScore !== undefined && r.awayScore !== undefined) {
      home.goalsFor += r.homeScore; home.goalsAgainst += r.awayScore;
      away.goalsFor += r.awayScore; away.goalsAgainst += r.homeScore;
      if (r.homeScore > r.awayScore) { home.won++; away.lost++; home.points += PTS_WIN; }
      else if (r.awayScore > r.homeScore) { away.won++; home.lost++; away.points += PTS_WIN; }
      else { home.drawn++; away.drawn++; home.points += PTS_DRAW; away.points += PTS_DRAW; }
    }
  }

  const rows = Array.from(stats.values()).map((r) => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst,
  }));

  rows.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);

  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].points === rows[i - 1].points && rows[i].goalDiff === rows[i - 1].goalDiff) {
      rows[i].rank = rows[i - 1].rank;
      rows[i].rankShared = true;
      rows[i - 1].rankShared = true;
    } else {
      rows[i].rank = rank;
    }
    rank++;
  }

  return { squad: rows, individual: [] };
}