"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function enterResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  tournamentSlug: string,
) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
  if (!match) return { error: "Match not found." };

  // Determine winner
  let winnerId: string | null = null;
  let status = "COMPLETED";
  if (homeScore > awayScore) winnerId = match.homeUserId;
  else if (awayScore > homeScore) winnerId = match.awayUserId;

  // Update match
  await prisma.match.update({
    where: { id: matchId },
    data: {
      homeScore,
      awayScore,
      winnerUserId: winnerId,
      status,
      editedCount: match.editedCount + 1,
    },
  });

  // Recompute standings (simplified — full recompute for now)
  await recomputeStandings(match.tournamentId);

  revalidatePath(`/t/${tournamentSlug}`);
  revalidatePath(`/manage/${tournamentSlug}/results`);

  return { success: true };
}

async function recomputeStandings(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });
  if (!tournament) return;

  const matches = await prisma.match.findMany({
    where: { tournamentId, status: { not: "SCHEDULED" } },
  });

  const PTS_WIN = tournament.pointsWin;
  const PTS_DRAW = tournament.pointsDraw;

  // Clear existing standings
  await prisma.standing.deleteMany({ where: { tournamentId } });

  // Accumulate individual stats
  const indivStats = new Map<string, {
    played: number; won: number; drawn: number; lost: number;
    gf: number; ga: number; squadId: string | null;
  }>();

  const squadStats = new Map<string, {
    played: number; won: number; drawn: number; lost: number;
    gf: number; ga: number;
  }>();

  for (const m of matches) {
    if (m.status === "VOID") continue;

    for (const uid of [m.homeUserId, m.awayUserId]) {
      if (!uid) continue;
      if (!indivStats.has(uid)) {
        const reg = await prisma.registration.findUnique({
          where: { tournamentId_userId: { tournamentId, userId: uid } },
        });
        indivStats.set(uid, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, squadId: reg?.squadId ?? null });
      }
    }

    const homeSquad = m.homeSquadId;
    const awaySquad = m.awaySquadId;
    for (const sid of [homeSquad, awaySquad]) {
      if (!sid || squadStats.has(sid)) continue;
      squadStats.set(sid, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 });
    }

    if (m.homeScore == null || m.awayScore == null) continue;

    const hi = indivStats.get(m.homeUserId!)!;
    const ai = indivStats.get(m.awayUserId!)!;
    hi.played++; ai.played++;
    hi.gf += m.homeScore; hi.ga += m.awayScore;
    ai.gf += m.awayScore; ai.ga += m.homeScore;

    if (m.homeScore > m.awayScore) { hi.won++; ai.lost++; }
    else if (m.awayScore > m.homeScore) { ai.won++; hi.lost++; }
    else { hi.drawn++; ai.drawn++; }

    // Dual attribution to squads
    if (homeSquad) {
      const hs = squadStats.get(homeSquad)!;
      hs.played++; hs.gf += m.homeScore; hs.ga += m.awayScore;
      if (m.homeScore > m.awayScore) hs.won++;
      else if (m.awayScore > m.homeScore) hs.lost++;
      else hs.drawn++;
    }
    if (awaySquad) {
      const as = squadStats.get(awaySquad)!;
      as.played++; as.gf += m.awayScore; as.ga += m.homeScore;
      if (m.awayScore > m.homeScore) as.won++;
      else if (m.homeScore > m.awayScore) as.lost++;
      else as.drawn++;
    }
  }

  // Write standings
  const standings: { tournamentId: string; scope: string; squadId?: string; userId?: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number; rank: number; rankShared: boolean }[] = [];

  let rank = 1;
  const indivSorted = Array.from(indivStats.entries())
    .map(([uid, s]) => ({ userId: uid, ...s, points: s.won * PTS_WIN + s.drawn * PTS_DRAW, gd: s.gf - s.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);

  for (let i = 0; i < indivSorted.length; i++) {
    const prev = indivSorted[i - 1];
    const cur = indivSorted[i];
    const shared = prev && prev.points === cur.points && prev.gd === cur.gd;
    standings.push({
      tournamentId, scope: "INDIVIDUAL", userId: cur.userId,
      played: cur.played, won: cur.won, drawn: cur.drawn, lost: cur.lost,
      goalsFor: cur.gf, goalsAgainst: cur.ga, goalDiff: cur.gd,
      points: cur.points, rank: shared ? (standings[standings.length - 1]?.rank ?? rank) : rank,
      rankShared: shared,
    });
    if (!shared) rank = i + 2;
  }

  rank = 1;
  const squadSorted = Array.from(squadStats.entries())
    .map(([sid, s]) => ({ squadId: sid, ...s, points: s.won * PTS_WIN + s.drawn * PTS_DRAW, gd: s.gf - s.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);

  for (let i = 0; i < squadSorted.length; i++) {
    const prev = squadSorted[i - 1];
    const cur = squadSorted[i];
    const shared = prev && prev.points === cur.points && prev.gd === cur.gd;
    standings.push({
      tournamentId, scope: "SQUAD", squadId: cur.squadId,
      played: cur.played, won: cur.won, drawn: cur.drawn, lost: cur.lost,
      goalsFor: cur.gf, goalsAgainst: cur.ga, goalDiff: cur.gd,
      points: cur.points, rank: shared ? (standings[standings.length - 1]?.rank ?? rank) : rank,
      rankShared: shared,
    });
    if (!shared) rank = i + 2;
  }

  if (standings.length > 0) {
    await prisma.standing.createMany({ data: standings });
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { standingsVersion: { increment: 1 } },
  });
}