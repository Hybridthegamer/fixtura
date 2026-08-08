// ─── Dashboard ──────────────────────────────────────────────
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { Card, StatusPill } from "@/components/ui/primitives";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted">Sign in to view your dashboard.</p>
          <Link
            href="/auth/signin"
            className="inline-flex bg-kick text-floodlight rounded-md px-4 py-2 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const myRegistrations = await prisma.registration.findMany({
    where: { userId: session.user.id },
    include: {
      tournament: {
        select: { id: true, slug: true, name: true, status: true, game: true, platform: true },
      },
      squad: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Find my next match
  const nextMatch = await prisma.match.findFirst({
    where: {
      OR: [{ homeUserId: session.user.id }, { awayUserId: session.user.id }],
      status: "SCHEDULED",
    },
    include: {
      tournament: { select: { slug: true, name: true } },
      gameweek: { select: { label: true, number: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink-line bg-ink-raised">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-score text-lg text-floodlight">
            FIXTURA
          </Link>
          <span className="text-sm text-muted">{session.user.handle}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <h1 className="font-score text-2xl text-floodlight">Dashboard</h1>

        {/* Next match */}
        {nextMatch && (
          <Card>
            <h3 className="text-xs text-muted uppercase tracking-wider mb-2">Your Next Match</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-score text-lg text-floodlight">
                  {nextMatch.tournament.name}
                </p>
                <p className="text-sm text-muted">
                  {nextMatch.gameweek?.label ?? `Gameweek ${nextMatch.gameweek?.number}`}
                </p>
              </div>
              <Link
                href={`/t/${nextMatch.tournament.slug}`}
                className="text-kick text-sm hover:underline"
              >
                View tournament →
              </Link>
            </div>
          </Card>
        )}

        {/* My tournaments */}
        <h2 className="font-score text-lg text-floodlight">My Tournaments</h2>

        {myRegistrations.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">
            <p>You&apos;re not registered in any tournaments yet.</p>
            <Link href="/explore" className="text-kick hover:underline mt-1 inline-block">
              Find a tournament
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myRegistrations.map((reg) => (
              <Link
                key={reg.id}
                href={`/t/${reg.tournament.slug}`}
                className="bg-ink-raised border border-ink-line rounded-lg p-4 hover:border-kick transition-colors"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-score text-sm text-floodlight">
                    {reg.tournament.name}
                  </h3>
                  <StatusPill status={reg.tournament.status} />
                </div>
                <div className="flex gap-2 text-xs text-muted mt-2">
                  <span>{reg.tournament.game?.replace(/_/g, " ")}</span>
                  <span>·</span>
                  <span>{reg.squad?.name ?? "Individual"}</span>
                </div>
                <div className="mt-1">
                  <span className="font-mono text-xs text-floodlight">{reg.gamertag}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}