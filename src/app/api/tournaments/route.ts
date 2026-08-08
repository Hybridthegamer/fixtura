// ─── API: Create Tournament ─────────────────────────────────
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, game, platform, formatKey, entryFeeKobo, capacity, entryMode, squadSize } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "Name and slug are required." }, { status: 400 });
  }

  let org = await prisma.organization.findFirst({
    where: { createdById: session.user.id },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        slug: session.user.handle ?? session.user.id,
        name: `${session.user.name ?? "Organizer"}'s Org`,
        createdById: session.user.id,
      },
    });
    await prisma.orgMember.create({
      data: { orgId: org.id, userId: session.user.id, role: "ORG_OWNER" },
    });
  }

  const existing = await prisma.tournament.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already taken." }, { status: 409 });
  }

  const tournament = await prisma.tournament.create({
    data: {
      orgId: org.id,
      slug,
      name,
      game: game ?? "EA_FC_26",
      platform: platform ?? "PS5",
      formatKey: formatKey ?? "CROSS_SQUAD_INDIVIDUAL_RR",
      entryFeeKobo: entryFeeKobo ?? 0,
      capacity: capacity ?? 20,
      entryMode: entryMode ?? "INDIVIDUAL",
      squadSize: squadSize ?? undefined,
      status: "DRAFT",
    },
  });

  return NextResponse.json({ slug: tournament.slug, id: tournament.id });
}