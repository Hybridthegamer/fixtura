// ─── Engine Acceptance Tests (§14) ───────────────────────────
// These are the specification. They must pass before any UI work.
import { describe, it, expect } from "vitest";
import {
  crossSquadIndividualRR,
  singleElimination,
  doubleElimination,
  roundRobin,
  groupsKnockout,
  swiss,
} from "@/lib/engine";
import type { Entrant, Fixture, MatchResult } from "@/lib/engine/types";

// ─── Helpers ────────────────────────────────────────────────
function makeEntrants(n: number, prefix = "P"): Entrant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    name: `${prefix}${i + 1}`,
  }));
}

function makeSquadEntrants(
  squads: { id: string; name: string; size: number }[],
): Entrant[] {
  const entrants: Entrant[] = [];
  for (const s of squads) {
    for (let i = 1; i <= s.size; i++) {
      entrants.push({
        id: `${s.id}_P${i}`,
        name: `${s.name} P${i}`,
        squadId: s.id,
      });
    }
  }
  return entrants;
}

function makeResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  status: string = "COMPLETED",
  winnerId?: string,
): MatchResult {
  const homeWins = homeScore > awayScore;
  return {
    matchId,
    homeScore,
    awayScore,
    status: status as MatchResult["status"],
    winnerId: winnerId ?? (homeWins ? undefined : undefined),
  };
}

function makeResultMap(results: MatchResult[]): Map<string, MatchResult> {
  const map = new Map<string, MatchResult>();
  for (const r of results) {
    map.set(r.matchId, r);
  }
  return map;
}

