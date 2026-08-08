// ─── Tournament Shell Layout ────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedTournament } from "@/lib/services/tournament";
import { StatusPill } from "@/components/ui/primitives";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  params: Promise<{ tournamentSlug: string }>;
}

export default async function TournamentLayout({ children, params }: Props) {
  const { tournamentSlug } = await params;
  const tournament = await getCachedTournament(tournamentSlug);

  if (!tournament || tournament.visibility === "PRIVATE") {
    notFound();
  }

  const navItems = [
    { label: "Overview", href: `/t/${tournamentSlug}` },
    { label: "Fixtures", href: `/t/${tournamentSlug}/fixtures` },
    { label: "Standings", href: `/t/${tournamentSlug}/standings` },
    { label: "Players", href: `/t/${tournamentSlug}/players` },
    { label: "Prizes", href: `/t/${tournamentSlug}/prizes` },
    { label: "Rules", href: `/t/${tournamentSlug}/rules` },
  ];

  const publishedGameweeks = tournament.gameweeks.filter(
    (gw: { publishedAt: Date | null }) => gw.publishedAt
  ).length;
  const statusText: Record<string, string> = {
    REGISTRATION_OPEN: `Registration open${tournament.registrationClosesAt ? ` · closes in ${Math.ceil((new Date(tournament.registrationClosesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d` : ""}`,
    LIVE: `Live · Gameweek ${publishedGameweeks} of ${tournament.gameweeks.length}`,
    COMPLETED: "Completed",
  };

  const filledSlots = tournament.registrations.length;
  const capacity = tournament.capacity;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-ink-line bg-ink">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/o/${tournament.organization.slug}`}
              className="text-xs text-muted hover:text-floodlight transition-colors"
            >
              {tournament.organization.name}
            </Link>
            <StatusPill status={tournament.status} />
          </div>

          <h1 className="font-score text-2xl md:text-3xl text-floodlight tracking-[0.01em]">
            {tournament.name}
          </h1>

          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span>{tournament.game?.replace(/_/g, " ")}</span>
            <span>{tournament.platform}</span>
            {tournament.entryFeeKobo > 0 && (
              <span className="text-amber font-medium">
                ₦{(tournament.entryFeeKobo / 100).toLocaleString()} entry
              </span>
            )}
            <span>{filledSlots}/{capacity} slots</span>
          </div>

          {(tournament.status === "REGISTRATION_OPEN" || tournament.status === "PUBLISHED") && (
            <div className="pt-2">
              <Link
                href={`/t/${tournamentSlug}/register`}
                className="inline-flex items-center justify-center bg-kick text-floodlight rounded-md px-6 py-2 text-sm font-medium
                           hover:bg-kick/90 transition-colors"
              >
                Register now · ₦{(tournament.entryFeeKobo / 100).toLocaleString()}
              </Link>
            </div>
          )}
        </div>

        <nav className="max-w-6xl mx-auto px-4 md:px-6 flex overflow-x-auto gap-0 border-t border-ink-line">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-4 py-2.5 text-xs font-medium text-muted hover:text-floodlight hover:bg-ink-raised
                         border-b-2 border-transparent hover:border-kick transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}