// ─── Players Page ───────────────────────────────────────────
import Link from "next/link";
import { getCachedTournament } from "@/lib/services/tournament";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/primitives";

interface Props {
  params: Promise<{ tournamentSlug: string }>;
}

export default async function PlayersPage({ params }: Props) {
  const { tournamentSlug } = await params;
  const t = await getCachedTournament(tournamentSlug);
  if (!t) notFound();

  const squadPlayers = new Map<string, typeof t.registrations>();
  for (const reg of t.registrations) {
    const sid = reg.squadId ?? "unassigned";
    if (!squadPlayers.has(sid)) squadPlayers.set(sid, []);
    squadPlayers.get(sid)!.push(reg);
  }

  if (t.registrations.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p className="text-sm">No players registered yet.</p>
      </div>
    );
  }

  const SQUAD_COLORS: Record<number, string> = {
    0: "#FF2D6F", 1: "#2B9FFF", 2: "#2BD97C", 3: "#FFB43A",
    4: "#A855F7", 5: "#FF5A47", 6: "#14B8A6", 7: "#F97316",
  };

  return (
    <div className="space-y-6">
      {Array.from(squadPlayers.entries()).map(([squadId, players]) => {
        const squad = t.squads.find((s: { id: string }) => s.id === squadId);
        const color = squad ? SQUAD_COLORS[(squad as { colorKey?: number }).colorKey ?? 0] ?? "#FF2D6F" : undefined;

        return (
          <section key={squadId}>
            <h2 className="font-score text-sm text-floodlight mb-3 flex items-center gap-2">
              {color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />}
              {(squad as { name?: string })?.name ?? "Unassigned"}
              <span className="text-muted text-xs font-body">
                ({players.length} player{players.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {players.map((reg) => {
                const standing = t.standings.find(
                  (s: { userId: string | null; scope: string }) => s.userId === reg.userId && s.scope === "INDIVIDUAL",
                );
                return (
                  <div key={reg.id} className="bg-ink-raised border border-ink-line rounded-md p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-ink-line flex items-center justify-center text-xs font-mono text-muted">
                      {(reg as { user?: { displayName?: string } }).user?.displayName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-floodlight truncate">{reg.gamertag}</div>
                      <div className="text-2xs text-muted truncate">{(reg as { user?: { displayName?: string } }).user?.displayName}</div>
                    </div>
                    {standing && (
                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs text-floodlight tabular-nums">#{(standing as { rank?: number }).rank}</div>
                        <div className="font-mono text-2xs text-muted tabular-nums">{(standing as { points?: number }).points}pts</div>
                      </div>
                    )}
                    <Badge variant={reg.status === "CONFIRMED" || reg.status === "PAID" ? "success" : "warning"}>
                      {reg.status === "CONFIRMED" || reg.status === "PAID" ? "Paid" : reg.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}