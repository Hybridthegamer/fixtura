// ─── Standings Table (§9.3) ─────────────────────────────────
"use client";

import { cn } from "@/lib/utils";

export interface StandingRow {
  entityId: string;
  entityName: string;
  squadId?: string;
  squadColorKey?: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
  rankShared: boolean;
  isViewer?: boolean;
}

interface StandingsTableProps {
  rows: StandingRow[];
  viewerId?: string;
  className?: string;
  compact?: boolean;
}

const SQUAD_COLORS: Record<number, string> = {
  0: "#FF2D6F", 1: "#2B9FFF", 2: "#2BD97C", 3: "#FFB43A",
  4: "#A855F7", 5: "#FF5A47", 6: "#14B8A6", 7: "#F97316",
};

export function StandingsTable({
  rows,
  viewerId,
  className,
  compact = false,
}: StandingsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted text-sm">
        No standings yet.
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-line text-muted text-xs uppercase tracking-wider">
            <th className="sticky left-0 bg-ink px-3 py-2 text-left w-10">#</th>
            <th className="sticky left-10 bg-ink px-3 py-2 text-left min-w-[120px]">
              {rows[0]?.squadId ? "Squad" : "Player"}
            </th>
            {!compact && (
              <>
                <th className="px-2 py-2 text-center w-10">P</th>
                <th className="px-2 py-2 text-center w-10">W</th>
                <th className="px-2 py-2 text-center w-10">D</th>
                <th className="px-2 py-2 text-center w-10">L</th>
                <th className="px-2 py-2 text-center w-12">GF</th>
                <th className="px-2 py-2 text-center w-12">GA</th>
                <th className="px-2 py-2 text-center w-12">GD</th>
              </>
            )}
            <th className="px-3 py-2 text-center font-bold w-12">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isViewer = viewerId && row.entityId === viewerId;
            const isFirst = row.rank === 1 && !row.rankShared;
            const color = row.squadColorKey !== undefined ? SQUAD_COLORS[row.squadColorKey] : undefined;

            return (
              <tr
                key={row.entityId}
                className={cn(
                  "border-b border-ink-line transition-all duration-150",
                  isViewer && "border-l-2 border-l-kick bg-ink-raised/50",
                  isFirst && "border-l-2 border-l-amber",
                  "hover:bg-ink-raised/30",
                )}
              >
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={cn(
                      "font-mono tabular-nums text-xs",
                      isFirst && !row.rankShared ? "text-amber font-bold" : "text-floodlight",
                    )}
                  >
                    {row.rank}
                    {row.rankShared && (
                      <sup className="text-muted ml-0.5">=</sup>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {color && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    <span className="font-medium text-floodlight truncate">
                      {row.entityName}
                    </span>
                  </div>
                </td>
                {!compact && (
                  <>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.played}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.won}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.drawn}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.lost}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.goalsFor}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-muted text-xs">
                      {row.goalsAgainst}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums text-xs">
                      <span
                        className={cn(
                          row.goalDiff > 0 ? "text-turf" : row.goalDiff < 0 ? "text-flag" : "text-muted",
                        )}
                      >
                        {row.goalDiff > 0 ? "+" : ""}{row.goalDiff}
                      </span>
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5 text-center font-mono tabular-nums font-bold text-floodlight">
                  {row.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}