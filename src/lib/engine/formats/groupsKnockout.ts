// ─── Groups → Knockout (§6.4) ──────────────────────────────
// Snake seeding into G groups → round robin per group → top Q advance → single elim.
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
    const gameweeks: GameweekPlan[] = [];
    let fixtureId = 0;

    // Snake seeding into groups
    const groups: Entrant[][] = Array.from({ length: G }, () => []);
    const seeded = [...entrants];
    const rng = mulberry32(seed ?? Date.now());
    seeded.sort(() => rng() - 0.5);

    // Snake: 1→G, G→1, 1→G, ...
    let forward = true;
    let gi = 0;
    for (const e of seeded) {
      if (forward) {
        groups[gi].push(e);
      } else {
        groups[G - 1 - gi].push(e);
      }
      gi++;
      if (gi >= G) {
        gi = 0;
        forward = !forward;
      }
    }

    // Round robin per group
    let gwNum = 0;
    for (let g = 0; g < G; g++) {
      const groupEntrants = groups[g];
      const n = groupEntrants.length;
      const rrFixtures = roundRobinPairs(groupEntrants, fixtureId);
      fixtureId += rrFixtures.length;

      for (const f of rrFixtures) {
        f.groupId = `G${g + 1}`;
        f.gameweek = gwNum + 1;
        fixtures.push(f);
      }

      // Each group's fixtures become gameweeks
      const roundsInGroup = n % 2 === 0 ? n - 1 : n;
      for (let r = 0; r < roundsInGroup; r++) {
        gameweeks.push({
          number: gwNum + r + 1,
          label: `Group ${g + 1} — Round ${r + 1}`,
          matchIds: rrFixtures.filter((_, i) => true).map((f) => f.id),
        });
      }
      gwNum += roundsInGroup;
    }

    // Knockout stage
    const qualifiers: Entrant[] = [];
    for (let g = 0; g < G; g++) {
      // Take top Q from each group (by seeding order for now)
      qualifiers.push(...groups[g].slice(0, config.advance));
    }

    // Cross-group pairing: group winners vs runners-up from other groups
    // Simplified: 1st of G1 vs 2nd of G2, 1st of G2 vs 2nd of G1, etc.
    const koFixtures: Fixture[] = [];
    const bracketSize = nextPowerOfTwo(qualifiers.length);
    const koRounds = Math.log2(bracketSize);

    for (let round = 1; round <= koRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      const matchIds: string[] = [];

      for (let slot = 0; slot < matchesInRound; slot++) {
        const matchId = `fx_gk_ko_${fixtureId++}`;
        matchIds.push(matchId);

        let homeId = "";
        let awayId = "";

        if (round === 1 && qualifiers.length > 0) {
          // Cross-group: group winner vs runner-up
          const pairing = getKnockoutPairings(qualifiers, G, config.advance);
          if (slot * 2 < pairing.length) {
            homeId = pairing[slot * 2]?.id ?? "";
            awayId = pairing[slot * 2 + 1]?.id ?? "";
          }
        }

        koFixtures.push({
          id: matchId,
          homeEntrantId: homeId,
          awayEntrantId: awayId,
          bracketRound: round,
          bracketSlot: slot,
          stageIndex: 1,
        });
      }

      gameweeks.push({
        number: gwNum + round,
        label: round === koRounds ? "Final" : `KO Round ${round}`,
        matchIds,
      });
    }

    return {
      stages: [
        { kind: "GROUP", position: 0, config: { groups: G } },
        { kind: "BRACKET", position: 1, config: { advance: config.advance } },
      ],
      gameweeks,
      fixtures: [...fixtures, ...koFixtures],
      totalMatches: fixtures.length + koFixtures.length,
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

    for (const e of entrants) {
      stats.set(e.id, {
        entityId: e.id, entityName: e.name,
        played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
        rank: 0, rankShared: false, tiebreakTrace: [],
      });
    }

    // Only count group stage fixtures
    const groupFixtures = fixtures.filter((f) => f.stageIndex === undefined || f.stageIndex === 0);

    for (const f of groupFixtures) {
      const r = results.get(f.id);
      if (!r || r.status === "VOID") continue;

      const home = stats.get(f.homeEntrantId);
      const away = stats.get(f.awayEntrantId);
      if (!home || !away) continue;

      home.played++; away.played++;
      if (r.homeScore !== undefined && r.awayScore !== undefined) {
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

    rows.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff);
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

// ─── Helpers ────────────────────────────────────────────────
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
        gameweek: round + 1,
      });
    }

    fixed.splice(1, 0, rotating.pop()!);
    rotating.unshift(fixed.pop()!);
  }

  return fixtures;
}

function getKnockoutPairings(
  qualifiers: Entrant[],
  groups: number,
  advance: number,
): Entrant[] {
  // Cross-group: group winners vs runners-up from different groups
  // Pair: G1-1st vs G2-2nd, G2-1st vs G1-2nd, G3-1st vs G4-2nd, etc.
  const result: Entrant[] = [];
  const perGroup = qualifiers.length / groups;

  for (let g1 = 0; g1 < groups - 1; g1 += 2) {
    const g2 = g1 + 1;
    if (perGroup >= 2) {
      result.push(qualifiers[g1 * perGroup]);     // G1-1st
      result.push(qualifiers[g2 * perGroup + 1]); // G2-2nd
      result.push(qualifiers[g2 * perGroup]);     // G2-1st
      result.push(qualifiers[g1 * perGroup + 1]); // G1-2nd
    }
  }

  return result;
}

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
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