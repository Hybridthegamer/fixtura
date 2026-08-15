"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/config";
import { assertCan, AuthError, type Role } from "@/lib/auth/roles";
import { getFormatAdapter } from "@/lib/engine";
import type { Entrant, Fixture, MatchResult, MatchStatus, TiebreakerRule, StandingRow } from "@/lib/engine/types";

const enterResultInput = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0).max(999),
  awayScore: z.number().int().min(0).max(999),
  tournamentSlug: z.string().min(1),
});

export async function enterResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  tournamentSlug: string,
) {
  const parsed = enterResultInput.safeParse({ matchId, homeScore, awayScore, tournamentSlug });
  if (!parsed.success) return { error: "Invalid result input." };

  // Server Actions are public HTTP endpoints (§11) — auth guard first.
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { error: "Match not found." };
  if (!match.tournamentId) return { error: "Match has no tournament." };

  const tournament = await prisma.tournament.findUnique({ where: { id: match.tournamentId } });
  if (!tournament) return { error: "Tournament not found." };
  if (tournament.slug !== tournamentSlug) return { error: "Match does not belong to this tournament." };

  // Tenancy guard: re-derive the actor's role from the DB, scoped to the
  // tournament's organization — never trust a client-supplied role.
  const membership = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: tournament.orgId, userId: session.user.id } },
  });

  try {
    assertCan(
      { userId: session.user.id, role: (membership?.role as Role) ?? "PLAYER", orgId: membership?.orgId },
      "results:enter",
      tournament.orgId,
    );
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }

  let winnerId: string | null = null;
  const status = "COMPLETED";
  if (homeScore > awayScore) winnerId = match.homeUserId;
  else if (awayScore > homeScore) winnerId = match.awayUserId;

  const before = {
    homeScore: match.homeScore, awayScore: match.awayScore,
    winnerUserId: match.winnerUserId, status: match.status,
  };

  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore, awayScore,
        winnerUserId: winnerId,
        status,
        enteredById: session.user.id,
        editedCount: match.editedCount + 1,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: session.user.id,
        orgId: tournament.orgId,
        tournamentId: tournament.id,
        entity: "Match",
        entityId: matchId,
        action: match.status === "SCHEDULED" ? "RESULT_ENTERED" : "RESULT_EDITED",
        before: JSON.stringify(before),
        after: JSON.stringify({ homeScore, awayScore, winnerUserId: winnerId, status }),
        ip: (await headers()).get("x-forwarded-for"),
      },
    }),
  ]);

  await recomputeAllStandings(match.tournamentId);

  revalidatePath(`/t/${tournamentSlug}`);
  revalidatePath(`/manage/${tournamentSlug}/results`);

  return { success: true };
}

/**
 * Recomputes and materializes standings by delegating to the format
 * engine's own standings() (§6.7) — the same pure, tested function every
 * format's acceptance tests run against — rather than re-deriving the
 * scoring logic in the DB layer. Squad and individual tables each get
 * their own configured tiebreaker cascade (§6.7), computed via two calls
 * since a single adapter call applies one rule list to both scopes.
 *
 * Exported as the admin escape hatch §6.7 calls for: "Keep a
 * recomputeAllStandings(tournamentId) admin action as the escape hatch."
 */
export async function recomputeAllStandings(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;

  const adapter = getFormatAdapter(tournament.formatKey);
  if (!adapter) return;

  const [matches, registrations, gameweeks] = await Promise.all([
    prisma.match.findMany({ where: { tournamentId } }),
    prisma.registration.findMany({
      where: { tournamentId, status: { in: ["PAID", "CONFIRMED", "PAID_PENDING_APPROVAL"] } },
    }),
    prisma.gameweek.findMany({ where: { tournamentId } }),
  ]);

  const gwNumberById = new Map(gameweeks.map((g) => [g.id, g.number]));

  const entrants: Entrant[] = registrations.map((r) => ({
    id: r.userId,
    name: r.gamertag,
    squadId: r.squadId ?? undefined,
  }));

  const fixtures: Fixture[] = matches.map((m) => ({
    id: m.id,
    homeEntrantId: m.homeUserId ?? "",
    awayEntrantId: m.awayUserId ?? "",
    homeSquadId: m.homeSquadId ?? undefined,
    awaySquadId: m.awaySquadId ?? undefined,
    gameweek: m.gameweekId ? gwNumberById.get(m.gameweekId) : undefined,
    bracketRound: m.bracketRound ?? undefined,
    bracketSlot: m.bracketSlot ?? undefined,
    groupId: m.groupId ?? undefined,
  }));

  const results = new Map<string, MatchResult>();
  for (const m of matches) {
    if (m.status === "SCHEDULED" || m.status === "LIVE" || m.status === "AWAITING_RESULT") continue;
    results.set(m.id, {
      matchId: m.id,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      status: m.status as MatchStatus,
      winnerId: m.winnerUserId ?? undefined,
    });
  }

  const pointsConfig = { win: tournament.pointsWin, draw: tournament.pointsDraw, loss: tournament.pointsLoss };
  const tiebreakersSquad = JSON.parse(tournament.tiebreakersSquad) as TiebreakerRule[];
  const tiebreakersIndividual = JSON.parse(tournament.tiebreakersIndividual) as TiebreakerRule[];

  const squadRows = adapter.standings(fixtures, results, tiebreakersSquad, entrants, pointsConfig).squad;
  const individualRows = adapter.standings(fixtures, results, tiebreakersIndividual, entrants, pointsConfig).individual;

  const rowToStanding = (row: StandingRow, scope: "SQUAD" | "INDIVIDUAL") => ({
    tournamentId,
    scope,
    squadId: scope === "SQUAD" ? row.entityId : row.squadId,
    userId: scope === "INDIVIDUAL" ? row.entityId : undefined,
    played: row.played, won: row.won, drawn: row.drawn, lost: row.lost,
    goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, goalDiff: row.goalDiff,
    points: row.points, rank: row.rank, rankShared: row.rankShared,
    tiebreakTrace: JSON.stringify(row.tiebreakTrace),
  });

  const standings = [
    ...squadRows.map((r) => rowToStanding(r, "SQUAD")),
    ...individualRows.map((r) => rowToStanding(r, "INDIVIDUAL")),
  ];

  await prisma.$transaction([
    prisma.standing.deleteMany({ where: { tournamentId } }),
    ...(standings.length > 0 ? [prisma.standing.createMany({ data: standings })] : []),
    prisma.tournament.update({
      where: { id: tournamentId },
      data: { standingsVersion: { increment: 1 } },
    }),
  ]);
}