// ─── Format Engine Types (§6) ───────────────────────────────
// Pure, side-effect-free types. No database imports.

export type FormatKey =
  | "SINGLE_ELIMINATION"
  | "DOUBLE_ELIMINATION"
  | "ROUND_ROBIN"
  | "GROUPS_KNOCKOUT"
  | "SWISS"
  | "CROSS_SQUAD_INDIVIDUAL_RR";

export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "AWAITING_RESULT"
  | "COMPLETED"
  | "FORFEIT_HOME"
  | "FORFEIT_AWAY"
  | "VOID"
  | "DISPUTED";

export interface Entrant {
  id: string;
  name: string;
  squadId?: string;
  seed?: number;
  rating?: number;
}

export interface Fixture {
  id: string;
  homeEntrantId: string;
  awayEntrantId: string;
  homeSquadId?: string;
  awaySquadId?: string;
  gameweek?: number;
  bracketRound?: number;
  bracketSlot?: number;
  stageIndex?: number;
  groupId?: string;
}

export interface MatchResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  winnerId?: string;
  forfeitDefaultScore?: string; // e.g. "3-0"
}

export interface TournamentPlan {
  stages: StagePlan[];
  gameweeks: GameweekPlan[];
  fixtures: Fixture[];
  totalMatches: number;
}

export interface StagePlan {
  kind: string;
  position: number;
  config: unknown;
}

export interface GameweekPlan {
  number: number;
  label?: string;
  matchIds: string[];
}

export interface EngineState {
  tournamentId: string;
  formatKey: FormatKey;
  entrants: Entrant[];
  fixtures: Fixture[];
  results: Map<string, MatchResult>;
  stage: string; // DRAFT | REGISTRATION_OPEN | LIVE | COMPLETED etc.
  /** The tournament's formatConfig, needed by formats whose fixtures are
   *  generated incrementally (e.g. Swiss round count) rather than entirely
   *  up front in plan(). Opaque to the engine barrel — each adapter casts it. */
  formatConfig?: unknown;
}

export type TiebreakerRule =
  | "POINTS"
  | "GOAL_DIFFERENCE"
  | "GOALS_FOR"
  | "GOALS_AGAINST_ASC"
  | "HEAD_TO_HEAD_POINTS"
  | "HEAD_TO_HEAD_GD"
  | "WINS"
  | "WIN_PERCENTAGE"
  | "MATCHES_PLAYED_ASC"
  | "BUCHHOLZ"
  | "DISCIPLINE"
  | "MANUAL_OVERRIDE"
  | "COIN_TOSS";

export interface StandingRow {
  entityId: string; // userId or squadId
  entityName: string;
  squadId?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
  rankShared: boolean;
  tiebreakTrace: TiebreakStep[];
}

export interface TiebreakStep {
  rule: TiebreakerRule;
  applied: boolean;
  result: string;
}

export interface StandingsSet {
  squad: StandingRow[];
  individual: StandingRow[];
}

export interface PointsConfig {
  win: number;
  draw: number;
  loss: number;
}

export const DEFAULT_POINTS: PointsConfig = { win: 3, draw: 1, loss: 0 };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EngineMutation {
  type: "ADD_STAGE" | "ADD_FIXTURES" | "REMOVE_FIXTURES" | "UPDATE_RESULT" | "COMPLETE_STAGE";
  payload: unknown;
}

// ─── Format Adapter Interface (§6) ─────────────────────────
export interface FormatAdapter<C = unknown> {
  key: FormatKey;
  validate(config: C, entrants: Entrant[]): ValidationResult;
  plan(config: C, entrants: Entrant[], seed?: number): TournamentPlan;
  /** Bracket progression: given a newly-entered result, returns the mutations
   *  needed to advance winners/losers into downstream fixtures. Pure — the
   *  caller (a service, or a test) is responsible for applying the mutations. */
  onResult(state: EngineState, result: MatchResult): EngineMutation[];
  standings(
    fixtures: Fixture[],
    results: Map<string, MatchResult>,
    rules: TiebreakerRule[],
    entrants: Entrant[],
    pointsConfig?: PointsConfig,
  ): StandingsSet;
  isComplete(state: EngineState): boolean;
}