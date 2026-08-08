// ─── Manage Home ────────────────────────────────────────────
import { prisma } from "@/lib/db";
import { Card, StatusPill, Badge } from "@/components/ui/primitives";
import Link from "next/link";
import { auth } from "@/lib/auth/config";

export default async function ManageHomePage() {
  const session = await auth();
  if (!session?.user) {
    return <div className="text-center py-12"><p className="text-muted">Sign in to manage tournaments.</p></div>;
  }

  const orgMembers = await prisma.orgMember.findMany({
    where: { userId: session.user.id },
  });
  const orgIds = orgMembers.map((m) => m.orgId);

  const tournaments = await prisma.tournament.findMany({
    where: { orgId: { in: orgIds } },
    orderBy: { createdAt: "desc" as const },
  });

  // Get registration counts
  const counts = new Map<string, { registrations: number; matches: number }>();
  for (const t of tournaments) {
    const [regCount, matchCount] = await Promise.all([
      prisma.registration.count({ where: { tournamentId: t.id } }),
      prisma.match.count({ where: { tournamentId: t.id } }),
    ]);
    counts.set(t.id, { registrations: regCount, matches: matchCount });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-score text-2xl text-floodlight">Your Tournaments</h1>
        <Link href="/manage/new" className="bg-kick text-floodlight rounded-md px-4 py-2 text-sm font-medium hover:bg-kick/90 transition-colors">
          + New Tournament
        </Link>
      </div>

      {tournaments.length === 0 && (
        <Card>
          <div className="text-center py-8 space-y-2">
            <p className="text-muted">No tournaments yet.</p>
            <p className="text-xs text-muted">Create your first tournament to get started.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tournaments.map((t) => {
          const c = counts.get(t.id) ?? { registrations: 0, matches: 0 };
          return (
            <Link key={t.id} href={`/manage/${t.slug}`} className="bg-ink-raised border border-ink-line rounded-lg p-4 hover:border-kick transition-colors group">
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-score text-base text-floodlight group-hover:text-kick transition-colors">{t.name}</h2>
                <StatusPill status={t.status} />
              </div>
              <div className="flex gap-3 text-xs text-muted">
                <span>{t.game?.replace(/_/g, " ")}</span>
                <span>{t.platform}</span>
                <span>{c.registrations} players</span>
                <span>{c.matches} matches</span>
              </div>
              {t.entryFeeKobo > 0 && (
                <div className="mt-2"><Badge variant="warning">₦{(t.entryFeeKobo / 100).toLocaleString()} entry</Badge></div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}