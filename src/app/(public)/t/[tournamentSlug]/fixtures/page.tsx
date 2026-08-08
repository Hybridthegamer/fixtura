// ─── Fixtures Page ──────────────────────────────────────────
import { getCachedTournament } from "@/lib/services/tournament";
import { Scoreline } from "@/components/scoreline/scoreline";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function FixturesPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getCachedTournament(tournamentSlug);
  if (!t) notFound();

  const gwMap = new Map<number, typeof t.matches>();
  for (const m of t.matches) {
    if (!m.gameweekId) continue;
    const gw = t.gameweeks.find((g: { id: string }) => g.id === m.gameweekId);
    const num = gw?.number ?? 0;
    if (!gwMap.has(num)) gwMap.set(num, []);
    gwMap.get(num)!.push(m);
  }

  const sortedGameweeks = Array.from(gwMap.entries()).sort(([a], [b]) => a - b);

  if (sortedGameweeks.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p className="text-sm">No fixtures generated yet.</p>
        <p className="text-xs mt-1">They&apos;ll appear once the organizer publishes them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedGameweeks.map(([gwNum, matches]) => {
        const gw = t.gameweeks.find((g: { number: number }) => g.number === gwNum);
        return (
          <section key={gwNum}>
            <h2 className="font-score text-sm text-floodlight mb-3 sticky top-0 bg-ink py-2 z-10">
              {gw?.label ?? `Gameweek ${gwNum}`}
            </h2>
            <div className="space-y-2">
              {matches.map((m) => {
                const homeUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.homeUserId);
                const awayUser = t.registrations.find((r: { userId: string | null }) => r.userId === m.awayUserId);
                const homeSquad = t.squads.find((s: { id: string | null }) => s.id === m.homeSquadId);
                const awaySquad = t.squads.find((s: { id: string | null }) => s.id === m.awaySquadId);

                return (
                  <Scoreline
                    key={m.id}
                    homeGamertag={(homeUser as { gamertag?: string })?.gamertag ?? "TBD"}
                    awayGamertag={(awayUser as { gamertag?: string })?.gamertag ?? "TBD"}
                    homeScore={m.homeScore}
                    awayScore={m.awayScore}
                    homeColorKey={(homeSquad as { colorKey?: number })?.colorKey}
                    awayColorKey={(awaySquad as { colorKey?: number })?.colorKey}
                    status={m.status as "SCHEDULED" | "COMPLETED" | "LIVE"}
                    variant="default"
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}