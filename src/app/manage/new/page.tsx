// ─── New Tournament Wizard ──────────────────────────────────
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

const FORMATS = [
  { key: "CROSS_SQUAD_INDIVIDUAL_RR", label: "Cross-Squad RR", desc: "Every player faces every opponent across squads. Two tables from one match set. The NACOS format." },
  { key: "SINGLE_ELIMINATION", label: "Single Elimination", desc: "Classic bracket. Byes, seeding, third-place playoff." },
  { key: "DOUBLE_ELIMINATION", label: "Double Elimination", desc: "Second chance bracket. Losers bracket with reset option." },
  { key: "ROUND_ROBIN", label: "Round Robin", desc: "Everyone plays everyone. Circle method, home/away option." },
  { key: "GROUPS_KNOCKOUT", label: "Groups → Knockout", desc: "Snake seeding into groups, top advance to bracket." },
  { key: "SWISS", label: "Swiss", desc: "Equal-score pairings. No eliminations until the final round." },
];

const GAMES = ["EA_FC_26", "EA_FC_25", "OTHER"];
const PLATFORMS = ["PS5", "PS4", "XBOX", "PC"];

async function createTournament(formData: FormData) {
  const res = await fetch("/api/tournaments", {
    method: "POST",
    body: JSON.stringify({
      name: formData.get("name"),
      slug: formData.get("slug"),
      game: formData.get("game"),
      platform: formData.get("platform"),
      formatKey: formData.get("formatKey"),
      entryFeeKobo: parseInt(formData.get("entryFeeKobo") as string) * 100,
      capacity: parseInt(formData.get("capacity") as string),
      entryMode: formData.get("entryMode"),
      squadSize: formData.get("squadSize") ? parseInt(formData.get("squadSize") as string) : undefined,
    }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await createTournament(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.slug) {
      router.push(`/manage/${result.slug}`);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="font-score text-2xl text-floodlight">New Tournament</h1>
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? "bg-kick" : "bg-ink-line"
              } transition-colors`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-flag/15 border border-flag/30 rounded-md px-4 py-2 text-flag text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-muted uppercase tracking-wider">Name</label>
              <input
                name="name"
                required
                placeholder="NACOS Super League"
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                           placeholder:text-muted/50 focus:outline-none focus:border-kick"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted uppercase tracking-wider">Slug (URL)</label>
              <input
                name="slug"
                required
                placeholder="nacos-super-league"
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, hyphens"
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                           placeholder:text-muted/50 focus:outline-none focus:border-kick"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Game</label>
                <select
                  name="game"
                  defaultValue="EA_FC_26"
                  className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                             focus:outline-none focus:border-kick"
                >
                  {GAMES.map((g) => (
                    <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Platform</label>
                <select
                  name="platform"
                  defaultValue="PS5"
                  className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                             focus:outline-none focus:border-kick"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="button" variant="primary" className="w-full" onClick={() => setStep(2)}>
              Next: Format
            </Button>
          </div>
        )}

        {/* Step 2: Format */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-score text-sm text-floodlight">Choose Format</h3>
            <div className="space-y-2">
              {FORMATS.map((f) => (
                <label
                  key={f.key}
                  className="flex items-start gap-3 bg-ink-raised border border-ink-line rounded-md p-3 cursor-pointer
                             hover:border-kick transition-colors has-[:checked]:border-kick has-[:checked]:bg-kick/5"
                >
                  <input
                    type="radio"
                    name="formatKey"
                    value={f.key}
                    defaultChecked={f.key === "CROSS_SQUAD_INDIVIDUAL_RR"}
                    className="mt-0.5 accent-kick"
                  />
                  <div>
                    <div className="text-sm text-floodlight font-medium">{f.label}</div>
                    <div className="text-xs text-muted mt-0.5">{f.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" variant="primary" className="flex-1" onClick={() => setStep(3)}>
                Next: Details
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Entry Fee (₦)</label>
                <input
                  name="entryFeeKobo"
                  type="number"
                  defaultValue={5000}
                  min={0}
                  className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                             focus:outline-none focus:border-kick"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Capacity</label>
                <input
                  name="capacity"
                  type="number"
                  defaultValue={20}
                  min={2}
                  max={500}
                  className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                             focus:outline-none focus:border-kick"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted uppercase tracking-wider">Entry Mode</label>
              <select
                name="entryMode"
                defaultValue="INDIVIDUAL"
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                           focus:outline-none focus:border-kick"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="SQUAD">Squad (Captain-led)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted uppercase tracking-wider">Squad Size (if squad mode)</label>
              <input
                name="squadSize"
                type="number"
                defaultValue={5}
                min={1}
                max={20}
                className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                           focus:outline-none focus:border-kick"
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
                {loading ? "Creating..." : "Create Tournament"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}