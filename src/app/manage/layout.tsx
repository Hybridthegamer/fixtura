// ─── Manage Layout ──────────────────────────────────────────
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

export default async function ManageLayout({ children }: { children: ReactNode }) {
  // Every /manage/* screen is organizer-only. Individual pages that mutate
  // data still re-derive role and tenancy server-side per §11 — this is a
  // page-level guard so the console itself isn't exposed to signed-out
  // visitors, not a substitute for the per-action checks.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-dvh bg-ink">
      <header className="border-b border-ink-line bg-ink-raised">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/manage" className="font-score text-lg text-floodlight tracking-[0.01em]">
            FIXTURA
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-xs text-muted hover:text-floodlight">
              Dashboard
            </Link>
            <Link
              href="/manage/new"
              className="bg-kick text-floodlight rounded-md px-3 py-1.5 text-xs font-medium hover:bg-kick/90 transition-colors"
            >
              New Tournament
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}