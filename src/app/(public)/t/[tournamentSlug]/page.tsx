// ─── Tournament Overview (§9.2) ─────────────────────────────
import { getTournament } from "@/lib/services/tournament";
import { Scoreline } from "@/components/scoreline/scoreline";
import { StandingsTable } from "@/components/standings-table/standings-table";
import { Card, Badge, StatusPill } from "@/components/ui/primitives";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function TournamentOverviewPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getTournament(tournamentSlug);

  if (!t) notFound();

  // Get upcoming matches (next 5)
  const upcomingMatches = t.matches
    .filter((m) => m.status === "SCHEDULED")
    .slice(0, 5);

  // Get recent completed matches (last 5)
  const recentMatches = t.matches
    .filter((m) => m.status === "COMPLETED")
    .slice(-5)
    .reverse();

  // Squad standings (top 5)
  const squadStandings = t.standings
    .filter((s) => s.scope === "SQUAD")
    .slice(0, 5);

  // Individual standings (top 5)
  const indivStandings = t.standings
    .filter((s) => s.scope === "INDIVIDUAL")
    .slice(0, 5);

  // Prize pool
  const prizeSplit = t.prizeSplit ? JSON.parse(t.prizeSplit) : null;

  return (
    <div className="space-y-8">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted">Slots:</span>
          <div className="w-32 h-2 bg-ink-line rounded-full overflow-hidden">
            <div
              className="h-full bg-kick rounded-full transition-all"
              style={{ width: `${(t.registrations.length / t.capacity) * 100}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums">
            {t.registrations.length}/{t.capacity}
          </span>
        </div>

        {t.prizePoolKobo && (
          <span className="text-amber font-medium">
            ₦{(t.prizePoolKobo / 100).toLocaleString()} pool
          </span>
        )}
      </div>

      {/* Hero: upcoming fixtures or recent results */}
      <section>
        <h2 className="font-score text-lg text-floodlight mb-3">
          {upcomingMatches.length > 0 ? "UPCOMING" : "RECENT RESULTS"}
        </h2>
        <div className="space-y-2">
          {(upcomingMatches.length > 0 ? upcomingMatches : recentMatches).map((m) => {
            const homeUser = t.registrations.find((r) => r.userId === m.homeUserId);
            const awayUser = t.registrations.find((r) => r.userId === m.awayUserId);
            const homeSquad = t.squads.find((s) => s.id === m.homeSquadId);
            const awaySquad = t.squads.find((s) => s.id === m.awaySquadId);

            return (
              <Scoreline
                key={m.id}
                homeGamertag={homeUser?.gamertag ?? "TBD"}
                awayGamertag={awayUser?.gamertag ?? "TBD"}
                homeScore={m.homeScore}
                awayScore={m.awayScore}
                homeColorKey={homeSquad?.colorKey}
                awayColorKey={awaySquad?.colorKey}
                status={m.status as "SCHEDULED" | "COMPLETED"}
                variant="compact"
              />
            );
          })}
          {upcomingMatches.length === 0 && recentMatches.length === 0 && (
            <p className="text-muted text-sm">No fixtures generated yet.</p>
          )}
        </div>
      </section>

      {/* Standings preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">SQUAD STANDINGS</h3>
          {squadStandings.length > 0 ? (
            <StandingsTable
              rows={squadStandings.map((s) => ({
                entityId: s.squadId ?? s.entityId,
                entityName: t.squads.find((sq) => sq.id === s.squadId)?.name ?? s.entityId,
                squadColorKey: t.squads.find((sq) => sq.id === s.squadId)?.colorKey,
                played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
                goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
                goalDiff: s.goalDiff, points: s.points,
                rank: s.rank, rankShared: s.rankShared,
              }))}
              compact
            />
          ) : (
            <p className="text-muted text-sm">No standings yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">PLAYER STANDINGS</h3>
          {indivStandings.length > 0 ? (
            <StandingsTable
              rows={indivStandings.map((s) => ({
                entityId: s.userId ?? s.entityId,
                entityName: t.registrations.find((r) => r.userId === s.userId)?.gamertag ?? s.entityId,
                squadId: s.squadId ?? undefined,
                played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
                goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
                goalDiff: s.goalDiff, points: s.points,
                rank: s.rank, rankShared: s.rankShared,
              }))}
              compact
            />
          ) : (
            <p className="text-muted text-sm">No standings yet.</p>
          )}
        </Card>
      </div>

      {/* Prize pool */}
      {prizeSplit && (
        <Card>
          <h3 className="font-score text-sm text-floodlight mb-3">PRIZE POOL</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(prizeSplit).map(([key, amount]) => {
              const award = t.awards.find((a) => a.key === key);
              return (
                <div key={key} className="text-center p-3 bg-ink rounded-md border border-ink-line">
                  <div className="text-amber font-score text-lg">
                    ₦{((amount as number) / 100).toLocaleString()}
                  </div>
                  <div className="text-muted text-2xs mt-1">{award?.label ?? key}</div>
                  {award?.payoutStatus === "PAID" && (
                    <Badge variant="success" className="mt-1">Paid</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Rules excerpt */}
      {t.rulesMarkdown && (
        <Card>
          <h3 className="font-score text-sm text-floodlight mb-2">RULES</h3>
          <div className="prose prose-invert prose-sm max-w-none text-muted">
            {t.rulesMarkdown.slice(0, 300)}
            {t.rulesMarkdown.length > 300 && "..."}
          </div>
        </Card>
      )}
    </div>
  );
}