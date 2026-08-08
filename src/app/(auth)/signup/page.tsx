// ─── Sign Up Page ───────────────────────────────────────────
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUpAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/primitives";
import Link from "next/link";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signUpAction(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-score text-2xl text-floodlight tracking-[0.01em]">
            FIXTURA
          </h1>
          <p className="text-muted text-sm">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-flag/15 border border-flag/30 rounded-md px-4 py-2 text-flag text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted uppercase tracking-wider">Display Name</label>
            <input
              name="displayName"
              type="text"
              required
              placeholder="Your name"
              className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                         placeholder:text-muted/50 focus:outline-none focus:border-kick transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted uppercase tracking-wider">Handle</label>
            <input
              name="handle"
              type="text"
              required
              placeholder="your_handle"
              pattern="[a-z0-9_]{3,20}"
              title="3-20 chars: lowercase letters, numbers, underscores"
              className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                         placeholder:text-muted/50 focus:outline-none focus:border-kick transition-colors"
            />
            <p className="text-2xs text-muted">3–20 characters: a-z, 0-9, underscore</p>
          </div>

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
              minLength={10}
              placeholder="Minimum 10 characters"
              className="w-full bg-ink border border-ink-line rounded-md px-3 py-2 text-sm text-floodlight
                         placeholder:text-muted/50 focus:outline-none focus:border-kick transition-colors"
            />
          </div>

          <Button variant="primary" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-kick hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}