// ─── Cross-Squad Individual Round Robin (§6.6) ──────────────
// The NACOS Super League format — Fixtura's differentiator.
// Pure functions, zero database imports.

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

export interface CrossSquadRRConfig {
  squadsPerMatchup?: number;
  matchupsPerGameweek?: number;
  squadSize?: number;
}

const DEFAULT_CONFIG: CrossSquadRRConfig = {
  squadsPerMatchup: 2,
  matchupsPerGameweek: 2,
  squadSize: 5,
};

// Seeded PRNG (mulberry32) for deterministic fixture generation
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const crossSquadIndividualRR: FormatAdapter<CrossSquadRRConfig> = {
  key: "CROSS_SQUAD_INDIVIDUAL_RR",

  validate(config: CrossSquadRRConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const P = cfg.squadSize!;

    // Group entrants by squad
    const squadMap = new Map<string, Entrant[]>();
    for (const e of entrants) {
      const sid = e.squadId ?? "__unassigned";
      if (!squadMap.has(sid)) squadMap.set(sid, []);
      squadMap.get(sid)!.push(e);
    }

    const S = squadMap.size;

    if (S < 3) {
      errors.push(`Cross-squad RR requires at least 3 squads. Found ${S}.`);
    }

    for (const [squadId, members] of squadMap) {
      if (members.length !== P) {
        errors.push(
          `Squad ${squadId} has ${members.length} players, expected ${P}.`,
        );
      }
    }

    // Warn if total matches > 400
    const totalMatches = (S * (S - 1)) / 2 * P * P;
    if (totalMatches > 400) {
      warnings.push(
        `Total matches (${totalMatches}) exceeds 400. Consider reducing squads or players.`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  plan(
    config: CrossSquadRRConfig,
    entrants: Entrant[],
    seed?: number,
  ): TournamentPlan {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const P = cfg.squadSize!;
    const rng = mulberry32(seed ?? Date.now());

    // Group entrants by squad
    const squads = new Map<string, Entrant[]>();
    for (const e of entrants) {
      const sid = e.squadId ?? "__unassigned";
      if (!squads.has(sid)) squads.set(sid, []);
      squads.get(sid)!.push(e);
    }

    const squadIds = Array.from(squads.keys());
    const S = squadIds.length;

    // Generate all squad matchups (round robin)
    const squadMatchups: { squadA: string; squadB: string }[] = [];
    for (let i = 0; i < S; i++) {
      for (let j = i + 1; j < S; j++) {
        squadMatchups.push({ squadA: squadIds[i], squadB: squadIds[j] });
      }
    }

    // Shuffle squad matchups for varied gameweeks
    const shuffledMatchups = shuffle(squadMatchups, rng);

    // Group into gameweeks
    const gameweeks: GameweekPlan[] = [];
    const fixtures: Fixture[] = [];
    const matchupsPerGw = cfg.matchupsPerGameweek!;
    let fixtureCounter = 0;

    for (let i = 0; i < shuffledMatchups.length; i += matchupsPerGw) {
      const gwMatchups = shuffledMatchups.slice(i, i + matchupsPerGw);
      const gwNumber = gameweeks.length + 1;
      const matchIds: string[] = [];

      for (const mu of gwMatchups) {
        const squadAPlayers = squads.get(mu.squadA) ?? [];
        const squadBPlayers = squads.get(mu.squadB) ?? [];

        // Generate EVERY cross pairing: all P players of squad A vs all P players of squad B
        for (const playerA of squadAPlayers) {
          for (const playerB of squadBPlayers) {
            const matchId = `fx_${fixtureCounter++}`;
            matchIds.push(matchId);
            fixtures.push({
              id: matchId,
              homeEntrantId: playerA.id,
              awayEntrantId: playerB.id,
              homeSquadId: mu.squadA,
              awaySquadId: mu.squadB,
              gameweek: gwNumber,
            });
          }
        }
      }

      gameweeks.push({
        number: gwNumber,
        label: `Gameweek ${gwNumber}`,
        matchIds,
      });
    }

    const totalMatches = (S * (S - 1)) / 2 * P * P;

    return {
      stages: [{ kind: "CROSS_SQUAD", position: 0, config: cfg }],
      gameweeks,
      fixtures,
      totalMatches,
    };
  },

  onResult(): EngineMutation[] {
    return []; // Every cross pairing is fixed at plan time — no progression.
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    rules: TiebreakerRule[],
    entrants: Entrant[],
    pointsConfig?: PointsConfig,
  ): StandingsSet {
    return computeCrossSquadStandings(fixtures, results, rules, entrants, pointsConfig ?? DEFAULT_POINTS);
  },

  isComplete(state: EngineState): boolean {
    for (const f of state.fixtures) {
      const r = state.results.get(f.id);
      if (!r || r.status === "SCHEDULED" || r.status === "LIVE") return false;
    }
    return true;
  },
};

// ─── Standings Computation (§6.6 + §6.7) ───────────────────

function computeCrossSquadStandings(
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  rules: TiebreakerRule[],
  entrants: Entrant[],
  pointsConfig: PointsConfig,
): StandingsSet {
  const PTS_WIN = pointsConfig.win;
  const PTS_DRAW = pointsConfig.draw;
  const PTS_LOSS = pointsConfig.loss;

  // Individual stats
  const indivStats = new Map<string, {
    played: number; won: number; drawn: number; lost: number;
    goalsFor: number; goalsAgainst: number; squadId?: string; name: string;
  }>();

  // Squad stats
  const squadStats = new Map<string, {
    played: number; won: number; drawn: number; lost: number;
    goalsFor: number; goalsAgainst: number; name: string;
  }>();

  // Initialize
  for (const e of entrants) {
    indivStats.set(e.id, {
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, squadId: e.squadId, name: e.name,
    });
    if (e.squadId && !squadStats.has(e.squadId)) {
      squadStats.set(e.squadId, {
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, name: e.squadId,
      });
    }
  }

  // Aggregate results (§6.6 dual attribution)
  for (const f of fixtures) {
    const r = results.get(f.id);
    if (!r) continue;

    const homeId = f.homeEntrantId;
    const awayId = f.awayEntrantId;
    const homeSquad = f.homeSquadId ?? indivStats.get(homeId)?.squadId;
    const awaySquad = f.awaySquadId ?? indivStats.get(awayId)?.squadId;

    let homeGF = 0, awayGF = 0, homeGA = 0, awayGA = 0;
    let homeW = false, awayW = false;

    if (r.status === "FORFEIT_HOME") {
      const [fHome, fAway] = (r.forfeitDefaultScore ?? "3-0").split("-").map(Number);
      homeGF = fAway; homeGA = fHome;
      awayGF = fHome; awayGA = fAway;
      awayW = true;
    } else if (r.status === "FORFEIT_AWAY") {
      const [fHome, fAway] = (r.forfeitDefaultScore ?? "3-0").split("-").map(Number);
      homeGF = fHome; homeGA = fAway;
      awayGF = fAway; awayGA = fHome;
      homeW = true;
    } else if (r.status === "VOID") {
      continue; // Excluded from played counts
    } else if (r.homeScore !== undefined && r.awayScore !== undefined) {
      homeGF = r.homeScore;
      homeGA = r.awayScore;
      awayGF = r.awayScore;
      awayGA = r.homeScore;
      if (homeGF > awayGF) homeW = true;
      else if (awayGF > homeGF) awayW = true;
    } else {
      continue;
    }

    // Update individual stats
    const hi = indivStats.get(homeId);
    const ai = indivStats.get(awayId);
    if (hi) {
      hi.played++; hi.goalsFor += homeGF; hi.goalsAgainst += homeGA;
      if (homeW) hi.won++;
      else if (awayW) hi.lost++;
      else hi.drawn++;
    }
    if (ai) {
      ai.played++; ai.goalsFor += awayGF; ai.goalsAgainst += awayGA;
      if (awayW) ai.won++;
      else if (homeW) ai.lost++;
      else ai.drawn++;
    }

    // Dual attribution to squads
    if (homeSquad && squadStats.has(homeSquad)) {
      const hs = squadStats.get(homeSquad)!;
      hs.played++; hs.goalsFor += homeGF; hs.goalsAgainst += homeGA;
      if (homeW) hs.won++;
      else if (awayW) hs.lost++;
      else hs.drawn++;
    }
    if (awaySquad && squadStats.has(awaySquad)) {
      const as = squadStats.get(awaySquad)!;
      as.played++; as.goalsFor += awayGF; as.goalsAgainst += awayGA;
      if (awayW) as.won++;
      else if (homeW) as.lost++;
      else as.drawn++;
    }
  }

  // Build standings rows
  function points(w: number, d: number, l: number): number {
    return w * PTS_WIN + d * PTS_DRAW + l * PTS_LOSS;
  }

  const squadRows: StandingRow[] = [];
  for (const [id, s] of squadStats) {
    squadRows.push({
      entityId: id,
      entityName: s.name,
      played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
      goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
      goalDiff: s.goalsFor - s.goalsAgainst,
      points: points(s.won, s.drawn, s.lost),
      rank: 0, rankShared: false, tiebreakTrace: [],
    });
  }

  const indivRows: StandingRow[] = [];
  for (const [id, s] of indivStats) {
    indivRows.push({
      entityId: id,
      entityName: s.name,
      squadId: s.squadId,
      played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
      goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
      goalDiff: s.goalsFor - s.goalsAgainst,
      points: points(s.won, s.drawn, s.lost),
      rank: 0, rankShared: false, tiebreakTrace: [],
    });
  }

  return {
    squad: rankRows(squadRows, rules, fixtures, results, entrants, pointsConfig),
    individual: rankRows(indivRows, rules, fixtures, results, entrants, pointsConfig),
  };
}

// ─── Ranking with tiebreakers ──────────────────────────────
// Tie-group membership is tracked explicitly by resolveTieGroup as it
// recursively applies the cascade, rather than re-derived by comparing
// adjacent rows pairwise afterwards — a pairwise re-check is wrong for
// 3+-way ties (e.g. a rock-paper-scissors cycle on HEAD_TO_HEAD_POINTS:
// checking only two of the three tied rows at a time "separates" them
// even though the full mini-table leaves all three level).
function rankRows(
  rows: StandingRow[],
  rules: TiebreakerRule[],
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  entrants: Entrant[],
  pointsConfig: PointsConfig,
): StandingRow[] {
  const sorted = [...rows];
  const trace: Map<string, TiebreakerRule[]> = new Map();
  const tieGroupOf = new Map<string, number>();
  let nextGroupId = 0;

  sorted.sort((a, b) => b.points - a.points);

  if (rules.length > 0) {
    const groups = groupByPoints(sorted);
    for (const group of groups) {
      if (group.length <= 1) {
        if (group.length === 1) tieGroupOf.set(group[0].entityId, nextGroupId++);
        continue;
      }
      const resolved = resolveTieGroup(
        group, rules, fixtures, results, entrants, trace, tieGroupOf, () => nextGroupId++, pointsConfig,
      );
      for (let i = 0; i < resolved.length; i++) {
        const idx = sorted.indexOf(group[i]);
        if (idx >= 0) sorted[idx] = resolved[i];
      }
    }
  } else {
    for (const r of sorted) tieGroupOf.set(r.entityId, nextGroupId++);
  }

  // Assign ranks from the resolved tie-group membership.
  let rank = 1;
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && tieGroupOf.get(sorted[j].entityId) === tieGroupOf.get(sorted[i].entityId)) {
      j++;
    }
    const shared = j - i > 1;
    for (let k = i; k < j; k++) {
      sorted[k].rank = rank;
      sorted[k].rankShared = shared;
      sorted[k].tiebreakTrace = (trace.get(sorted[k].entityId) ?? []).map((rule) => ({
        rule, applied: true, result: "",
      }));
    }
    rank += j - i;
    i = j;
  }

  return sorted;
}

function groupByPoints(rows: StandingRow[]): StandingRow[][] {
  const groups: StandingRow[][] = [];
  let current: StandingRow[] = [];
  let currentPoints = -1;

  for (const r of rows) {
    if (r.points !== currentPoints) {
      if (current.length > 0) groups.push(current);
      current = [r];
      currentPoints = r.points;
    } else {
      current.push(r);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Recursively resolves a group of rows tied on points, applying the
 * tiebreaker cascade rule by rule. Every row ends up tagged in `tieGroupOf`
 * with an id shared by every other row it remains genuinely tied with —
 * that id (not a pairwise re-check) is what `rankRows` uses to decide
 * shared ranks, so an unbreakable N-way tie can never be silently ordered.
 */
function resolveTieGroup(
  group: StandingRow[],
  rules: TiebreakerRule[],
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  entrants: Entrant[],
  trace: Map<string, TiebreakerRule[]>,
  tieGroupOf: Map<string, number>,
  nextGroupId: () => number,
  pointsConfig: PointsConfig,
): StandingRow[] {
  const working = [...group];

  for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
    const rule = rules[ruleIdx];
    if (working.length <= 1) break;
    if (rule === "MANUAL_OVERRIDE" || rule === "COIN_TOSS") break;

    const separated = separateByRule(working, rule, fixtures, results, entrants, pointsConfig);
    if (separated.length > 1) {
      for (const sub of separated) {
        for (const row of sub) {
          const t = trace.get(row.entityId) ?? [];
          t.push(rule);
          trace.set(row.entityId, t);
        }
      }
      const remainingRules = rules.slice(ruleIdx + 1);
      const result: StandingRow[] = [];
      for (const sub of separated) {
        if (sub.length === 1) {
          tieGroupOf.set(sub[0].entityId, nextGroupId());
          result.push(sub[0]);
        } else {
          result.push(
            ...resolveTieGroup(sub, remainingRules, fixtures, results, entrants, trace, tieGroupOf, nextGroupId, pointsConfig),
          );
        }
      }
      return result;
    }
  }

  // Unbreakable tie — keep original order, all rows share one tie-group id.
  const gid = nextGroupId();
  for (const row of working) {
    tieGroupOf.set(row.entityId, gid);
    const t = trace.get(row.entityId) ?? [];
    t.push("MANUAL_OVERRIDE" as TiebreakerRule);
    trace.set(row.entityId, t);
  }
  return working;
}

function separateByRule(
  group: StandingRow[],
  rule: TiebreakerRule,
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  _entrants: Entrant[],
  pointsConfig: PointsConfig,
): StandingRow[][] {
  switch (rule) {
    case "POINTS":
      return separateBy(group, (r) => r.points, true);
    case "GOAL_DIFFERENCE":
      return separateBy(group, (r) => r.goalDiff, true);
    case "GOALS_FOR":
      return separateBy(group, (r) => r.goalsFor, true);
    case "GOALS_AGAINST_ASC":
      return separateBy(group, (r) => r.goalsAgainst, false);
    case "WINS":
      return separateBy(group, (r) => r.won, true);
    case "WIN_PERCENTAGE":
      return separateBy(group, (r) => r.played > 0 ? r.won / r.played : 0, true);
    case "MATCHES_PLAYED_ASC":
      return separateBy(group, (r) => r.played, false);
    case "HEAD_TO_HEAD_POINTS":
      return separateByHeadToHead(group, fixtures, results, "points", pointsConfig);
    case "HEAD_TO_HEAD_GD":
      return separateByHeadToHead(group, fixtures, results, "gd", pointsConfig);
    default:
      return [group];
  }
}

function separateBy(
  group: StandingRow[],
  getter: (r: StandingRow) => number,
  descending: boolean,
): StandingRow[][] {
  const buckets = new Map<number, StandingRow[]>();
  for (const r of group) {
    const v = getter(r);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v)!.push(r);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) =>
    descending ? b - a : a - b,
  );
  return keys.map((k) => buckets.get(k)!);
}

function separateByHeadToHead(
  group: StandingRow[],
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  metric: "points" | "gd",
  pointsConfig: PointsConfig,
): StandingRow[][] {
  const entityIds = new Set(group.map((r) => r.entityId));
  const PTS_WIN = pointsConfig.win, PTS_DRAW = pointsConfig.draw;

  const h2h = new Map<string, { points: number; gf: number; ga: number }>();
  for (const id of entityIds) {
    h2h.set(id, { points: 0, gf: 0, ga: 0 });
  }

  for (const f of fixtures) {
    if (!entityIds.has(f.homeEntrantId) || !entityIds.has(f.awayEntrantId)) continue;
    const r = results.get(f.id);
    if (!r || r.status === "VOID") continue;

    const home = h2h.get(f.homeEntrantId)!;
    const away = h2h.get(f.awayEntrantId)!;

    if (r.status === "FORFEIT_HOME") {
      away.points += PTS_WIN;
    } else if (r.status === "FORFEIT_AWAY") {
      home.points += PTS_WIN;
    } else if (r.homeScore !== undefined && r.awayScore !== undefined) {
      home.gf += r.homeScore; home.ga += r.awayScore;
      away.gf += r.awayScore; away.ga += r.homeScore;
      if (r.homeScore > r.awayScore) home.points += PTS_WIN;
      else if (r.awayScore > r.homeScore) away.points += PTS_WIN;
      else { home.points += PTS_DRAW; away.points += PTS_DRAW; }
    }
  }

  const getter = metric === "points"
    ? (r: StandingRow) => h2h.get(r.entityId)?.points ?? 0
    : (r: StandingRow) => {
        const h = h2h.get(r.entityId)!;
        return h.gf - h.ga;
      };

  return separateBy(group, getter, true);
}

