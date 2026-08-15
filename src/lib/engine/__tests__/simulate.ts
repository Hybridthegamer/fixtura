// ─── Test-only bracket simulation harness ───────────────────
// Plays out a full elimination-style tournament plan by repeatedly asking
// the adapter which fixtures are ready, assigning random scores, and
// applying onResult() mutations — used to empirically verify bracket
// progression invariants (no rematches, no elimination before 2 losses)
// across many random outcomes.
import type { Entrant, Fixture, MatchResult, FormatAdapter, EngineState } from "../types";
import { applyMutations, mulberry32 } from "../bracket";

export function simulateElimination(
  adapter: FormatAdapter<unknown>,
  entrants: Entrant[],
  config: unknown,
  planSeed: number,
  rngSeed: number,
  maxIterations = 500,
): { fixtures: Fixture[]; results: Map<string, MatchResult> } {
  const plan = adapter.plan(config, entrants, planSeed);
  let fixtures = plan.fixtures;
  const results = new Map<string, MatchResult>();
  const rng = mulberry32(rngSeed);

  for (let iter = 0; iter < maxIterations; iter++) {
    const playable = fixtures.filter(
      (f) => f.homeEntrantId && f.awayEntrantId && !results.has(f.id),
    );
    if (playable.length === 0) break;

    for (const f of playable) {
      const homeWins = rng() > 0.5;
      const result: MatchResult = {
        matchId: f.id,
        homeScore: homeWins ? 1 : 0,
        awayScore: homeWins ? 0 : 1,
        status: "COMPLETED",
        winnerId: homeWins ? f.homeEntrantId : f.awayEntrantId,
      };
      results.set(f.id, result);

      const state: EngineState = {
        tournamentId: "t1",
        formatKey: adapter.key,
        entrants,
        fixtures,
        results,
        stage: "LIVE",
        formatConfig: config,
      };
      const mutations = adapter.onResult(state, result);
      fixtures = applyMutations(fixtures, mutations);
    }
  }

  return { fixtures, results };
}
