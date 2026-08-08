// ─── Sign In Page ───────────────────────────────────────────
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/primitives";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signInAction(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-score text-2xl text-floodlight tracking-[0.01em]">
            FIXTURA
          </h1>
          <p className="text-muted text-sm">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-flag/15 border border-flag/30 rounded-md px-4 py-2 text-flag text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted uppercase tracking-wider">Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                         placeholder:text-muted/50 focus:outline-none focus:border-kick transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted uppercase tracking-wider">Password</label>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••••"
              className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                         placeholder:text-muted/50 focus:outline-none focus:border-kick transition-colors"
            />
          </div>

          <Button variant="primary" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-kick hover:underline">
            Create one
          </Link>
        </div>

        <div className="relative">
          <hr className="border-ink-line" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-ink px-2 text-xs text-muted">
            or
          </span>
        </div>

        <div className="flex gap-2">
          <form action="/api/auth/signin/google" method="POST" className="flex-1">
            <Button variant="secondary" className="w-full" type="submit">
              Google
            </Button>
          </form>
          <form action="/api/auth/signin/discord" method="POST" className="flex-1">
            <Button variant="secondary" className="w-full" type="submit">
              Discord
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}