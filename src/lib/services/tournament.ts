// ─── Tournament Data Access ─────────────────────────────────
import { prisma } from "@/lib/db";
import { cache } from "react";

export async function getTournament(slug: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
  });
  if (!tournament) return null;

  const [organization, squads, registrations, matches, gameweeks, standings, awards] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: tournament.orgId } }),
      prisma.squad.findMany({ where: { tournamentId: tournament.id } }),
      prisma.registration.findMany({
        where: {
          tournamentId: tournament.id,
          status: { in: ["PAID", "CONFIRMED", "PAID_PENDING_APPROVAL"] },
        },
      }),
      prisma.match.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { createdAt: "asc" as const },
      }),
      prisma.gameweek.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { number: "asc" as const },
      }),
      prisma.standing.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ rank: "asc" as const }, { points: "desc" as const }],
      }),
      prisma.award.findMany({ where: { tournamentId: tournament.id } }),
    ]);

  return {
    ...tournament,
    organization: organization!,
    squads,
    registrations,
    matches,
    gameweeks,
    standings,
    awards,
  };
}

export const getCachedTournament = cache(getTournament);

export type TournamentData = NonNullable<Awaited<ReturnType<typeof getTournament>>>;