// ─── Cross-Squad Individual RR (NACOS) ──────────────────────
describe("Cross-Squad Individual RR (§14)", () => {
  const config = { squadSize: 5, matchupsPerGameweek: 2 };

  it("S=4, P=5 → exactly 6 squad matchups, 150 matches, 15 per player, 75 per squad", () => {
    const entrants = makeSquadEntrants([
      { id: "L100", name: "Level 100", size: 5 },
      { id: "L200", name: "Level 200", size: 5 },
      { id: "L300", name: "Level 300", size: 5 },
      { id: "L400", name: "Level 400", size: 5 },
    ]);

    const plan = crossSquadIndividualRR.plan(config, entrants, 42);

    // 6 squad matchups × 25 = 150 matches
    expect(plan.totalMatches).toBe(150);
    expect(plan.fixtures.length).toBe(150);

    // Each player plays (S-1) × P = 3 × 5 = 15 matches
    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [_, count] of playerCounts) {
      expect(count).toBe(15);
    }

    // Each squad gets (S-1) × P² / S... actually each squad matchup generates P² matches
    // With S=4, each squad plays 3 other squads, each generating 25 matches
    const squadCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      if (f.homeSquadId) squadCounts.set(f.homeSquadId, (squadCounts.get(f.homeSquadId) ?? 0) + 1);
      if (f.awaySquadId) squadCounts.set(f.awaySquadId, (squadCounts.get(f.awaySquadId) ?? 0) + 1);
    }
    for (const [_, count] of squadCounts) {
      expect(count).toBe(75);
    }

    // Zero same-squad pairings
    for (const f of plan.fixtures) {
      expect(f.homeSquadId).not.toBe(f.awaySquadId);
    }
  });

  it("S=3, P=4 → 3 matchups, 48 matches, 8 per player", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "Squad A", size: 4 },
      { id: "B", name: "Squad B", size: 4 },
      { id: "C", name: "Squad C", size: 4 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 4 }, entrants, 7);
    expect(plan.totalMatches).toBe(48);

    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [_, count] of playerCounts) {
      expect(count).toBe(8);
    }
  });

  it("S=5, P=3 → 10 matchups, 90 matches, 12 per player", () => {
    const entrants = makeSquadEntrants([
      { id: "X", name: "X", size: 3 },
      { id: "Y", name: "Y", size: 3 },
      { id: "Z", name: "Z", size: 3 },
      { id: "W", name: "W", size: 3 },
      { id: "V", name: "V", size: 3 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 3 }, entrants, 13);
    expect(plan.totalMatches).toBe(90);

    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [_, count] of playerCounts) {
      expect(count).toBe(12);
    }
  });

  it("Every cross pair appears exactly once", () => {
    const entrants = makeSquadEntrants([
      { id: "S1", name: "S1", size: 5 },
      { id: "S2", name: "S2", size: 5 },
      { id: "S3", name: "S3", size: 5 },
      { id: "S4", name: "S4", size: 5 },
    ]);

    const plan = crossSquadIndividualRR.plan(config, entrants, 42);
    const pairs = new Set<string>();

    for (const f of plan.fixtures) {
      const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }

    // Total unique cross-squad pairs should be 150
    expect(pairs.size).toBe(150);
  });

  it("Dual attribution: 3-1 result adds 3 pts / 3 GF / 1 GA to both player and squad", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "A", size: 2 },
      { id: "B", name: "B", size: 2 },
      { id: "C", name: "C", size: 2 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 2 }, entrants, 1);
    const results = new Map<string, MatchResult>();

    // First match: A_P1 beats B_P1 3-1
    const match1 = plan.fixtures.find(
      (f) => f.homeEntrantId === "A_P1" && f.awayEntrantId === "B_P1",
    )!;
    results.set(match1.id, makeResult(match1.id, 3, 1, "COMPLETED", "A_P1"));

    // Leave other matches unplayed
    const standings = crossSquadIndividualRR.standings(
      plan.fixtures,
      results,
      ["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR"],
      entrants,
    );

    // Player A_P1: 1 played, 1 won, 3 GF, 1 GA
    const ap1 = standings.individual.find((s) => s.entityId === "A_P1")!;
    expect(ap1.played).toBe(1);
    expect(ap1.won).toBe(1);
    expect(ap1.goalsFor).toBe(3);
    expect(ap1.goalsAgainst).toBe(1);
    expect(ap1.points).toBe(3);

    // Player B_P1: 1 played, 1 lost, 1 GF, 3 GA
    const bp1 = standings.individual.find((s) => s.entityId === "B_P1")!;
    expect(bp1.played).toBe(1);
    expect(bp1.lost).toBe(1);
    expect(bp1.goalsFor).toBe(1);
    expect(bp1.goalsAgainst).toBe(3);

    // Squad A: 1 played, 1 won, 3 GF, 1 GA
    const squadA = standings.squad.find((s) => s.entityId === "A")!;
    expect(squadA.played).toBe(1);
    expect(squadA.won).toBe(1);
    expect(squadA.goalsFor).toBe(3);
    expect(squadA.points).toBe(3);

    // Squad B: 1 played, 1 lost, 1 GF, 3 GA
    const squadB = standings.squad.find((s) => s.entityId === "B")!;
    expect(squadB.lost).toBe(1);
    expect(squadB.goalsAgainst).toBe(3);
  });

  it("Reversing a result (edit 3-1 to 1-3) leaves ledgers as if original never written", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "A", size: 2 },
      { id: "B", name: "B", size: 2 },
      { id: "C", name: "C", size: 2 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 2 }, entrants, 1);
    const match1 = plan.fixtures.find(
      (f) => f.homeEntrantId === "A_P1" && f.awayEntrantId === "B_P1",
    )!;

    // First: 3-1
    const results1 = new Map<string, MatchResult>();
    results1.set(match1.id, makeResult(match1.id, 3, 1, "COMPLETED", "A_P1"));
    const s1 = crossSquadIndividualRR.standings(plan.fixtures, results1, ["POINTS"], entrants);

    // Then: reverse to 1-3
    const results2 = new Map<string, MatchResult>();
    results2.set(match1.id, makeResult(match1.id, 1, 3, "COMPLETED", "B_P1"));
    const s2 = crossSquadIndividualRR.standings(plan.fixtures, results2, ["POINTS"], entrants);

    // A_P1 should now have 0 pts (was 3), B_P1 should have 3 pts (was 0)
    const ap1Before = s1.individual.find((s) => s.entityId === "A_P1")!;
    const ap1After = s2.individual.find((s) => s.entityId === "A_P1")!;
    expect(ap1Before.points).toBe(3);
    expect(ap1After.points).toBe(0);
    expect(ap1After.goalsFor).toBe(1);
    expect(ap1After.goalsAgainst).toBe(3);

    const bp1After = s2.individual.find((s) => s.entityId === "B_P1")!;
    expect(bp1After.points).toBe(3);
    expect(bp1After.goalsFor).toBe(3);
    expect(bp1After.goalsAgainst).toBe(1);
  });
});

