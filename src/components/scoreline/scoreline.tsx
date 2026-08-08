// ─── Scoreline Strip (§2.5) ─────────────────────────────────
// The atom of the entire UI — a horizontal broadcast band.
import { cn } from "@/lib/utils";

const SQUAD_COLORS: Record<number, string> = {
  0: "bg-squad-0",
  1: "bg-squad-1",
  2: "bg-squad-2",
  3: "bg-squad-3",
  4: "bg-squad-4",
  5: "bg-squad-5",
  6: "bg-squad-6",
  7: "bg-squad-7",
};

export interface ScorelineProps {
  homeGamertag: string;
  awayGamertag: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeColorKey?: number;
  awayColorKey?: number;
  status?: "SCHEDULED" | "LIVE" | "COMPLETED" | "FORFEIT" | "VOID";
  variant?: "default" | "compact" | "large";
  className?: string;
  onClick?: () => void;
}

export function Scoreline({
  homeGamertag,
  awayGamertag,
  homeScore,
  awayScore,
  homeColorKey = 0,
  awayColorKey = 1,
  status = "SCHEDULED",
  variant = "default",
  className,
  onClick,
}: ScorelineProps) {
  const isLive = status === "LIVE";
  const hasScore = homeScore !== undefined && homeScore !== null && awayScore !== undefined && awayScore !== null;

  const sizeClasses = {
    compact: "h-10 text-xs",
    default: "h-14 text-sm",
    large: "h-20 text-base",
  }[variant];

  return (
    <div
      className={cn(
        "flex items-center w-full bg-ink-raised border border-ink-line rounded-md overflow-hidden",
        "transition-all duration-150",
        isLive && "border-kick",
        onClick && "cursor-pointer hover:border-muted",
        sizeClasses,
        className,
      )}
      onClick={onClick}
    >
      {/* Home squad color chip */}
      <div
        className={cn("w-1.5 h-full shrink-0", SQUAD_COLORS[homeColorKey] ?? SQUAD_COLORS[0])}
      />

      {/* Home gamertag */}
      <div className="flex-1 min-w-0 px-3 py-1">
        <span className="font-mono text-floodlight text-xs truncate block leading-tight">
          {homeGamertag}
        </span>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center shrink-0 px-3">
        {hasScore ? (
          <span
            className={cn(
              "font-score tabular-nums",
              variant === "large" ? "text-4xl" : variant === "compact" ? "text-lg" : "text-2xl",
              isLive && "text-kick animate-pulse",
              !isLive && "text-floodlight",
            )}
          >
            {homeScore}
            <span className={cn("mx-1", isLive ? "text-kick" : "text-muted")}>
              –
            </span>
            {awayScore}
          </span>
        ) : (
          <span className="font-score text-muted tabular-nums text-2xl">
            –&ensp;–
          </span>
        )}
      </div>

      {/* Away gamertag */}
      <div className="flex-1 min-w-0 px-3 py-1 text-right">
        <span className="font-mono text-floodlight text-xs truncate block leading-tight">
          {awayGamertag}
        </span>
      </div>

      {/* Away squad color chip */}
      <div
        className={cn("w-1.5 h-full shrink-0", SQUAD_COLORS[awayColorKey] ?? SQUAD_COLORS[1])}
      />
    </div>
  );
}