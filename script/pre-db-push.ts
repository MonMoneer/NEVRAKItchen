// Runs BEFORE `drizzle-kit push` on every deploy.
// Drops old pricing tables so drizzle-kit doesn't prompt
// "Is X renamed from Y?" and hang in the non-interactive CI shell.

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[pre-db-push] DATABASE_URL missing — skipping");
  process.exit(0);
}

const pool = new Pool({ connectionString });

const OLD_PRICING_TABLES = [
  "finish_price_matrix",
  "price_matrix",
  "depth_options",
  "height_options",
  "pricing_config",
  "finishing_options",
];

async function main() {
  for (const table of OLD_PRICING_TABLES) {
    try {
      await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`[pre-db-push] dropped ${table}`);
    } catch (err: any) {
      console.error(`[pre-db-push] failed to drop ${table}:`, err.message);
    }
  }
  await pool.end();
  console.log("[pre-db-push] done");
}

main().catch((err) => {
  console.error("[pre-db-push] fatal:", err);
  process.exit(1);
});
