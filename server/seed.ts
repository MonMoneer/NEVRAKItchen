/**
 * Seeds default element definitions into the database.
 * Run with: npx tsx server/seed.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  elementDefinitions,
  users,
  dreamHomeFinishes,
  dreamHomePrices,
  tallHeights,
  pricingSettings,
} from "../shared/schema";
import { db as appDb } from "./db";
import { scryptSync, randomBytes } from "crypto";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const defaultElements = [
  // Electrical
  { name: "Socket",       category: "electrical", icon: "⚡", defaultWidth: 15, defaultDepth: 5 },
  { name: "Switch",       category: "electrical", icon: "🔘", defaultWidth: 10, defaultDepth: 5 },
  { name: "Outlet",       category: "electrical", icon: "🔌", defaultWidth: 15, defaultDepth: 5 },
  { name: "Light Point",  category: "electrical", icon: "💡", defaultWidth: 15, defaultDepth: 15 },
  // Plumbing
  { name: "Sink",         category: "plumbing",   icon: "🚿", defaultWidth: 60, defaultDepth: 50 },
  { name: "Drain",        category: "plumbing",   icon: "💧", defaultWidth: 20, defaultDepth: 20 },
  { name: "Water Supply", category: "plumbing",   icon: "🚰", defaultWidth: 15, defaultDepth: 10 },
  { name: "Water Heater", category: "plumbing",   icon: "🫙", defaultWidth: 50, defaultDepth: 50 },
  // Appliances
  { name: "Fridge",       category: "appliance",  icon: "🧊", defaultWidth: 65, defaultDepth: 65 },
  { name: "Oven",         category: "appliance",  icon: "🔥", defaultWidth: 60, defaultDepth: 60 },
  { name: "Dishwasher",   category: "appliance",  icon: "🫧", defaultWidth: 60, defaultDepth: 55 },
  { name: "Microwave",    category: "appliance",  icon: "📦", defaultWidth: 50, defaultDepth: 35 },
  { name: "Washing Machine", category: "appliance", icon: "🌀", defaultWidth: 60, defaultDepth: 55 },
  { name: "Hood",         category: "appliance",  icon: "🌬️", defaultWidth: 90, defaultDepth: 50 },
];

const defaultUsers = [
  { username: "admin",       password: "admin123",  role: "admin"       },
  { username: "sales",       password: "sales123",  role: "sales"       },
  { username: "technician",  password: "tech123",   role: "technician"  },
];

async function seed() {
  console.log("Seeding element definitions…");

  for (const el of defaultElements) {
    await db
      .insert(elementDefinitions)
      .values({ ...el, isActive: true })
      .onConflictDoNothing();
  }
  console.log(`✓ Seeded ${defaultElements.length} element definitions`);

  console.log("Seeding default users…");
  for (const u of defaultUsers) {
    await db
      .insert(users)
      .values({ username: u.username, passwordHash: hashPassword(u.password), role: u.role })
      .onConflictDoNothing();
  }
  console.log(`✓ Seeded ${defaultUsers.length} users`);

  await pool.end();
}

// Only auto-run the CLI seeder when invoked directly (e.g. `tsx server/seed.ts`)
// — not when imported by server/index.ts.
const isMain = (() => {
  try {
    // import.meta.url is available in ESM
    // @ts-ignore
    return typeof import.meta !== "undefined" && import.meta.url && process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

// ─── Dream Home pricing seed (idempotent, called from server startup) ────────

const FINISHES = [
  { name: "Embossed Metal Series",       system: "Sheet Metal Fabrication",   sortOrder: 1 },
  { name: "Fabricated Metal Art",        system: "Sheet Metal Fabrication",   sortOrder: 2 },
  { name: "Micro Crystalline",           system: "Sheet Metal — Flat Panel",  sortOrder: 3 },
  { name: "Wood / Stone / High Gloss",   system: "Sheet Metal — Flat Panel",  sortOrder: 4 },
  { name: "Solid Matte / Soft Touch",    system: "Sheet Metal — Flat Panel",  sortOrder: 5 },
  { name: "Native SS",                   system: "Sheet Metal — Flat Panel",  sortOrder: 6 },
  { name: "PVD SS",                      system: "Sheet Metal — Flat Panel",  sortOrder: 7 },
  { name: "Extruded Artistry Profile",   system: "Profile-Bonded Extrusion",  sortOrder: 8 },
  { name: "Sintered Stone",              system: "Profile-Bonded Extrusion",  sortOrder: 9 },
  { name: "Tempered Glass",              system: "Aluminum Framed Glass",     sortOrder: 10 },
  { name: "Art Glass",                   system: "Aluminum Framed Glass",     sortOrder: 11 },
];

// Ordered to match FINISHES[0..10]
const BASE_PRICES = [2420, 1980, 1870, 1980, 1650, 1650, 2090, 2090, 2640, 1760, 2200];
const WALL_PRICES = [2255, 1815, 1705, 1815, 1430, 1430, 1925, 1925, 2475, 1595, 2035];

const DH_TALL: Array<{ h: number; p: number[] }> = [
  { h: 1900, p: [5940, 4620, 4510, 4620, 3740, 3740, 5115, 5115, 6600, 4290, 5390] },
  { h: 2000, p: [6160, 4730, 4620, 4730, 3850, 3850, 5280, 5280, 6820, 4400, 5500] },
  { h: 2100, p: [6380, 4840, 4730, 4840, 3960, 3960, 5445, 5445, 7040, 4510, 5665] },
  { h: 2200, p: [6710, 5060, 4895, 5060, 4070, 4070, 5610, 5610, 7370, 4675, 5885] },
  { h: 2400, p: [7040, 5335, 5170, 5335, 4290, 4290, 5940, 5940, 7810, 4950, 6270] },
  { h: 2600, p: [7480, 5610, 5445, 5610, 4510, 4510, 6325, 6325, 8250, 5225, 6600] },
];

const PLAT_TALL: Array<{ h: number; p: number[] }> = [
  { h: 2700, p: [9020, 7480, 6710, 6930, 6380, 6380, 7480, 7480, 10780, 6380, 8030] },
  { h: 2800, p: [9240, 7700, 6820, 7040, 6490, 6490, 7700, 7700, 11000, 6490, 8250] },
  { h: 2900, p: [9460, 7810, 6930, 7150, 6710, 6710, 7810, 7810, 11330, 6710, 8470] },
  { h: 3000, p: [9680, 8030, 7040, 7260, 6820, 6820, 8030, 8030, 11660, 6820, 8580] },
];

export async function seedDreamHomePricing() {
  // 1. Seed finishes if empty
  const existingFinishes = await appDb.select().from(dreamHomeFinishes);
  if (existingFinishes.length === 0) {
    await appDb.insert(dreamHomeFinishes).values(FINISHES);
    console.log("[seed] Inserted 11 Dream Home finishes");
  }

  // 2. Re-read finishes to get IDs
  const finishes = await appDb.select().from(dreamHomeFinishes);
  const finishIds = finishes.sort((a, b) => a.sortOrder - b.sortOrder).map((f) => f.id);

  // 3. Seed dream_home_prices if empty
  const existingPrices = await appDb.select().from(dreamHomePrices);
  if (existingPrices.length === 0) {
    const rows = [
      ...BASE_PRICES.map((p, i) => ({ cabinetType: "base", finishId: finishIds[i], priceCnyPerM: String(p) })),
      ...WALL_PRICES.map((p, i) => ({ cabinetType: "wall_cabinet", finishId: finishIds[i], priceCnyPerM: String(p) })),
    ];
    await appDb.insert(dreamHomePrices).values(rows);
    console.log("[seed] Inserted 22 Dream Home price rows");
  }

  // 4. Seed tall_heights if empty
  const existingTall = await appDb.select().from(tallHeights);
  if (existingTall.length === 0) {
    const rows = [
      ...DH_TALL.flatMap(({ h, p }) =>
        p.map((price, i) => ({ source: "dream_home", heightMm: h, finishId: finishIds[i], priceCnyPerM: String(price) })),
      ),
      ...PLAT_TALL.flatMap(({ h, p }) =>
        p.map((price, i) => ({ source: "platinum", heightMm: h, finishId: finishIds[i], priceCnyPerM: String(price) })),
      ),
    ];
    await appDb.insert(tallHeights).values(rows);
    console.log(`[seed] Inserted ${rows.length} tall height rows`);
  }

  // 5. Seed pricing_settings if empty
  const existingSettings = await appDb.select().from(pricingSettings);
  if (existingSettings.length === 0) {
    await appDb.insert(pricingSettings).values({});
    console.log("[seed] Inserted default pricing_settings row");
  }
}
