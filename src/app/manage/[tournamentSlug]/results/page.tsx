// ─── Manage Results Page ────────────────────────────────────
import { getCachedTournament } from "@/lib/services/tournament";
import { ResultsConsole } from "@/components/results/results-console";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function ManageResultsPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getCachedTournament(tournamentSlug);
  if (!t) notFound();

  const matchData = t.matches.map((m: Record<string, unknown>) => {
    const homeUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.homeUserId);
    const awayUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.awayUserId);
    const homeSquad = t.squads.find((s: { id: string | null }) => s.id === m.homeSquadId);
    const awaySquad = t.squads.find((s: { id: string | null }) => s.id === m.awaySquadId);
    const gw = t.gameweeks.find((g: { id: string | null }) => g.id === m.gameweekId);

    return {
      id: m.id as string,
      homeUserId: m.homeUserId as string | null,
      awayUserId: m.awayUserId as string | null,
      homeSquadId: m.homeSquadId as string | null,
      awaySquadId: m.awaySquadId as string | null,
      homeScore: m.homeScore as number | null,
      awayScore: m.awayScore as number | null,
      status: m.status as string,
      homeGamertag: (homeUser as { gamertag?: string })?.gamertag ?? "TBD",
      awayGamertag: (awayUser as { gamertag?: string })?.gamertag ?? "TBD",
      homeColorKey: (homeSquad as { colorKey?: number })?.colorKey ?? 0,
      awayColorKey: (awaySquad as { colorKey?: number })?.colorKey ?? 1,
      gameweekNumber: (gw as { number?: number })?.number ?? 0,
      squadMatchupLabel: `${(homeSquad as { shortName?: string })?.shortName ?? "?"} v ${(awaySquad as { shortName?: string })?.shortName ?? "?"}`,
    };
  });

  return (
    <div>
      <h1 className="font-score text-xl text-floodlight mb-4">Results Console</h1>
      <ResultsConsole
        tournamentSlug={tournamentSlug}
        matches={matchData}
        gameweeks={t.gameweeks.map((g: { number: number; label: string | null }) => ({ number: g.number, label: g.label }))}
      />
    </div>
  );
}