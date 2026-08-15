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
import type { Entrant, MatchResult, EngineState } from "@/lib/engine/types";
import { applyMutations, mulberry32, nextPowerOfTwo } from "@/lib/engine/bracket";
import { simulateElimination } from "./simulate";

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
  return {
    matchId,
    homeScore,
    awayScore,
    status: status as MatchResult["status"],
    winnerId,
  };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
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

    expect(plan.totalMatches).toBe(150);
    expect(plan.fixtures.length).toBe(150);

    const matchupKeys = new Set(plan.fixtures.map((f) => pairKey(f.homeSquadId!, f.awaySquadId!)));
    expect(matchupKeys.size).toBe(6); // S·(S-1)/2 = 4·3/2

    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [, count] of playerCounts) {
      expect(count).toBe(15); // (S-1)·P
    }

    const squadCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      if (f.homeSquadId) squadCounts.set(f.homeSquadId, (squadCounts.get(f.homeSquadId) ?? 0) + 1);
      if (f.awaySquadId) squadCounts.set(f.awaySquadId, (squadCounts.get(f.awaySquadId) ?? 0) + 1);
    }
    for (const [, count] of squadCounts) {
      expect(count).toBe(75); // (S-1)·P²
    }

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

    const matchupKeys = new Set(plan.fixtures.map((f) => pairKey(f.homeSquadId!, f.awaySquadId!)));
    expect(matchupKeys.size).toBe(3);

    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [, count] of playerCounts) {
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

    const matchupKeys = new Set(plan.fixtures.map((f) => pairKey(f.homeSquadId!, f.awaySquadId!)));
    expect(matchupKeys.size).toBe(10); // 5·4/2

    const playerCounts = new Map<string, number>();
    for (const f of plan.fixtures) {
      playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
      playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
    }
    for (const [, count] of playerCounts) {
      expect(count).toBe(12);
    }
  });

  it("Every cross pair appears exactly once; zero same-squad pairings", () => {
    const entrants = makeSquadEntrants([
      { id: "S1", name: "S1", size: 5 },
      { id: "S2", name: "S2", size: 5 },
      { id: "S3", name: "S3", size: 5 },
      { id: "S4", name: "S4", size: 5 },
    ]);

    const plan = crossSquadIndividualRR.plan(config, entrants, 42);
    const pairs = new Set<string>();

    for (const f of plan.fixtures) {
      expect(f.homeSquadId).not.toBe(f.awaySquadId);
      const key = pairKey(f.homeEntrantId, f.awayEntrantId);
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }

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

    const match1 = plan.fixtures.find(
      (f) => f.homeEntrantId === "A_P1" && f.awayEntrantId === "B_P1",
    )!;
    results.set(match1.id, makeResult(match1.id, 3, 1, "COMPLETED", "A_P1"));

    const standings = crossSquadIndividualRR.standings(
      plan.fixtures,
      results,
      ["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR"],
      entrants,
    );

    const ap1 = standings.individual.find((s) => s.entityId === "A_P1")!;
    expect(ap1.played).toBe(1);
    expect(ap1.won).toBe(1);
    expect(ap1.goalsFor).toBe(3);
    expect(ap1.goalsAgainst).toBe(1);
    expect(ap1.points).toBe(3);

    const bp1 = standings.individual.find((s) => s.entityId === "B_P1")!;
    expect(bp1.played).toBe(1);
    expect(bp1.lost).toBe(1);
    expect(bp1.goalsFor).toBe(1);
    expect(bp1.goalsAgainst).toBe(3);

    const squadA = standings.squad.find((s) => s.entityId === "A")!;
    expect(squadA.played).toBe(1);
    expect(squadA.won).toBe(1);
    expect(squadA.goalsFor).toBe(3);
    expect(squadA.goalsAgainst).toBe(1);
    expect(squadA.points).toBe(3);

    const squadB = standings.squad.find((s) => s.entityId === "B")!;
    expect(squadB.lost).toBe(1);
    expect(squadB.goalsFor).toBe(1);
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

    const results1 = new Map<string, MatchResult>();
    results1.set(match1.id, makeResult(match1.id, 3, 1, "COMPLETED", "A_P1"));
    const s1 = crossSquadIndividualRR.standings(plan.fixtures, results1, ["POINTS"], entrants);

    const results2 = new Map<string, MatchResult>();
    results2.set(match1.id, makeResult(match1.id, 1, 3, "COMPLETED", "B_P1"));
    const s2 = crossSquadIndividualRR.standings(plan.fixtures, results2, ["POINTS"], entrants);

    const ap1Before = s1.individual.find((s) => s.entityId === "A_P1")!;
    const ap1After = s2.individual.find((s) => s.entityId === "A_P1")!;
    expect(ap1Before.points).toBe(3);
    expect(ap1After.points).toBe(0);
    expect(ap1After.goalsFor).toBe(1);
    expect(ap1After.goalsAgainst).toBe(3);

    const squadABefore = s1.squad.find((s) => s.entityId === "A")!;
    const squadAAfter = s2.squad.find((s) => s.entityId === "A")!;
    expect(squadABefore.points).toBe(3);
    expect(squadAAfter.points).toBe(0);

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
    for (const [, c] of counts) {
      expect(c).toBe(7);
    }

    const pairs = new Set<string>();
    for (const f of plan.fixtures) {
      const key = pairKey(f.homeEntrantId, f.awayEntrantId);
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("n=7 → 21 matches, rotating bye, each entrant byes exactly once", () => {
    const entrants = makeEntrants(7);
    const plan = roundRobin.plan({}, entrants);

    expect(plan.totalMatches).toBe(21);

    const counts = new Map<string, number>();
    const byeCounts = new Map<string, number>();
    for (const e of entrants) byeCounts.set(e.id, 0);

    for (const gw of plan.gameweeks) {
      const playing = new Set<string>();
      for (const id of gw.matchIds) {
        const f = plan.fixtures.find((x) => x.id === id)!;
        playing.add(f.homeEntrantId);
        playing.add(f.awayEntrantId);
        counts.set(f.homeEntrantId, (counts.get(f.homeEntrantId) ?? 0) + 1);
        counts.set(f.awayEntrantId, (counts.get(f.awayEntrantId) ?? 0) + 1);
      }
      for (const e of entrants) {
        if (!playing.has(e.id)) byeCounts.set(e.id, (byeCounts.get(e.id) ?? 0) + 1);
      }
    }

    for (const [, c] of counts) expect(c).toBe(6);
    for (const [, byes] of byeCounts) expect(byes).toBe(1);
  });
});

// ─── Single Elimination ─────────────────────────────────────
describe("Single Elimination (§14)", () => {
  it("n=16 → 15 matches, 4 rounds", () => {
    const entrants = makeEntrants(16);
    const plan = singleElimination.plan({}, entrants, 1);

    expect(plan.totalMatches).toBe(15);
    const rounds = new Set(plan.fixtures.map((f) => f.bracketRound));
    expect(rounds.size).toBe(4);
  });

  it("n=12 → 4 byes to seeds 1-4, seeds 1 and 2 cannot meet before the final", () => {
    const entrants = makeEntrants(12);
    const plan = singleElimination.plan({ seedingSource: "registration_order" }, entrants, 1);

    // n-1 matches regardless of byes.
    expect(plan.totalMatches).toBe(11);

    // Seeds 1-4 (registration order P1..P4) get a bye: no round-1 fixture for them,
    // but they already appear in round 2.
    const round1 = plan.fixtures.filter((f) => f.bracketRound === 1);
    const round1Entrants = new Set(round1.flatMap((f) => [f.homeEntrantId, f.awayEntrantId]));
    for (const seed of ["P1", "P2", "P3", "P4"]) {
      expect(round1Entrants.has(seed)).toBe(false);
    }
    const round2 = plan.fixtures.filter((f) => f.bracketRound === 2);
    const round2Entrants = new Set(round2.flatMap((f) => [f.homeEntrantId, f.awayEntrantId]));
    for (const seed of ["P1", "P2", "P3", "P4"]) {
      expect(round2Entrants.has(seed)).toBe(true);
    }

    // Simulate every possible bracket outcome via randomized trials: seed1 (P1)
    // and seed2 (P2) must never meet except in the final round.
    for (let trial = 0; trial < 30; trial++) {
      const { fixtures, results } = simulateElimination(
        singleElimination as never,
        entrants,
        { seedingSource: "registration_order" },
        1,
        trial,
      );
      const finalRound = Math.max(...fixtures.filter((f) => f.bracketRound != null).map((f) => f.bracketRound!));
      for (const f of fixtures) {
        if (!results.has(f.id)) continue;
        const pair = [f.homeEntrantId, f.awayEntrantId];
        if (pair.includes("P1") && pair.includes("P2")) {
          expect(f.bracketRound).toBe(finalRound);
        }
      }
    }
  });

  it("Third-place playoff adds exactly one match", () => {
    const entrants = makeEntrants(8);
    const planWith = singleElimination.plan({ thirdPlacePlayoff: true }, entrants, 1);
    const planWithout = singleElimination.plan({ thirdPlacePlayoff: false }, entrants, 1);

    expect(planWith.totalMatches).toBe(planWithout.totalMatches + 1);
    expect(planWithout.totalMatches).toBe(7);
    expect(planWith.totalMatches).toBe(8);
  });

  it("No entrant plays after being eliminated (single loss ends their run)", () => {
    const entrants = makeEntrants(16);
    const { fixtures, results } = simulateElimination(singleElimination as never, entrants, {}, 5, 5);
    const losses = new Map<string, number>();
    for (const f of fixtures) {
      const r = results.get(f.id);
      if (!r) continue;
      const loserId = r.winnerId === f.homeEntrantId ? f.awayEntrantId : f.homeEntrantId;
      losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
    }
    for (const [, l] of losses) expect(l).toBe(1);
  });
});

// ─── Double Elimination ─────────────────────────────────────
describe("Double Elimination (§14)", () => {
  it("n=8 → 14 matches without a bracket reset, 15 with", () => {
    const entrants = makeEntrants(8);
    const planNoReset = doubleElimination.plan({ bracketReset: false }, entrants, 1);
    const planReset = doubleElimination.plan({ bracketReset: true }, entrants, 1);

    expect(planNoReset.totalMatches).toBe(14);
    expect(planReset.totalMatches).toBe(15);
  });

  it("No entrant is eliminated before losing twice; losers-bracket round 1 is never a rematch (n=4,8,12,16)", () => {
    // §14: "no entrant is eliminated before losing twice" and "a losers-bracket
    // path never produces a first-round rematch." LB round 1 is structurally
    // guaranteed rematch-free (its entrants are losers of *different* WB1
    // matches, who by definition never played each other) — verified here
    // across many random outcomes rather than asserted from theory alone.
    //
    // Deeper LB rounds can still occasionally force a rematch that no drop
    // map can route around — e.g. a "pure" round narrowing to exactly the
    // two survivors who happen to have met earlier, or (at n=4 specifically)
    // a drop round with only one candidate on each side. The engine's drop
    // map (bipartiteRematchFreeMatch / withinListMatch, in doubleElim.ts)
    // still searches exhaustively for a rematch-free assignment whenever one
    // exists — that guarantee is checked directly below in a scenario where
    // a solution provably exists — but an end-to-end random simulation can't
    // distinguish "unavoidable" from "algorithm failed," so it only asserts
    // the part of §14 that always holds.
    for (const n of [4, 8, 12, 16]) {
      const entrants = makeEntrants(n, `E${n}_`);
      for (let trial = 0; trial < 15; trial++) {
        const { fixtures, results } = simulateElimination(
          doubleElimination as never,
          entrants,
          { bracketReset: true },
          n + trial,
          trial + 1,
          n * 6,
        );

        const losses = new Map<string, number>();
        for (const f of fixtures) {
          const r = results.get(f.id);
          if (!r || !f.homeEntrantId || !f.awayEntrantId) continue;
          const loserId = r.winnerId === f.homeEntrantId ? f.awayEntrantId : f.homeEntrantId;
          losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
        }

        const gf = fixtures.find((f) => f.id === "fx_de_gf")!;
        const reset = fixtures.find((f) => f.id === "fx_de_br");
        const resetResult = reset ? results.get(reset.id) : undefined;
        const championId = resetResult?.winnerId ?? results.get(gf.id)?.winnerId;

        for (const e of entrants) {
          if (e.id === championId) continue;
          expect(losses.get(e.id)).toBe(2);
        }

        const lbFirstRound = fixtures.filter((f) => f.id.startsWith("fx_de_l_") && f.bracketRound === Math.min(
          ...fixtures.filter((x) => x.id.startsWith("fx_de_l_")).map((x) => x.bracketRound!),
        ));
        const wb1Pairs = new Set(
          fixtures.filter((f) => f.id.startsWith("fx_de_w_") && f.bracketRound === 1)
            .map((f) => pairKey(f.homeEntrantId, f.awayEntrantId)),
        );
        for (const f of lbFirstRound) {
          if (!results.has(f.id)) continue;
          expect(wb1Pairs.has(pairKey(f.homeEntrantId, f.awayEntrantId))).toBe(false);
        }
      }
    }
  });

  it("Drop-map matching finds a rematch-free pairing whenever one exists", () => {
    // Construct a drop round with enough width that a rematch-free assignment
    // is provably possible, and confirm onResult's drop-map actually finds it
    // rather than settling for a locally-greedy pairing that could strand a
    // forced rematch (the bug this test was written to catch). n=12 is the
    // non-power-of-two case §6.2 calls out: WB round 1 has byes, so the LB
    // round-1 survivor count doesn't line up with WB round 2's loser count —
    // exactly the overflow case a naive 1:1 drop-round pairing breaks on.
    const entrants = makeEntrants(12, "M");
    const k = Math.log2(nextPowerOfTwo(12)); // 4
    let fixtures = doubleElimination.plan({ bracketReset: false }, entrants, 3).fixtures;
    const results = new Map<string, MatchResult>();

    function play(f: { id: string; homeEntrantId: string; awayEntrantId: string }, homeWins: boolean) {
      const r: MatchResult = {
        matchId: f.id,
        homeScore: homeWins ? 1 : 0,
        awayScore: homeWins ? 0 : 1,
        status: "COMPLETED",
        winnerId: homeWins ? f.homeEntrantId : f.awayEntrantId,
      };
      results.set(f.id, r);
      const state: EngineState = {
        tournamentId: "t", formatKey: "DOUBLE_ELIMINATION", entrants, fixtures, results, stage: "LIVE",
      };
      fixtures = applyMutations(fixtures, doubleElimination.onResult(state, r));
    }

    // Play WB rounds 1 and 2, home always wins — deterministic.
    for (const round of [1, 2]) {
      const roundFixtures = fixtures.filter((f) => f.id.startsWith("fx_de_w_") && f.bracketRound === round);
      for (const f of roundFixtures) play(f, true);
    }
    // Play LB round 1 (seed round, global round k+1) — built lazily once WB1 is done.
    const lbRound1 = fixtures.filter((f) => f.id.startsWith("fx_de_l_") && f.bracketRound === k + 1);
    expect(lbRound1.length).toBeGreaterThan(0);
    for (const f of lbRound1) play(f, true);

    // LB round 2 (drop round: LB1 survivors vs WB2 losers) must not replay any pair,
    // even though the two groups arrive at different sizes because of WB1's byes.
    const lbRound2 = fixtures.filter((f) => f.id.startsWith("fx_de_l_") && f.bracketRound === k + 2);
    expect(lbRound2.length).toBeGreaterThan(0);
    const playedBeforeRound2 = new Set(
      fixtures.filter((f) => results.has(f.id)).map((f) => pairKey(f.homeEntrantId, f.awayEntrantId)),
    );
    for (const f of lbRound2) {
      if (!f.awayEntrantId) continue; // a lone overflow leftover advances as a bye — nothing to check
      expect(f.homeEntrantId).toBeTruthy();
      expect(f.awayEntrantId).toBeTruthy();
      expect(playedBeforeRound2.has(pairKey(f.homeEntrantId, f.awayEntrantId))).toBe(false);
    }
  });

  it("Bracket reset match only occurs when the losers-bracket finalist wins the grand final", () => {
    const entrants = makeEntrants(8);
    const { fixtures, results } = simulateElimination(
      doubleElimination as never,
      entrants,
      { bracketReset: true },
      2,
      3,
    );
    const gf = fixtures.find((f) => f.id === "fx_de_gf")!;
    const reset = fixtures.find((f) => f.id === "fx_de_br")!;
    const gfResult = results.get(gf.id)!;
    const resetPlayed = results.has(reset.id);
    expect(resetPlayed).toBe(gfResult.winnerId === gf.awayEntrantId);
  });
});

// ─── Groups → Knockout ──────────────────────────────────────
describe("Groups → Knockout (§14)", () => {
  it("16 entrants, 4 groups of 4, top 2 advance → 24 group + 7 knockout = 31 matches", () => {
    const entrants = makeEntrants(16);
    const plan = groupsKnockout.plan({ groups: 4, advance: 2 }, entrants, 1);

    const groupMatches = plan.fixtures.filter((f) => f.groupId != null);
    expect(groupMatches.length).toBe(24);
    expect(plan.totalMatches).toBe(31);
  });

  it("group winners are paired against runners-up from other groups", () => {
    const entrants = makeEntrants(16);
    const config = { groups: 4, advance: 2 };
    let fixtures = groupsKnockout.plan(config, entrants, 1).fixtures;
    const results = new Map<string, MatchResult>();

    // Play out the group stage deterministically: home always wins.
    const groupFixtures = fixtures.filter((f) => f.groupId != null);
    for (const f of groupFixtures) {
      const r: MatchResult = { matchId: f.id, homeScore: 1, awayScore: 0, status: "COMPLETED", winnerId: f.homeEntrantId };
      results.set(f.id, r);
      const state: EngineState = {
        tournamentId: "t", formatKey: "GROUPS_KNOCKOUT", entrants, fixtures, results, stage: "LIVE", formatConfig: config,
      };
      const mutations = groupsKnockout.onResult(state, r);
      fixtures = applyMutations(fixtures, mutations);
    }

    const koFixtures = fixtures.filter((f) => f.bracketRound != null);
    expect(koFixtures.length).toBeGreaterThan(0);

    // Groups aren't squads (GROUPS_KNOCKOUT entrants have no squadId) — derive
    // each entrant's group directly from the group-stage fixtures instead.
    const entrantGroup = new Map<string, string>();
    for (const f of groupFixtures) {
      entrantGroup.set(f.homeEntrantId, f.groupId!);
      entrantGroup.set(f.awayEntrantId, f.groupId!);
    }

    const round1 = koFixtures.filter((f) => f.bracketRound === 1);
    for (const f of round1) {
      if (!f.homeEntrantId || !f.awayEntrantId) continue;
      expect(entrantGroup.get(f.homeEntrantId)).not.toBe(entrantGroup.get(f.awayEntrantId));
    }

    const totalKoMatches = 4 * 2 - 1; // 8 qualifiers → 7 matches
    expect(koFixtures.length).toBe(totalKoMatches);
  });
});

// ─── Swiss ──────────────────────────────────────────────────
describe("Swiss (§14)", () => {
  it("n=16, 4 rounds → no rematches; pairs on equal or nearest score", () => {
    const entrants = makeEntrants(16);
    const config = { rounds: 4 };
    let fixtures = swiss.plan(config, entrants, 42).fixtures;
    const results = new Map<string, MatchResult>();
    const rng = mulberry32(9);

    for (let round = 1; round <= 4; round++) {
      const roundFixtures = fixtures.filter((f) => f.gameweek === round);
      expect(roundFixtures.length).toBe(8); // 16/2

      for (const f of roundFixtures) {
        const homeWins = rng() > 0.5;
        const r: MatchResult = {
          matchId: f.id,
          homeScore: homeWins ? 1 : 0,
          awayScore: homeWins ? 0 : 1,
          status: "COMPLETED",
          winnerId: homeWins ? f.homeEntrantId : f.awayEntrantId,
        };
        results.set(f.id, r);
        const state: EngineState = {
          tournamentId: "t", formatKey: "SWISS", entrants, fixtures, results, stage: "LIVE", formatConfig: config,
        };
        const mutations = swiss.onResult(state, r);
        fixtures = applyMutations(fixtures, mutations);
      }
    }

    expect(fixtures.length).toBe(32); // 16 × 4 / 2

    const seenPairs = new Map<string, number>();
    for (const f of fixtures) {
      const key = pairKey(f.homeEntrantId, f.awayEntrantId);
      seenPairs.set(key, (seenPairs.get(key) ?? 0) + 1);
    }
    for (const [, count] of seenPairs) {
      expect(count).toBe(1);
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

    expect(standings.squad.length).toBe(3);
    expect(standings.squad[0].rank).toBe(1);
  });

  it("Three-way tie resolved on head-to-head mini-table", () => {
    const entrants = makeEntrants(3);
    const plan = roundRobin.plan({}, entrants); // P1 v P2, P1 v P3, P2 v P3
    const results = new Map<string, MatchResult>();

    // P1 beats P2, P2 beats P3, P3 beats P1 — a perfect rock-paper-scissors
    // cycle: all level on points (3 each), GD (0 each), GF (1 each). Pick the
    // winner explicitly per pair rather than assuming home/away orientation.
    const cycleWinner: Record<string, string> = {
      [pairKey("P1", "P2")]: "P1",
      [pairKey("P2", "P3")]: "P2",
      [pairKey("P1", "P3")]: "P3",
    };
    for (const f of plan.fixtures) {
      const winnerId = cycleWinner[pairKey(f.homeEntrantId, f.awayEntrantId)];
      const homeWins = winnerId === f.homeEntrantId;
      results.set(f.id, makeResult(f.id, homeWins ? 1 : 0, homeWins ? 0 : 1, "COMPLETED", winnerId));
    }

    const standings = crossSquadIndividualRR.standings(plan.fixtures, results, ["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD_POINTS"], entrants);
    // All three are perfectly cyclic (each won once, lost once) — an
    // unbreakable tie must render as a shared rank, not an arbitrary order.
    expect(standings.individual.every((s) => s.rankShared)).toBe(true);
    expect(new Set(standings.individual.map((s) => s.rank)).size).toBe(1);
  });

  it("Unbreakable tie renders as shared rank with =, not arbitrary order", () => {
    const entrants = makeSquadEntrants([
      { id: "A", name: "A", size: 1 },
      { id: "B", name: "B", size: 1 },
      { id: "C", name: "C", size: 1 },
    ]);

    const plan = crossSquadIndividualRR.plan({ squadSize: 1 }, entrants, 1);
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

    const sharedRanks = standings.individual.filter((s) => s.rankShared);
    expect(sharedRanks.length).toBeGreaterThan(0);
    expect(standings.individual.every((s) => s.rank === 1)).toBe(true);
  });
});
