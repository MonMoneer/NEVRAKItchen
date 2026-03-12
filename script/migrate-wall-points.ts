import { pool } from "../server/db";

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS wall_points (
    id serial PRIMARY KEY,
    space_id integer NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    type text NOT NULL,
    wall_id text NOT NULL DEFAULT '',
    distance_cm integer NOT NULL DEFAULT 0,
    height_cm integer NOT NULL DEFAULT 0,
    photo text DEFAULT '',
    note text NOT NULL DEFAULT '',
    pos_x integer NOT NULL DEFAULT 0,
    pos_y integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  console.log("wall_points table created (or already exists)");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
