// ─── Standings Page (§9.3) ──────────────────────────────────
import { getTournament } from "@/lib/services/tournament";
import { StandingsTable } from "@/components/standings-table/standings-table";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function StandingsPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getTournament(tournamentSlug);
  if (!t) notFound();

  const squadRows = t.standings
    .filter((s) => s.scope === "SQUAD")
    .map((s) => ({
      entityId: s.squadId ?? s.entityId,
      entityName: t.squads.find((sq) => sq.id === s.squadId)?.name ?? s.entityId,
      squadColorKey: t.squads.find((sq) => sq.id === s.squadId)?.colorKey,
      played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
      goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
      goalDiff: s.goalDiff, points: s.points,
      rank: s.rank, rankShared: s.rankShared,
    }));

  const indivRows = t.standings
    .filter((s) => s.scope === "INDIVIDUAL")
    .map((s) => {
      const reg = t.registrations.find((r) => r.userId === s.userId);
      return {
        entityId: s.userId ?? s.entityId,
        entityName: reg?.gamertag ?? s.entityId,
        squadId: reg?.squadId ?? undefined,
        squadColorKey: t.squads.find((sq) => sq.id === reg?.squadId)?.colorKey,
        played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
        goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
        goalDiff: s.goalDiff, points: s.points,
        rank: s.rank, rankShared: s.rankShared,
      };
    });

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="flex gap-0 border-b border-ink-line">
        <button className="px-4 py-2 text-sm font-medium text-floodlight border-b-2 border-kick">
          Squads
        </button>
        <button className="px-4 py-2 text-sm font-medium text-muted hover:text-floodlight border-b-2 border-transparent hover:border-muted transition-colors">
          Players
        </button>
      </div>

      {squadRows.length > 0 ? (
        <StandingsTable rows={squadRows} />
      ) : (
        <div className="text-center py-12 text-muted">
          <p className="text-sm">No standings yet.</p>
          <p className="text-xs mt-1">Results will populate the table as they&apos;re entered.</p>
        </div>
      )}

      {/* Individual table */}
      {indivRows.length > 0 && (
        <div className="mt-8">
          <h3 className="font-score text-sm text-floodlight mb-3">INDIVIDUAL STANDINGS</h3>
          <StandingsTable rows={indivRows} />
        </div>
      )}
    </div>
  );
}