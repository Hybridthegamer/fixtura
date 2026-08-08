// ─── Tournament Data Access ─────────────────────────────────
import { prisma } from "@/lib/db";
import { cache } from "react";

export const getTournament = cache(async (slug: string) => {
  return prisma.tournament.findUnique({
    where: { slug },
    include: {
      organization: { select: { id: true, slug: true, name: true, logoUrl: true, verificationTier: true } },
      squads: { include: { members: { include: { user: { select: { id: true, displayName: true, handle: true } } } } } },
      registrations: {
        where: { status: { in: ["PAID", "CONFIRMED", "PAID_PENDING_APPROVAL"] } },
        include: { user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
      },
      matches: {
        orderBy: { createdAt: "asc" },
      },
      gameweeks: {
        orderBy: { number: "asc" },
      },
      standings: {
        orderBy: [{ rank: "asc" }, { points: "desc" }],
      },
      awards: true,
    },
  });
});

export type TournamentData = NonNullable<Awaited<ReturnType<typeof getTournament>>>;