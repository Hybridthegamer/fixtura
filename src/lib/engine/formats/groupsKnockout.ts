// ─── Groups → Knockout (§6.4) ──────────────────────────────
// Snake seeding into G groups → round robin per group → top Q per group
// advance → single elim. The knockout bracket can't be built until the
// group stage is fully decided, so it's generated lazily via onResult().
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
import {
  mulberry32,
  fisherYatesShuffle,
  buildEliminationBracket,
  eliminationOnResult,
  THIRD_PLACE_SUFFIX,
} from "../bracket";

export interface GroupsKnockoutConfig {
  groups: number;
  advance: number; // top Q per group
  bestOf?: number;
}

export const groupsKnockout: FormatAdapter<GroupsKnockoutConfig> = {
  key: "GROUPS_KNOCKOUT",

  validate(config: GroupsKnockoutConfig, entrants: Entrant[]): ValidationResult {
    const errors: string[] = [];
    if (config.groups < 2) errors.push("Need at least 2 groups.");
    if (config.advance < 1) errors.push("At least 1 must advance per group.");
    if (entrants.length < config.groups * config.advance) {
      errors.push(
        `Need at least ${config.groups * config.advance} entrants for ${config.groups} groups advancing ${config.advance}.`,
      );
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  plan(
    config: GroupsKnockoutConfig,
    entrants: Entrant[],
    seed?: number,
  ): TournamentPlan {
    const G = config.groups;
    const fixtures: Fixture[] = [];
    let fixtureId = 0;

    // Snake seeding into groups: 1→G, G→1, 1→G, ...
    const groups: Entrant[][] = Array.from({ length: G }, () => []);
    const rng = mulberry32(seed ?? Date.now());
    const seeded = fisherYatesShuffle(entrants, rng);

    let forward = true;
    let gi = 0;
    for (const e of seeded) {
      if (forward) groups[gi].push(e);
      else groups[G - 1 - gi].push(e);
      gi++;
      if (gi >= G) {
        gi = 0;
        forward = !forward;
      }
    }

    for (let g = 0; g < G; g++) {
      const groupEntrants = groups[g];
      const rrFixtures = roundRobinPairs(groupEntrants, fixtureId);
      fixtureId += rrFixtures.length;

      for (const f of rrFixtures) {
        f.groupId = `G${g + 1}`;
        fixtures.push(f);
      }
    }

    // Group-stage fixtures are already gameweek-tagged per group round via
    // their `gameweek` field (set in roundRobinPairs); build gameweek index.
    const gameweeks: GameweekPlan[] = [];
    const maxGw = Math.max(0, ...fixtures.map((f) => f.gameweek ?? 0));
    for (let gw = 1; gw <= maxGw; gw++) {
      gameweeks.push({
        number: gw,
        label: `Group Stage — Round ${gw}`,
        matchIds: fixtures.filter((f) => f.gameweek === gw).map((f) => f.id),
      });
    }

    const qualifierCount = G * config.advance;
    const knockoutMatches = Math.max(0, qualifierCount - 1);

    return {
      stages: [
        { kind: "GROUP", position: 0, config: { groups: G } },
        { kind: "BRACKET", position: 1, config: { advance: config.advance } },
      ],
      gameweeks,
      fixtures,
      totalMatches: fixtures.length + knockoutMatches,
    };
  },

  onResult(state: EngineState, result: MatchResult): EngineMutation[] {
    const fixture = state.fixtures.find((f) => f.id === result.matchId);
    if (!fixture) return [];

    // Knockout-stage match: standard elimination progression.
    if (fixture.bracketRound != null) {
      return eliminationOnResult(state.fixtures, result);
    }

    // Group-stage match: check whether the whole group stage just completed.
    if (!fixture.groupId) return [];
    const groupFixtures = state.fixtures.filter((f) => f.groupId != null);
    const allDecided = groupFixtures.every((f) => {
      const r = f.id === result.matchId ? result : state.results.get(f.id);
      return r && (r.status === "COMPLETED" || r.status === "FORFEIT_HOME" || r.status === "FORFEIT_AWAY" || r.status === "VOID");
    });
    if (!allDecided) return [];
    if (state.fixtures.some((f) => f.bracketRound != null)) return []; // already built

    const config = (state.formatConfig as GroupsKnockoutConfig | undefined) ?? { groups: 1, advance: 1 };
    const resultsWithLatest = new Map(state.results);
    resultsWithLatest.set(result.matchId, result);

    const groupIds = Array.from(new Set(groupFixtures.map((f) => f.groupId!))).sort();
    const standingsByGroup = new Map<string, StandingRow[]>();
    const entrantGroup = new Map<string, string>();
    for (const gid of groupIds) {
      const gFixtures = groupFixtures.filter((f) => f.groupId === gid);
      const gEntrantIds = new Set<string>();
      for (const f of gFixtures) { gEntrantIds.add(f.homeEntrantId); gEntrantIds.add(f.awayEntrantId); }
      for (const id of gEntrantIds) entrantGroup.set(id, gid);
      const gEntrants = state.entrants.filter((e) => gEntrantIds.has(e.id));
      standingsByGroup.set(gid, computeGroupStandings(gFixtures, resultsWithLatest, gEntrants));
    }

    // Qualifier seed list: rank tiers concatenated in group order (winners,
    // then runners-up, ...) — pairs seed_k against seed_(2G+1-k) in round 1,
    // which lands each group's winner against a different group's qualifier.
    const seedList: Entrant[] = [];
    for (let rank = 0; rank < config.advance; rank++) {
      for (const gid of groupIds) {
        const row = standingsByGroup.get(gid)?.[rank];
        if (!row) continue;
        const entrant = state.entrants.find((e) => e.id === row.entityId);
        if (entrant) seedList.push(entrant);
      }
    }

    const { fixtures: koFixtures } = buildEliminationBracket(seedList, "fx_gk_ko_", {});
    avoidSameGroupRound1(koFixtures, entrantGroup);

    return [{ type: "ADD_FIXTURES", payload: { fixtures: koFixtures } }];
  },

  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    _rules: TiebreakerRule[],
    entrants: Entrant[],
    pointsConfig?: PointsConfig,
  ): StandingsSet {
    const groupFixtures = fixtures.filter((f) => f.groupId != null);
    const rows = computeGroupStandings(groupFixtures, results, entrants, pointsConfig ?? DEFAULT_POINTS);
    return { squad: rows, individual: [] };
  },

  isComplete(state: EngineState): boolean {
    const koFixtures = state.fixtures.filter((f) => f.bracketRound != null);
    if (koFixtures.length === 0) return false;
    const finalRound = Math.max(...koFixtures.map((f) => f.bracketRound!));
    const finalMatch = koFixtures.find((f) => f.bracketRound === finalRound && !f.id.endsWith(THIRD_PLACE_SUFFIX));
    if (!finalMatch) return false;
    const r = state.results.get(finalMatch.id);
    return r?.status === "COMPLETED" || r?.status === "FORFEIT_HOME" || r?.status === "FORFEIT_AWAY";
  },
};

// ─── Helpers ────────────────────────────────────────────────
function computeGroupStandings(
  fixtures: Fixture[],
  results: Map<string, MatchResult>,
  entrants: Entrant[],
  pointsConfig: PointsConfig = DEFAULT_POINTS,
): StandingRow[] {
  const PTS_WIN = pointsConfig.win, PTS_DRAW = pointsConfig.draw;
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

  const rows = Array.from(stats.values()).map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
  // Points-per-match normalizes qualification across unequal group sizes (§6.4).
  rows.sort((a, b) => {
    const ppmA = a.played > 0 ? a.points / a.played : 0;
    const ppmB = b.played > 0 ? b.points / b.played : 0;
    return ppmB - ppmA || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Best-effort swap to break any same-group round-1 pairing the seed
 *  concatenation didn't naturally avoid (can happen for odd group counts). */
function avoidSameGroupRound1(fixtures: Fixture[], entrantGroup: Map<string, string>): void {
  const round1 = fixtures.filter((f) => f.bracketRound === 1).sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0));

  for (let i = 0; i < round1.length; i++) {
    const f = round1[i];
    if (!f.homeEntrantId || !f.awayEntrantId) continue;
    if (entrantGroup.get(f.homeEntrantId) !== entrantGroup.get(f.awayEntrantId)) continue;

    for (let j = i + 1; j < round1.length; j++) {
      const g = round1[j];
      if (!g.awayEntrantId) continue;
      if (entrantGroup.get(f.homeEntrantId) === entrantGroup.get(g.awayEntrantId)) continue;
      if (entrantGroup.get(g.homeEntrantId) === entrantGroup.get(f.awayEntrantId)) continue;
      const tmp = f.awayEntrantId;
      f.awayEntrantId = g.awayEntrantId;
      g.awayEntrantId = tmp;
      break;
    }
  }
}

function roundRobinPairs(entrants: Entrant[], startId: number): Fixture[] {
  const n = entrants.length;
  const isOdd = n % 2 !== 0;
  const effectiveN = isOdd ? n + 1 : n;
  const eff = isOdd
    ? [...entrants, { id: "BYE", name: "BYE", seed: 999 }]
    : entrants;

  const fixtures: Fixture[] = [];
  const rounds = effectiveN - 1;
  const fixed = eff.slice(0, effectiveN - 1);
  const rotating = eff.slice(effectiveN - 1);
  let idCounter = startId;

  for (let round = 0; round < rounds; round++) {
    const rotated = [fixed[0], rotating[0], ...fixed.slice(2), fixed[1]];

    for (let pair = 0; pair < effectiveN / 2; pair++) {
      const home = rotated[pair];
      const away = rotated[effectiveN - 1 - pair];
      if (home.id === "BYE" || away.id === "BYE") continue;

      fixtures.push({
        id: `fx_gk_rr_${idCounter++}`,
        homeEntrantId: home.id,
        awayEntrantId: away.id,
        homeSquadId: home.squadId,
        awaySquadId: away.squadId,
        gameweek: round + 1,
      });
    }

    fixed.splice(1, 0, rotating.pop()!);
    rotating.unshift(fixed.pop()!);
  }

  return fixtures;
}
