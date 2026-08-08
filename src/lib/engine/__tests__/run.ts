// ─── Direct engine test runner (no framework dependency) ─────
// Run with: npx tsx --tsconfig tsconfig.json src/lib/engine/__tests__/run.ts

import {
  crossSquadIndividualRR,
  roundRobin,
  singleElimination,
  doubleElimination,
  groupsKnockout,
  swiss,
} from "../index";
import type { Entrant, MatchResult } from "../types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

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
      entrants.push({ id: `${s.id}_P${i}`, name: `${s.name} P${i}`, squadId: s.id });
    }
  }
  return entrants;
}

function makeResult(matchId: string, homeScore: number, awayScore: number, status = "COMPLETED", winnerId?: string): MatchResult {
  return { matchId, homeScore, awayScore, status: status as MatchResult["status"], winnerId };
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ CROSS-SQUAD INDIVIDUAL RR (§14) ═══");

{
  const entrants = makeSquadEntrants([
    { id: "L100", name: "Level 100", size: 5 },
    { id: "L200", name: "Level 200", size: 5 },
    { id: "L300", name: "Level 300", size: 5 },
    { id: "L400", name: "Level 400", size: 5 },
  ]);

  const plan = crossSquadIndividualRR.plan({ squadSize: 5, matchupsPerGameweek: 2 }, entrants, 42);
  assert(plan.totalMatches === 150, `S=4 P=5: totalMatches = ${plan.totalMatches} (expected 150)`);
  assert(plan.fixtures.length === 150, `S=4 P=5: fixtures.length = ${plan.fixtures.length} (expected 150)`);

  const playerCounts = new Map<string, number>();
  for (const f of plan.fixtures) {
    playerCounts.set(f.homeEntrantId, (playerCounts.get(f.homeEntrantId) ?? 0) + 1);
    playerCounts.set(f.awayEntrantId, (playerCounts.get(f.awayEntrantId) ?? 0) + 1);
  }
  let all15 = true;
  for (const [id, count] of playerCounts) {
    if (count !== 15) { all15 = false; console.error(`  ${id}: ${count} matches (expected 15)`); }
  }
  assert(all15, "Each player plays exactly 15 matches");

  // Zero same-squad pairings
  let noSameSquad = true;
  for (const f of plan.fixtures) {
    if (f.homeSquadId === f.awaySquadId) { noSameSquad = false; break; }
  }
  assert(noSameSquad, "Zero same-squad pairings");

  // Every cross pair appears exactly once
  const pairs = new Set<string>();
  for (const f of plan.fixtures) {
    const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
    if (pairs.has(key)) { console.error(`  Duplicate pair: ${key}`); }
    pairs.add(key);
  }
  assert(pairs.size === 150, `Unique pairs: ${pairs.size} (expected 150)`);
}

{
  const entrants = makeSquadEntrants([
    { id: "A", name: "A", size: 4 },
    { id: "B", name: "B", size: 4 },
    { id: "C", name: "C", size: 4 },
  ]);
  const plan = crossSquadIndividualRR.plan({ squadSize: 4 }, entrants, 7);
  assert(plan.totalMatches === 48, `S=3 P=4: totalMatches = ${plan.totalMatches} (expected 48)`);
}

{
  const entrants = makeSquadEntrants([
    { id: "X", name: "X", size: 3 },
    { id: "Y", name: "Y", size: 3 },
    { id: "Z", name: "Z", size: 3 },
    { id: "W", name: "W", size: 3 },
    { id: "V", name: "V", size: 3 },
  ]);
  const plan = crossSquadIndividualRR.plan({ squadSize: 3 }, entrants, 13);
  assert(plan.totalMatches === 90, `S=5 P=3: totalMatches = ${plan.totalMatches} (expected 90)`);
}

// Dual attribution test
{
  const entrants = makeSquadEntrants([
    { id: "A", name: "A", size: 2 },
    { id: "B", name: "B", size: 2 },
    { id: "C", name: "C", size: 2 },
  ]);
  const plan = crossSquadIndividualRR.plan({ squadSize: 2 }, entrants, 1);
  const results = new Map<string, MatchResult>();

  const m1 = plan.fixtures.find((f) => f.homeEntrantId === "A_P1" && f.awayEntrantId === "B_P1")!;
  results.set(m1.id, makeResult(m1.id, 3, 1, "COMPLETED", "A_P1"));

  const standings = crossSquadIndividualRR.standings(plan.fixtures, results, ["POINTS"], entrants);

  const ap1 = standings.individual.find((s) => s.entityId === "A_P1")!;
  assert(ap1.played === 1 && ap1.won === 1 && ap1.goalsFor === 3 && ap1.points === 3,
    `Dual attribution A_P1: P${ap1.played} W${ap1.won} GF${ap1.goalsFor} Pts${ap1.points}`);

  const squadA = standings.squad.find((s) => s.entityId === "A")!;
  assert(squadA.played === 1 && squadA.goalsFor === 3 && squadA.points === 3,
    `Squad A attribution: P${squadA.played} GF${squadA.goalsFor} Pts${squadA.points}`);
}

// Reverse result test
{
  const entrants = makeSquadEntrants([
    { id: "A", name: "A", size: 2 },
    { id: "B", name: "B", size: 2 },
    { id: "C", name: "C", size: 2 },
  ]);
  const plan = crossSquadIndividualRR.plan({ squadSize: 2 }, entrants, 1);
  const m1 = plan.fixtures.find((f) => f.homeEntrantId === "A_P1" && f.awayEntrantId === "B_P1")!;

  const r1 = new Map<string, MatchResult>();
  r1.set(m1.id, makeResult(m1.id, 3, 1, "COMPLETED", "A_P1"));
  const s1 = crossSquadIndividualRR.standings(plan.fixtures, r1, ["POINTS"], entrants);

  const r2 = new Map<string, MatchResult>();
  r2.set(m1.id, makeResult(m1.id, 1, 3, "COMPLETED", "B_P1"));
  const s2 = crossSquadIndividualRR.standings(plan.fixtures, r2, ["POINTS"], entrants);

  const ap1Before = s1.individual.find((s) => s.entityId === "A_P1")!;
  const ap1After = s2.individual.find((s) => s.entityId === "A_P1")!;
  assert(ap1Before.points === 3 && ap1After.points === 0,
    `Reverse result: A_P1 before=${ap1Before.points}pts after=${ap1After.points}pts`);
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ ROUND ROBIN (§14) ═══");

{
  const entrants = makeEntrants(8);
  const plan = roundRobin.plan({}, entrants);
  assert(plan.totalMatches === 28, `n=8: ${plan.totalMatches} matches (expected 28)`);

  const counts = new Map<string, number>();
  for (const f of plan.fixtures) {
    counts.set(f.homeEntrantId, (counts.get(f.homeEntrantId) ?? 0) + 1);
    counts.set(f.awayEntrantId, (counts.get(f.awayEntrantId) ?? 0) + 1);
  }
  let all7 = true;
  for (const [_, c] of counts) { if (c !== 7) all7 = false; }
  assert(all7, "Each entrant plays exactly 7 matches");

  const pairs = new Set<string>();
  for (const f of plan.fixtures) {
    const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
    if (pairs.has(key)) console.error(`  Rematch: ${key}`);
    pairs.add(key);
  }
  assert(pairs.size === 28, "No rematches");
}

{
  const entrants = makeEntrants(7);
  const plan = roundRobin.plan({}, entrants);
  assert(plan.totalMatches === 21, `n=7: ${plan.totalMatches} matches (expected 21)`);
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ SINGLE ELIMINATION (§14) ═══");

{
  const entrants = makeEntrants(16);
  const plan = singleElimination.plan({}, entrants);
  const rounds = new Set(plan.fixtures.map((f) => f.bracketRound));
  assert(rounds.size === 4, `n=16: ${rounds.size} rounds (expected 4)`);
}

{
  const entrants = makeEntrants(8);
  const with3pp = singleElimination.plan({ thirdPlacePlayoff: true }, entrants);
  const without3pp = singleElimination.plan({ thirdPlacePlayoff: false }, entrants);
  assert(with3pp.fixtures.length > without3pp.fixtures.length, "Third-place playoff adds extra fixture");
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ DOUBLE ELIMINATION (§14) ═══");

{
  const entrants = makeEntrants(8);
  const noReset = doubleElimination.plan({ bracketReset: false }, entrants);
  const withReset = doubleElimination.plan({ bracketReset: true }, entrants);
  assert(noReset.fixtures.length >= 14, `n=8 (no reset): ${noReset.fixtures.length} fixtures (expected ≥14)`);
  assert(withReset.fixtures.length === noReset.fixtures.length + 1, "Bracket reset adds 1 fixture");
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ GROUPS → KNOCKOUT (§14) ═══");

{
  const entrants = makeEntrants(16);
  const plan = groupsKnockout.plan({ groups: 4, advance: 2 }, entrants);
  assert(plan.totalMatches >= 24, `16 entrants, 4 groups of 4: ${plan.totalMatches} matches (expected ≥24)`);
}

// ═══════════════════════════════════════════════════════════════
console.log("\n═══ SWISS (§14) ═══");

{
  const entrants = makeEntrants(16);
  const plan = swiss.plan({ rounds: 4 }, entrants, 42);
  assert(plan.fixtures.length === 32, `n=16, 4 rounds: ${plan.fixtures.length} fixtures (expected 32)`);

  const seenPairs = new Set<string>();
  let noRematches = true;
  for (const f of plan.fixtures) {
    const key = [f.homeEntrantId, f.awayEntrantId].sort().join("|");
    if (seenPairs.has(key)) { noRematches = false; break; }
    seenPairs.add(key);
  }
  assert(noRematches, "No rematches in Swiss");
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n\n${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);