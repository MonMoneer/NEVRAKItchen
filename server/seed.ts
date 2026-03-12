/**
 * Seeds default element definitions into the database.
 * Run with: npx tsx server/seed.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { elementDefinitions, users } from "../shared/schema";
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

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
