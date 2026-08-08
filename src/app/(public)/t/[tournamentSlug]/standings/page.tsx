// ─── Standings Page (§9.3) ──────────────────────────────────
import { getCachedTournament } from "@/lib/services/tournament";
import { StandingsTable } from "@/components/standings-table/standings-table";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function StandingsPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getCachedTournament(tournamentSlug);
  if (!t) notFound();

  const squadRows = t.standings
    .filter((s: { scope: string }) => s.scope === "SQUAD")
    .map((s: Record<string, unknown>) => ({
      entityId: (s.squadId as string) ?? (s.entityId as string),
      entityName: (t.squads.find((sq: { id: string | null }) => sq.id === s.squadId) as { name?: string })?.name ?? (s.entityId as string),
      squadColorKey: (t.squads.find((sq: { id: string | null }) => sq.id === s.squadId) as { colorKey?: number })?.colorKey,
      played: s.played as number, won: s.won as number, drawn: s.drawn as number, lost: s.lost as number,
      goalsFor: s.goalsFor as number, goalsAgainst: s.goalsAgainst as number,
      goalDiff: s.goalDiff as number, points: s.points as number,
      rank: s.rank as number, rankShared: s.rankShared as boolean,
    }));

  const indivRows = t.standings
    .filter((s: { scope: string }) => s.scope === "INDIVIDUAL")
    .map((s: Record<string, unknown>) => {
      const reg = t.registrations.find((r: { userId: string | null }) => r.userId === s.userId);
      return {
        entityId: (s.userId as string) ?? (s.entityId as string),
        entityName: (reg as { gamertag?: string })?.gamertag ?? (s.entityId as string),
        squadId: (reg as { squadId?: string })?.squadId ?? undefined,
        squadColorKey: t.squads.find((sq: { id: string | null }) => sq.id === (reg as { squadId?: string })?.squadId) as { colorKey?: number } | undefined,
        played: s.played as number, won: s.won as number, drawn: s.drawn as number, lost: s.lost as number,
        goalsFor: s.goalsFor as number, goalsAgainst: s.goalsAgainst as number,
        goalDiff: s.goalDiff as number, points: s.points as number,
        rank: s.rank as number, rankShared: s.rankShared as boolean,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex gap-0 border-b border-ink-line">
        <button className="px-4 py-2 text-sm font-medium text-floodlight border-b-2 border-kick">Squads</button>
        <button className="px-4 py-2 text-sm font-medium text-muted hover:text-floodlight border-b-2 border-transparent hover:border-muted transition-colors">Players</button>
      </div>
      {squadRows.length > 0 ? <StandingsTable rows={squadRows} /> : (
        <div className="text-center py-12 text-muted">
          <p className="text-sm">No standings yet.</p>
        </div>
      )}
      {indivRows.length > 0 && (
        <div className="mt-8">
          <h3 className="font-score text-sm text-floodlight mb-3">INDIVIDUAL STANDINGS</h3>
          <StandingsTable rows={indivRows} />
        </div>
      )}
    </div>
  );
}