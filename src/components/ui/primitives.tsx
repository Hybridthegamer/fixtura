// ─── UI Primitives ──────────────────────────────────────────
// shadcn-inspired, restyled to Fixtura brand.
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-kick text-floodlight hover:bg-kick/90 active:bg-kick/80",
    secondary: "bg-ink-raised text-floodlight hover:bg-ink-line border border-ink-line",
    outline: "border border-ink-line text-floodlight hover:bg-ink-raised",
    ghost: "text-muted hover:text-floodlight hover:bg-ink-raised",
    danger: "bg-flag text-floodlight hover:bg-flag/90",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs h-8",
    md: "px-4 py-2 text-sm h-10",
    lg: "px-6 py-3 text-base h-12",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-all duration-150 focus-visible:outline-2 focus-visible:outline-kick focus-visible:outline-offset-2",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: "default" | "success" | "warning" | "danger" | "live";
  children: React.ReactNode;
}) {
  const variants = {
    default: "bg-ink-line text-muted",
    success: "bg-turf/15 text-turf",
    warning: "bg-amber/15 text-amber",
    danger: "bg-flag/15 text-flag",
    live: "bg-kick/15 text-kick animate-pulse",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-ink-raised border border-ink-line rounded-lg p-4", className)}>
      {children}
    </div>
  );
}

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const mapping: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "live" }> = {
    DRAFT: { label: "Draft", variant: "default" },
    PUBLISHED: { label: "Published", variant: "default" },
    REGISTRATION_OPEN: { label: "Registration Open", variant: "live" },
    REGISTRATION_CLOSED: { label: "Registration Closed", variant: "warning" },
    SEEDING: { label: "Seeding", variant: "warning" },
    LIVE: { label: "Live", variant: "live" },
    COMPLETED: { label: "Completed", variant: "success" },
    CANCELLED: { label: "Cancelled", variant: "danger" },
    ARCHIVED: { label: "Archived", variant: "default" },
  };

  const m = mapping[status] ?? { label: status, variant: "default" as const };

  return <Badge variant={m.variant} className={className}>{m.label}</Badge>;
}