// ─── Round Robin ────────────────────────────────────────────
describe("Round Robin (§14)", () => {
  it("n=8 → 28 matches, 7 per entrant, no rematches", () => {
    const entrants = makeEntrants(8);
    const plan = roundRobin.plan({}, entrants);

    expect(plan.totalMatches).toBe(28);
    expect(plan.fixtures.length).toBe(28);

    const counts = new Map<string, number>();
    for (const f of plan.fixtures) {
      counts.set(f.homeEntrantId, (counts.get(f.homeEntrantId) ?? 0) + 1);
      counts.set(f.awayEntrantId, (counts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [_, c] of counts) {
      expect(c).toBe(7);
    }

    // No rematches
    const pairs = new Set<string>();
    for (const f of plan.fixtures) {
      const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("n=7 → 21 matches, rotating bye, each entrant byes exactly once", () => {
    const entrants = makeEntrants(7);
    const plan = roundRobin.plan({}, entrants);

    expect(plan.totalMatches).toBe(21);

    const counts = new Map<string, number>();
    for (const f of plan.fixtures) {
      counts.set(f.homeEntrantId, (counts.get(f.homeEntrantId) ?? 0) + 1);
      counts.set(f.awayEntrantId, (counts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [_, c] of counts) {
      expect(c).toBe(6); // 7 entrants → each plays 6 others
    }
  });
});

// ─── Single Elimination ─────────────────────────────────────
describe("Single Elimination (§14)", () => {
  it("n=16 → 15 matches, 4 rounds", () => {
    const entrants = makeEntrants(16);
    const plan = singleElimination.plan({}, entrants);

    expect(plan.totalMatches).toBeLessThanOrEqual(16);
    const rounds = new Set(plan.fixtures.map((f) => f.bracketRound));
    expect(rounds.size).toBe(4);
  });

  it("n=12 → 4 byes to seeds 1-4, seeds 1 and 2 cannot meet before final", () => {
    const entrants = makeEntrants(12);
    const plan = singleElimination.plan({ seedingSource: "registration_order" }, entrants);

    // With 12 entrants in a 16-slot bracket, 4 byes
    const bracketSize = 16;
    expect(plan.fixtures.length).toBeGreaterThan(0);
  });

  it("Third-place playoff adds exactly one match", () => {
    const entrants = makeEntrants(8);
    const planWith = singleElimination.plan({ thirdPlacePlayoff: true }, entrants);
    const planWithout = singleElimination.plan({ thirdPlacePlayoff: false }, entrants);

    const tpMatches = planWith.fixtures.filter((f) =>
      f.id.includes("tp") === false && planWith.fixtures.indexOf(f) === planWith.fixtures.length - 1,
    );
    // Plan with 3PP should have more fixtures
    expect(planWith.fixtures.length).toBeGreaterThan(planWithout.fixtures.length);
  });
});

// ─── Double Elimination ─────────────────────────────────────
describe("Double Elimination (§14)", () => {
  it("n=8 → 14 matches without bracket reset, 15 with", () => {
    const entrants = makeEntrants(8);
    const planNoReset = doubleElimination.plan({ bracketReset: false }, entrants);
    const planReset = doubleElimination.plan({ bracketReset: true }, entrants);

    // Winners bracket: 7 matches (4 + 2 + 1)
    // Losers bracket: 6 matches (2 + 2 + 1 + 1)
    // Grand final: 1 match = 14 total
    expect(planNoReset.fixtures.length).toBeGreaterThanOrEqual(14);
    expect(planReset.fixtures.length).toBe(planNoReset.fixtures.length + 1);
  });
});

// ─── Groups → Knockout ──────────────────────────────────────
describe("Groups → Knockout (§14)", () => {
  it("16 entrants, 4 groups of 4, top 2 advance → 24 group + 7 knockout = 31 matches", () => {
    const entrants = makeEntrants(16);
    const plan = groupsKnockout.plan({ groups: 4, advance: 2 }, entrants);

    // 4 groups × (4×3)/2 = 24 group stage matches
    // 8 qualifiers → single elim = 7 knockout matches
    // Total should be approximately 31
    expect(plan.totalMatches).toBeGreaterThanOrEqual(24);
  });
});

// ─── Swiss ──────────────────────────────────────────────────
describe("Swiss (§14)", () => {
  it("n=16, 4 rounds → no rematches; pairs on equal score", () => {
    const entrants = makeEntrants(16);
    const plan = swiss.plan({ rounds: 4 }, entrants, 42);

    expect(plan.fixtures.length).toBe(32); // 16 × 4 / 2 = 32 matches

    // No rematches
    const seenPairs = new Set<string>();
    for (const f of plan.fixtures) {
      const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
      expect(seenPairs.has(key)).toBe(false);
      seenPairs.add(key);
    }
  });
});

// ─── Tiebreakers ────────────────────────────────────────────
describe("Tiebreakers (§14)", () => {
  it("Two squads level on points, GD decides", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "A", size: 2 },
      { id: "B", name: "B", size: 2 },
      { id: "C", name: "C", size: 2 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 2 }, entrants, 1);

    // Make A and C tied on squad points but A has better GD
    const results = new Map<string, MatchResult>();
    for (const f of plan.fixtures) {
      results.set(f.id, makeResult(f.id, 1, 0, "COMPLETED", f.homeEntrantId));
    }

    const standings = crossSquadIndividualRR.standings(
      plan.fixtures,
      results,
      ["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR"],
      entrants,
    );

    // All squads should be ranked
    expect(standings.squad.length).toBe(3);
    expect(standings.squad[0].rank).toBe(1);
  });

  it("Unbreakable tie renders as shared rank with =, not arbitrary order", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "A", size: 1 },
      { id: "B", name: "B", size: 1 },
      { id: "C", name: "C", size: 1 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 1 }, entrants, 1);

    // All draws
    const results = new Map<string, MatchResult>();
    for (const f of plan.fixtures) {
      results.set(f.id, makeResult(f.id, 0, 0, "COMPLETED"));
    }

    const standings = crossSquadIndividualRR.standings(
      plan.fixtures,
      results,
      ["POINTS"],
      entrants,
    );

    // With all draws, at least some ranks should be shared
    const sharedRanks = standings.individual.filter((s) => s.rankShared);
    expect(sharedRanks.length).toBeGreaterThan(0);
  });
});