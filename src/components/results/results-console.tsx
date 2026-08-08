// ─── Results Console (§9.4) ─────────────────────────────────
// The organizer's most-used screen. Optimized for phone entry.
"use client";

import { useState, useCallback } from "react";
import { enterResult } from "@/lib/services/results";
import { Scoreline } from "@/components/scoreline/scoreline";
import { Button, Badge } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";

interface MatchData {
  id: string;
  homeUserId: string | null;
  awayUserId: string | null;
  homeSquadId: string | null;
  awaySquadId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  homeGamertag: string;
  awayGamertag: string;
  homeColorKey: number;
  awayColorKey: number;
  gameweekNumber: number;
  squadMatchupLabel: string;
}

interface ResultsConsoleProps {
  tournamentSlug: string;
  matches: MatchData[];
  gameweeks: { number: number; label: string | null }[];
}

export function ResultsConsole({ tournamentSlug, matches, gameweeks }: ResultsConsoleProps) {
  const router = useRouter();
  const [activeGw, setActiveGw] = useState(gameweeks[0]?.number ?? 1);
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});
  const [statuses, setStatuses] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [error, setError] = useState("");

  const gwMatches = matches.filter((m) => m.gameweekNumber === activeGw);

  async function handleSave(matchId: string) {
    const s = scores[matchId];
    if (!s) return;

    const home = parseInt(s.home);
    const away = parseInt(s.away);
    if (isNaN(home) || isNaN(away)) return;

    setStatuses((prev) => ({ ...prev, [matchId]: "saving" }));

    const result = await enterResult(matchId, home, away, tournamentSlug);

    if (result?.error) {
      setStatuses((prev) => ({ ...prev, [matchId]: "error" }));
      setError(result.error);
    } else {
      setStatuses((prev) => ({ ...prev, [matchId]: "saved" }));
      router.refresh();
    }
  }

  function handleScoreChange(matchId: string, field: "home" | "away", value: string) {
    setScores((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value, home: prev[matchId]?.home ?? "", away: prev[matchId]?.away ?? "" },
    }));
  }

  function handleKeyDown(e: React.KeyboardEvent, matchId: string, field: "home" | "away") {
    if (e.key === "Enter") {
      if (field === "home") {
        // Auto-advance to away score
        const nextInput = document.querySelector<HTMLInputElement>(`[data-match="${matchId}"][data-field="away"]`);
        nextInput?.focus();
      } else {
        handleSave(matchId);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Gameweek selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {gameweeks.map((gw) => (
          <button
            key={gw.number}
            onClick={() => setActiveGw(gw.number)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              activeGw === gw.number
                ? "bg-kick text-floodlight"
                : "bg-ink-raised text-muted hover:text-floodlight border border-ink-line"
            }`}
          >
            {gw.label ?? `Gameweek ${gw.number}`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-flag/15 border border-flag/30 rounded-md px-3 py-2 text-flag text-sm">
          {error}
        </div>
      )}

      {/* Match entry grid */}
      <div className="space-y-2">
        {gwMatches.length === 0 && (
          <p className="text-muted text-sm py-8 text-center">No matches in this gameweek.</p>
        )}

        {gwMatches.map((m) => {
          const s = scores[m.id];
          const st = statuses[m.id] ?? "idle";
          const hasScore = m.homeScore !== null && m.awayScore !== null;

          return (
            <div
              key={m.id}
              className="bg-ink-raised border border-ink-line rounded-md overflow-hidden"
            >
              {/* Match header */}
              <div className="flex items-center justify-between px-3 py-2 bg-ink text-xs text-muted">
                <span>{m.squadMatchupLabel}</span>
                {st === "saving" && <span className="text-kick">Saving...</span>}
                {st === "saved" && <span className="text-turf">Saved ✓</span>}
                {st === "error" && <span className="text-flag">Error</span>}
              </div>

              {/* Scoreline with inputs */}
              <div className="flex items-center h-16">
                {/* Home gamertag */}
                <div className="flex-1 min-w-0 px-3">
                  <span className="font-mono text-xs text-floodlight truncate block">
                    {m.homeGamertag}
                  </span>
                </div>

                {/* Score inputs */}
                {!hasScore || st === "error" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      data-match={m.id}
                      data-field="home"
                      value={s?.home ?? ""}
                      onChange={(e) => handleScoreChange(m.id, "home", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, m.id, "home")}
                      placeholder="0"
                      maxLength={2}
                      className="w-12 h-10 bg-ink border border-ink-line rounded-md text-center font-score text-lg text-floodlight
                                 focus:outline-none focus:border-kick transition-colors tabular-nums"
                    />
                    <span className="text-muted font-score">–</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      data-match={m.id}
                      data-field="away"
                      value={s?.away ?? ""}
                      onChange={(e) => handleScoreChange(m.id, "away", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, m.id, "away")}
                      placeholder="0"
                      maxLength={2}
                      className="w-12 h-10 bg-ink border border-ink-line rounded-md text-center font-score text-lg text-floodlight
                                 focus:outline-none focus:border-kick transition-colors tabular-nums"
                    />
                  </div>
                ) : (
                  <span className="font-score text-xl text-floodlight tabular-nums shrink-0 px-3">
                    {m.homeScore}
                    <span className="text-muted mx-1">–</span>
                    {m.awayScore}
                  </span>
                )}

                {/* Away gamertag */}
                <div className="flex-1 min-w-0 px-3 text-right">
                  <span className="font-mono text-xs text-floodlight truncate block">
                    {m.awayGamertag}
                  </span>
                </div>
              </div>

              {/* Save button for unsaved scores */}
              {!hasScore && s && !isNaN(parseInt(s.home)) && !isNaN(parseInt(s.away)) && (
                <div className="px-3 py-2 border-t border-ink-line flex justify-end">
                  <Button variant="primary" size="sm" onClick={() => handleSave(m.id)}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}