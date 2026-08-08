// ─── Landing Page (§9.1) ──────────────────────────────────
import Link from "next/link";
import { Button, Badge } from "@/components/ui/primitives";

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <header className="relative px-6 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="space-y-6">
          <Badge variant="live">Coming August 2026</Badge>

          <h1 className="font-score text-5xl md:text-6xl text-floodlight leading-[0.9] tracking-[0.01em]">
            RUN YOUR
            <br />
            TOURNAMENT.
            <br />
            <span className="text-kick">NO SPREADSHEET.</span>
          </h1>

          <p className="text-muted text-lg max-w-lg">
            Fixtura lets anyone run a paid gaming tournament end-to-end — registration,
            entry fees, fixtures, results, live tables, prizes — without a spreadsheet
            and a WhatsApp group.
          </p>

          <div className="flex gap-3 pt-4">
            <Link href="/manage/new">
              <Button variant="primary" size="lg">
                Run a tournament
              </Button>
            </Link>
            <Link href="/explore">
              <Button variant="outline" size="lg">
                Find a tournament
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature highlight cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16">
          {[
            {
              step: "01",
              title: "Create",
              desc: "Set up your tournament in minutes. Choose your format, entry fee, and rules. Share a link.",
            },
            {
              step: "02",
              title: "Collect",
              desc: "Players register and pay via Paystack. Fixtura never holds your money — it goes straight to you.",
            },
            {
              step: "03",
              title: "Compete",
              desc: "Fixtures auto-generate. Results update live. Standings are always current. Prizes tracked.",
            },
          ].map((f) => (
            <div
              key={f.step}
              className="bg-ink-raised border border-ink-line rounded-lg p-6 space-y-3"
            >
              <span className="font-mono text-xs text-kick">{f.step}</span>
              <h3 className="font-score text-xl text-floodlight">{f.title}</h3>
              <p className="text-muted text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Formats section */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="font-score text-3xl text-floodlight mb-8">
          FORMATS BUILT FOR CONSOLE
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: "Cross-Squad RR", desc: "The NACOS format. Every player faces every opponent across squads. Two tables from one match set.", featured: true },
            { name: "Single Elimination", desc: "Classic bracket. Byes, seeding, third-place playoff." },
            { name: "Double Elimination", desc: "Everyone gets a second chance. Losers bracket with bracket reset." },
            { name: "Round Robin", desc: "Everyone plays everyone. Circle method, home/away, rotating byes." },
            { name: "Groups → Knockout", desc: "Snake seeding into groups, top Q advance to bracket." },
            { name: "Swiss", desc: "Equal-score pairings. No eliminations until the final round." },
          ].map((f) => (
            <div
              key={f.name}
              className={`bg-ink-raised border rounded-lg p-5 space-y-2 ${
                f.featured ? "border-kick" : "border-ink-line"
              }`}
            >
              <h3 className="font-score text-lg text-floodlight">{f.name}</h3>
              <p className="text-muted text-sm">{f.desc}</p>
              {f.featured && (
                <Badge variant="live">Featured</Badge>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 border-t border-ink-line">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="font-score text-3xl text-floodlight">
            YOUR TOURNAMENT, YOUR WAY
          </h2>
          <p className="text-muted">
            Paystack-powered payments in Naira. Built for Nigerian campus and community console tournaments.
            No spreadsheets. No WhatsApp groups. No arguments.
          </p>
          <Link href="/manage/new">
            <Button variant="primary" size="lg">Get started</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-ink-line text-center text-muted text-xs">
        <p>FIXTURA — Tournament infrastructure for console esports.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/legal/terms" className="hover:text-floodlight">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-floodlight">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}