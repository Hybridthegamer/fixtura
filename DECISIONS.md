# FIXTURA — Implementation Decisions

Choices made where the build brief was silent, as required by §0 rule 6.

## 2026-08-08

1. **Next.js 16 instead of 15.** Latest stable at scaffolding time. Backward-compatible with the brief's App Router, RSC, and Server Actions requirements.

2. **Tailwind CSS v4 with `@theme`.** v4 uses CSS-first configuration via `@theme` blocks, replacing `tailwind.config.ts`. Design tokens from §2.3 are declared directly in `globals.css`.

3. **Lucide React for icons.** Lightweight, tree-shakeable, matches the broadcast aesthetic.

4. **Zustand for client state.** Minimal state management for the results console offline queue and optimistic updates. No Redux — overkill for the data shapes here.

5. **react-hot-toast for notifications.** In-app toast notifications. Lightweight, accessible.

6. **class-variance-authority + clsx + tailwind-merge** for component variants following shadcn/ui patterns.

7. **No shadcn/ui CLI init.** Building primitives directly from the brief's spec. The styling is too specific to use default shadcn — everything must look like Fixtura, not like shadcn.

8. **Prisma v7 with `@prisma/adapter-neon`.** Latest stable at time of build. The adapter is included but the neon driver import pattern in v7 differs slightly from the brief; using `@prisma/adapter-neon` with `Pool` from `@neondatabase/serverless`.

9. **Auth.js v5 (next-auth@beta).** The beta tag is required for App Router compatibility. The brief says "Auth.js v5 (NextAuth)" — the package is `next-auth@beta`.

10. **TypeScript `target: "ES2017"`** as the scaffold generated. The brief doesn't specify, and this is the Next.js default. Adequate for all target browsers.

11. **No `srcDir` flag misinterpretation.** We're using `src/` directory (what Next.js calls `srcDir`), which the scaffold created correctly.

12. **Database: SQLite for local dev, Neon for production.** Since we don't have a Neon connection in this environment, we'll use SQLite for local development and testing. Prisma schema supports both with a simple provider swap. The engine tests (§14) need no database at all.