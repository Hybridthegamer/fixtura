// ─── NACOS Super League Seed Script (§15) ───────────────────
// Creates the demo/regression fixture: 4 squads, 20 players, ₦5k entry, ₦100k pool.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding NACOS Super League...");

  // Clean existing data
  await prisma.standing.deleteMany();
  await prisma.match.deleteMany();
  await prisma.squadMatchup.deleteMany();
  await prisma.gameweek.deleteMany();
  await prisma.group.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.award.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.customField.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.squadMember.deleteMany();
  await prisma.squad.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.orgMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // ─── Organization ────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      id: "org_nacos",
      slug: "nacos-csd",
      name: "NACOS Computer Science Department",
      bio: "National Association of Computer Science Students — RSU Chapter.",
      verificationTier: "UNVERIFIED",
      contactEmail: "nacos@rsu.edu.ng",
      contactPhone: "+2348000000000",
      createdById: "user_admin",
    },
  });

  await prisma.orgMember.create({
    data: { orgId: org.id, userId: "user_admin", role: "ORG_OWNER" },
  });

  // ─── Users ───────────────────────────────────────────────
  const levelNames = ["100", "200", "300", "400"];
  const playerNames: Record<string, string[]> = {
    "100": ["Chibueze", "Emeka", "Ifeanyi", "Obinna", "Kelechi"],
    "200": ["Tunde", "Femi", "Dayo", "Segun", "Bola"],
    "300": ["Chidi", "Nnamdi", "Uche", "Ikenna", "Onyeka"],
    "400": ["Adebayo", "Olumide", "Taiwo", "Kehinde", "Gbenga"],
  };

  // Create admin user
  await prisma.user.create({
    data: {
      id: "user_admin",
      email: "admin@fixtura.app",
      handle: "admin",
      displayName: "Fixtura Admin",
    },
  });

  const players: Record<string, string[]> = {};
  for (const [level, names] of Object.entries(playerNames)) {
    players[level] = [];
    for (const name of names) {
      const id = `player_${level}_${name.toLowerCase()}`;
      await prisma.user.create({
        data: {
          id,
          email: `${name.toLowerCase()}.${level}@example.com`,
          handle: `${name.toLowerCase()}_${level}`,
          displayName: name,
          defaultGamertag: `${name}_${level}`,
          platform: "PS5",
        },
      });
      players[level].push(id);
    }
  }

  // ─── Tournament ──────────────────────────────────────────
  const tournament = await prisma.tournament.create({
    data: {
      id: "tournament_nacos_super_league",
      orgId: org.id,
      slug: "nacos-super-league",
      name: "NACOS Super League",
      game: "EA_FC_26",
      platform: "PS5",
      status: "REGISTRATION_OPEN",
      visibility: "PUBLIC",
      summary: "The NACOS Super League — Level 100 vs 200 vs 300 vs 400. 5 players per squad, cross-squad individual round robin.",
      entryFeeKobo: 500000, // ₦5,000 in kobo
      feeBearer: "ORGANIZER",
      currency: "NGN",
      capacity: 20,
      entryMode: "SQUAD",
      squadSize: 5,
      formatKey: "CROSS_SQUAD_INDIVIDUAL_RR",
      formatConfig: JSON.stringify({ squadsPerMatchup: 2, matchupsPerGameweek: 2, squadSize: 5 }),
      seed: 42,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakersSquad: JSON.stringify(["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD_POINTS", "HEAD_TO_HEAD_GD", "MANUAL_OVERRIDE"]),
      tiebreakersIndividual: JSON.stringify(["POINTS", "GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD_POINTS", "HEAD_TO_HEAD_GD", "WIN_PERCENTAGE", "MANUAL_OVERRIDE"]),
      forfeitScoreline: "3-0",
      disputeWindowHours: 12,
      prizePoolKobo: 10000000, // ₦100,000 in kobo
      prizeSplit: JSON.stringify({
        squadChampion: 6000000,    // ₦60,000
        bestIndividual: 2000000,   // ₦20,000
        goldenBoot: 1200000,       // ₦12,000
        ironGlove: 800000,         // ₦8,000
      }),
      registrationOpensAt: new Date(),
      registrationClosesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      startsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      venue: "RSU Computer Science Department, Port Harcourt",
    },
  });

  // ─── Custom Fields ───────────────────────────────────────
  await prisma.customField.createMany({
    data: [
      { tournamentId: tournament.id, key: "matric_number", label: "Matric Number", type: "text", required: true, isUnique: true, position: 0 },
      { tournamentId: tournament.id, key: "level", label: "Level", type: "select", required: true, options: JSON.stringify(["100", "200", "300", "400"]), position: 1 },
    ],
  });

  // ─── Squads ──────────────────────────────────────────────
  const squadColors = [0, 1, 2, 3]; // kick, blue, turf, amber
  const squadIds: Record<string, string> = {};

  for (let i = 0; i < levelNames.length; i++) {
    const level = levelNames[i];
    const squadId = `squad_level_${level}`;
    squadIds[level] = squadId;

    await prisma.squad.create({
      data: {
        id: squadId,
        tournamentId: tournament.id,
        name: `Level ${level}`,
        shortName: `L${level}`,
        colorKey: squadColors[i],
        inviteCode: `NACOS${level}`,
      },
    });

    // Add squad members
    for (let j = 0; j < players[level].length; j++) {
      await prisma.squadMember.create({
        data: {
          squadId,
          userId: players[level][j],
          position: j,
        },
      });
    }
  }

  // ─── Registrations ───────────────────────────────────────
  for (const [level, playerIds] of Object.entries(players)) {
    for (const userId of playerIds) {
      const username = userId.split("_").pop()!;
      await prisma.registration.create({
        data: {
          tournamentId: tournament.id,
          userId,
          squadId: squadIds[level],
          gamertag: `${username}_${level}`,
          status: "PAID",
          fieldValues: JSON.stringify({
            matric_number: `RSU/CSD/${level}/00${playerIds.indexOf(userId) + 1}`,
            level,
          }),
        },
      });
    }
  }

  // ─── Awards ──────────────────────────────────────────────
  await prisma.award.createMany({
    data: [
      { tournamentId: tournament.id, key: "SQUAD_CHAMPION", label: "Squad Champion", amountKobo: 6000000 },
      { tournamentId: tournament.id, key: "BEST_INDIVIDUAL", label: "Best Individual", amountKobo: 2000000 },
      { tournamentId: tournament.id, key: "GOLDEN_BOOT", label: "Golden Boot", amountKobo: 1200000 },
      { tournamentId: tournament.id, key: "IRON_GLOVE", label: "Iron Glove", amountKobo: 800000 },
    ],
  });

  console.log("✅ NACOS Super League seeded successfully!");
  console.log(`   Tournament: ${tournament.name}`);
  console.log(`   Slug: ${tournament.slug}`);
  console.log(`   4 squads, 20 players, ₦5,000 entry, ₦100,000 pool`);
  console.log(`   Entry fee: ${tournament.entryFeeKobo / 100} NGN`);
  console.log(`   Prizes: Squad ₦60,000 | Best Individual ₦20,000 | Golden Boot ₦12,000 | Iron Glove ₦8,000`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });