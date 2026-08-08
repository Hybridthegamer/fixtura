// ─── Manage Results Page ────────────────────────────────────
import { getTournament } from "@/lib/services/tournament";
import { ResultsConsole } from "@/components/results/results-console";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function ManageResultsPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getTournament(tournamentSlug);
  if (!t) notFound();

  // Build match data for the results console
  const matchData = t.matches.map((m) => {
    const homeUser = t.registrations.find((r) => r.userId === m.homeUserId);
    const awayUser = t.registrations.find((r) => r.userId === m.awayUserId);
    const homeSquad = t.squads.find((s) => s.id === m.homeSquadId);
    const awaySquad = t.squads.find((s) => s.id === m.awaySquadId);

    const gw = t.gameweeks.find((g) => g.id === m.gameweekId);

    return {
      id: m.id,
      homeUserId: m.homeUserId,
      awayUserId: m.awayUserId,
      homeSquadId: m.homeSquadId,
      awaySquadId: m.awaySquadId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      homeGamertag: homeUser?.gamertag ?? "TBD",
      awayGamertag: awayUser?.gamertag ?? "TBD",
      homeColorKey: homeSquad?.colorKey ?? 0,
      awayColorKey: awaySquad?.colorKey ?? 1,
      gameweekNumber: gw?.number ?? 0,
      squadMatchupLabel: `${homeSquad?.shortName ?? "?"} v ${awaySquad?.shortName ?? "?"}`,
    };
  });

  return (
    <div>
      <h1 className="font-score text-xl text-floodlight mb-4">Results Console</h1>
      <ResultsConsole
        tournamentSlug={tournamentSlug}
        matches={matchData}
        gameweeks={t.gameweeks.map((g) => ({ number: g.number, label: g.label }))}
      />
    </div>
  );
}