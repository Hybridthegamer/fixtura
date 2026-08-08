// ─── Tournament Overview (§9.2) ─────────────────────────────
import { getCachedTournament } from "@/lib/services/tournament";
import { Scoreline } from "@/components/scoreline/scoreline";
import { StandingsTable } from "@/components/standings-table/standings-table";
import { Card, Badge } from "@/components/ui/primitives";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function TournamentOverviewPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getCachedTournament(tournamentSlug);
  if (!t) notFound();

  const upcomingMatches = t.matches.filter((m: { status: string }) => m.status === "SCHEDULED").slice(0, 5);
  const recentMatches = t.matches.filter((m: { status: string }) => m.status === "COMPLETED").slice(-5).reverse();
  const squadStandings = t.standings.filter((s: { scope: string }) => s.scope === "SQUAD").slice(0, 5);
  const indivStandings = t.standings.filter((s: { scope: string }) => s.scope === "INDIVIDUAL").slice(0, 5);

  const prizeSplit = t.prizeSplit ? JSON.parse(t.prizeSplit) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted">Slots:</span>
          <div className="w-32 h-2 bg-ink-line rounded-full overflow-hidden">
            <div className="h-full bg-kick rounded-full transition-all"
              style={{ width: `${(t.registrations.length / t.capacity) * 100}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums">{t.registrations.length}/{t.capacity}</span>
        </div>
        {t.prizePoolKobo && (
          <span className="text-amber font-medium">₦{(t.prizePoolKobo / 100).toLocaleString()} pool</span>
        )}
      </div>

      <section>
        <h2 className="font-score text-lg text-floodlight mb-3">
          {upcomingMatches.length > 0 ? "UPCOMING" : "RECENT RESULTS"}
        </h2>
        <div className="space-y-2">
          {(upcomingMatches.length > 0 ? upcomingMatches : recentMatches).map((m: Record<string, unknown>) => {
            const homeUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.homeUserId);
            const awayUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.awayUserId);
            const homeSquad = t.squads.find((s: { id: string | null }) => s.id === m.homeSquadId);
            const awaySquad = t.squads.find((s: { id: string | null }) => s.id === m.awaySquadId);

            return (
              <Scoreline key={m.id as string}
                homeGamertag={(homeUser as { gamertag?: string })?.gamertag ?? "TBD"}
                awayGamertag={(awayUser as { gamertag?: string })?.gamertag ?? "TBD"}
                homeScore={m.homeScore as number | null} awayScore={m.awayScore as number | null}
                homeColorKey={(homeSquad as { colorKey?: number })?.colorKey}
                awayColorKey={(awaySquad as { colorKey?: number })?.colorKey}
                status={(m.status as string) as "SCHEDULED" | "COMPLETED"} variant="compact" />
            );
          })}
          {upcomingMatches.length === 0 && recentMatches.length === 0 && (
            <p className="text-muted text-sm">No fixtures generated yet.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">SQUAD STANDINGS</h3>
          {squadStandings.length > 0 ? (
            <StandingsTable rows={squadStandings.map((s: Record<string, unknown>) => ({
              entityId: (s.squadId as string) ?? (s.entityId as string),
              entityName: (t.squads.find((sq: { id: string | null }) => sq.id === s.squadId) as { name?: string })?.name ?? (s.entityId as string),
              squadColorKey: (t.squads.find((sq: { id: string | null }) => sq.id === s.squadId) as { colorKey?: number })?.colorKey,
              played: s.played as number, won: s.won as number, drawn: s.drawn as number, lost: s.lost as number,
              goalsFor: s.goalsFor as number, goalsAgainst: s.goalsAgainst as number,
              goalDiff: s.goalDiff as number, points: s.points as number,
              rank: s.rank as number, rankShared: s.rankShared as boolean,
            }))} compact />
          ) : <p className="text-muted text-sm">No standings yet.</p>}
        </Card>

        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">PLAYER STANDINGS</h3>
          {indivStandings.length > 0 ? (
            <StandingsTable rows={indivStandings.map((s: Record<string, unknown>) => ({
              entityId: (s.userId as string) ?? (s.entityId as string),
              entityName: (t.registrations.find((r: { userId: string | null }) => r.userId === s.userId) as { gamertag?: string })?.gamertag ?? (s.entityId as string),
              squadId: s.squadId as string | undefined,
              played: s.played as number, won: s.won as number, drawn: s.drawn as number, lost: s.lost as number,
              goalsFor: s.goalsFor as number, goalsAgainst: s.goalsAgainst as number,
              goalDiff: s.goalDiff as number, points: s.points as number,
              rank: s.rank as number, rankShared: s.rankShared as boolean,
            }))} compact />
          ) : <p className="text-muted text-sm">No standings yet.</p>}
        </Card>
      </div>

      {prizeSplit && (
        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">PRIZE POOL</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(prizeSplit) as [string, number][]).map(([key, amount]) => {
              const award = t.awards.find((a: { key: string }) => a.key === key);
              return (
                <div key={key} className="text-center p-3 bg-ink rounded-md border border-ink-line">
                  <div className="text-amber font-score text-lg">₦{(amount / 100).toLocaleString()}</div>
                  <div className="text-muted text-2xs mt-1">{(award as { label?: string })?.label ?? key}</div>
                  {(award as { payoutStatus?: string })?.payoutStatus === "PAID" && (
                    <Badge variant="success" className="mt-1">Paid</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}