# NIVRA — Dream Home Pricing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the entire pricing system (admin tab + LayerPanel math) with the Dream Home CNY-based formula across 7 layer types, prefilled from the Fadior Excel sheet.

**Architecture:** Drop 6 old pricing tables, create 4 new tables (finishes, prices, tall_heights, settings). Pure client-side calculation via new `dream-home-pricing.ts` util. New admin Pricing tab with 4 cards. LayerPanel card per layer type.

**Tech Stack:** Drizzle ORM (PostgreSQL), Express, React + TanStack Query, Tailwind, Zustand. Deployed on Railway (auto-push from GitHub main).

**Linked design:** `/Users/Admin/.claude/plans/nivra-dream-home-pricing.md`

---

## Prerequisites

- Working directory: `/Users/Admin/Documents/MONEER/NIVRA/REbilt`
- `railway.json` runs `npm run db:push && ... node dist/index.cjs` on every deploy — so all schema changes ship automatically.
- `db:push` (Drizzle) will apply schema diffs; seeds must be idempotent and live in a `server/seed.ts` called on boot.

### Pre-execution codebase findings (applied to tasks below)

1. **`server/index.ts` uses raw SQL `runMigrations()`** (not Drizzle migrations). It currently `CREATE TABLE IF NOT EXISTS` for `price_matrix`, `depth_options`, `height_options`. These **must be removed** and replaced with `DROP TABLE IF EXISTS` for all 6 old pricing tables. Seed is called from this same function.
2. **`Layer.finishId` is currently `string`** (see `kitchen-engine.ts:35`). Target is `number | null`. Normalization on project load is needed (parse `"1"` → `1`).
3. **`LayerType` currently = `"base" | "wall_cabinet" | "tall" | "island" | "divider" | "drawer"`** (kitchen-engine.ts:14). Target = `"base" | "wall_cabinet" | "tall" | "island" | "end_panel" | "filler" | "drawer"`. `DEFAULT_HEIGHTS` record (line 89–96) must also be updated. `export.ts` and `useCanvasStore.ts` may also reference the old types — check before commit.
4. **Old `finishing_options` table is used by the seed data in the existing runMigrations** — confirmed no SQL creates it there, only schema. Safe to drop.

---

## Task 1: DB Schema — Drop old pricing tables, create new ones

**Files:**
- Modify: `shared/schema.ts`
- Create: `server/seed.ts`
- Modify: `server/index.ts` (call seed on boot)

**Step 1: Remove old pricing tables from schema**

Open `shared/schema.ts` and DELETE these exports and their types:
- `pricingConfig` (+ `insertPricingConfigSchema`, `PricingConfig`, `InsertPricingConfig`)
- `finishingOptions` (+ all related)
- `priceMatrix` (+ all related)
- `depthOptions` (+ all related)
- `heightOptions` (+ all related)
- `finishPriceMatrix` (+ all related)

**Step 2: Add new pricing tables to schema**

Add after the imports in `shared/schema.ts`:

```ts
// ─── Dream Home Pricing System ──────────────────────────────────────────────

export const dreamHomeFinishes = pgTable("dream_home_finishes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  system: text("system").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const dreamHomePrices = pgTable("dream_home_prices", {
  id: serial("id").primaryKey(),
  cabinetType: text("cabinet_type").notNull(), // 'base' | 'wall_cabinet'
  finishId: integer("finish_id").notNull().references(() => dreamHomeFinishes.id, { onDelete: "cascade" }),
  priceCnyPerM: numeric("price_cny_per_m", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const tallHeights = pgTable("tall_heights", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // 'dream_home' | 'platinum'
  heightMm: integer("height_mm").notNull(),
  finishId: integer("finish_id").notNull().references(() => dreamHomeFinishes.id, { onDelete: "cascade" }),
  priceCnyPerM: numeric("price_cny_per_m", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const pricingSettings = pgTable("pricing_settings", {
  id: serial("id").primaryKey(),
  fxRate: numeric("fx_rate", { precision: 10, scale: 4 }).notNull().default("0.51"),
  packingMult: numeric("packing_mult", { precision: 4, scale: 2 }).notNull().default("1.10"),
  shippingMult: numeric("shipping_mult", { precision: 4, scale: 2 }).notNull().default("1.10"),
  marginDiv: numeric("margin_div", { precision: 4, scale: 2 }).notNull().default("0.50"),
  decorativeCnyPerM2: numeric("decorative_cny_per_m2", { precision: 10, scale: 2 }).notNull().default("880"),
  drawerFlatAed: numeric("drawer_flat_aed", { precision: 10, scale: 2 }).notNull().default("500"),
});

export const insertDreamHomeFinishSchema = createInsertSchema(dreamHomeFinishes).omit({ id: true });
export const insertDreamHomePriceSchema = createInsertSchema(dreamHomePrices).omit({ id: true });
export const insertTallHeightSchema = createInsertSchema(tallHeights).omit({ id: true });
export const insertPricingSettingsSchema = createInsertSchema(pricingSettings).omit({ id: true });

export type DreamHomeFinish = typeof dreamHomeFinishes.$inferSelect;
export type InsertDreamHomeFinish = z.infer<typeof insertDreamHomeFinishSchema>;
export type DreamHomePrice = typeof dreamHomePrices.$inferSelect;
export type InsertDreamHomePrice = z.infer<typeof insertDreamHomePriceSchema>;
export type TallHeight = typeof tallHeights.$inferSelect;
export type InsertTallHeight = z.infer<typeof insertTallHeightSchema>;
export type PricingSettings = typeof pricingSettings.$inferSelect;
export type InsertPricingSettings = z.infer<typeof insertPricingSettingsSchema>;
```

**Step 3: Create idempotent seed file**

Create `server/seed.ts`:

```ts
import { db } from "./db";
import {
  dreamHomeFinishes,
  dreamHomePrices,
  tallHeights,
  pricingSettings,
} from "@shared/schema";
import { sql } from "drizzle-orm";

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
const BASE_PRICES       = [2420, 1980, 1870, 1980, 1650, 1650, 2090, 2090, 2640, 1760, 2200];
const WALL_PRICES       = [2255, 1815, 1705, 1815, 1430, 1430, 1925, 1925, 2475, 1595, 2035];

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
  const existingFinishes = await db.select().from(dreamHomeFinishes);
  if (existingFinishes.length === 0) {
    await db.insert(dreamHomeFinishes).values(FINISHES);
    console.log("[seed] Inserted 11 Dream Home finishes");
  }

  // 2. Re-read finishes to get IDs
  const finishes = await db.select().from(dreamHomeFinishes);
  const finishIds = finishes.sort((a, b) => a.sortOrder - b.sortOrder).map((f) => f.id);

  // 3. Seed dream_home_prices if empty
  const existingPrices = await db.select().from(dreamHomePrices);
  if (existingPrices.length === 0) {
    const rows = [
      ...BASE_PRICES.map((p, i) => ({ cabinetType: "base", finishId: finishIds[i], priceCnyPerM: String(p) })),
      ...WALL_PRICES.map((p, i) => ({ cabinetType: "wall_cabinet", finishId: finishIds[i], priceCnyPerM: String(p) })),
    ];
    await db.insert(dreamHomePrices).values(rows);
    console.log("[seed] Inserted 22 Dream Home price rows");
  }

  // 4. Seed tall_heights if empty
  const existingTall = await db.select().from(tallHeights);
  if (existingTall.length === 0) {
    const rows = [
      ...DH_TALL.flatMap(({ h, p }) =>
        p.map((price, i) => ({ source: "dream_home", heightMm: h, finishId: finishIds[i], priceCnyPerM: String(price) })),
      ),
      ...PLAT_TALL.flatMap(({ h, p }) =>
        p.map((price, i) => ({ source: "platinum", heightMm: h, finishId: finishIds[i], priceCnyPerM: String(price) })),
      ),
    ];
    await db.insert(tallHeights).values(rows);
    console.log(`[seed] Inserted ${rows.length} tall height rows`);
  }

  // 5. Seed pricing_settings if empty
  const existingSettings = await db.select().from(pricingSettings);
  if (existingSettings.length === 0) {
    await db.insert(pricingSettings).values({});
    console.log("[seed] Inserted default pricing_settings row");
  }
}
```

**Step 4: Update `server/index.ts` — drop old tables and call seed**

In `server/index.ts`, locate the existing `async function runMigrations()` block. Make these changes:

**(a)** Add a new import at the top:
```ts
import { seedDreamHomePricing } from "./seed";
```

**(b)** Inside `runMigrations()`, REMOVE these 3 `CREATE TABLE IF NOT EXISTS` blocks that create the old pricing tables (they currently recreate `price_matrix`, `depth_options`, `height_options` on every boot — remove them entirely):

- `CREATE TABLE IF NOT EXISTS price_matrix ...`
- `CREATE TABLE IF NOT EXISTS depth_options ...`
- `CREATE TABLE IF NOT EXISTS height_options ...`

**(c)** At the END of the `try { ... }` block inside `runMigrations()`, add these explicit drops of ALL 6 old pricing tables, followed by seed call:

```ts
// Drop old pricing tables (replaced by Dream Home schema)
await pool.query(`DROP TABLE IF EXISTS finish_price_matrix CASCADE`);
await pool.query(`DROP TABLE IF EXISTS price_matrix CASCADE`);
await pool.query(`DROP TABLE IF EXISTS depth_options CASCADE`);
await pool.query(`DROP TABLE IF EXISTS height_options CASCADE`);
await pool.query(`DROP TABLE IF EXISTS pricing_config CASCADE`);
await pool.query(`DROP TABLE IF EXISTS finishing_options CASCADE`);

// Seed new Dream Home pricing tables (idempotent)
await seedDreamHomePricing();
```

This runs BEFORE `registerRoutes` is called (see the existing `(async () => { await runMigrations(); await registerRoutes(...); ... })()` block at the bottom of the file).

Note: `db:push` will then create the new Dream Home tables on the next deploy, because they now exist in `shared/schema.ts` but not in the DB after the drops.

**Step 5: Build and verify**

Run: `cd /Users/Admin/Documents/MONEER/NIVRA/REbilt && npm run build 2>&1 | tail -30`
Expected: Clean build, zero errors. Any TypeScript errors here mean `shared/schema.ts` still references something old — fix and re-run.

⚠️ **Do NOT** commit until all pricing references are cleaned up in Task 2 (the build will still fail because `storage.ts` and `routes.ts` still import the deleted types).

---

## Task 2: Storage Layer — Remove old pricing methods, add new ones

**Files:**
- Modify: `server/storage.ts`

**Step 1: Remove old pricing interface methods and implementations**

In `server/storage.ts`, DELETE these interface methods AND their implementations:
- All `getPricingConfigs`, `updatePricingConfig`, `createPricingConfig`, `deletePricingConfig`
- All `getFinishingOptions`, `updateFinishingOption`, `createFinishingOption`, `deleteFinishingOption`
- All `getPriceMatrix`, `upsertPriceMatrix`, `deletePriceMatrix`
- All `getDepthOptions`, `createDepthOption`, `deleteDepthOption`
- All `getHeightOptions`, `createHeightOption`, `deleteHeightOption`
- All `getFinishPriceMatrix`, `upsertFinishPriceMatrix`

Also remove their imports at the top of the file.

**Step 2: Add new pricing storage imports**

Add to the top of `server/storage.ts`:

```ts
import {
  // ... existing imports, plus:
  type DreamHomeFinish, type InsertDreamHomeFinish,
  type DreamHomePrice, type InsertDreamHomePrice,
  type TallHeight, type InsertTallHeight,
  type PricingSettings, type InsertPricingSettings,
  dreamHomeFinishes, dreamHomePrices, tallHeights, pricingSettings,
} from "@shared/schema";
```

**Step 3: Add new interface methods to `IStorage`**

```ts
// Dream Home Pricing
listDreamHomeFinishes(): Promise<DreamHomeFinish[]>;
updateDreamHomeFinish(id: number, updates: Partial<InsertDreamHomeFinish>): Promise<DreamHomeFinish | undefined>;

listDreamHomePrices(): Promise<DreamHomePrice[]>;
upsertDreamHomePrice(entry: InsertDreamHomePrice): Promise<DreamHomePrice>;

listTallHeights(): Promise<TallHeight[]>;
upsertTallHeight(entry: InsertTallHeight): Promise<TallHeight>;

getPricingSettings(): Promise<PricingSettings>;
updatePricingSettings(updates: Partial<InsertPricingSettings>): Promise<PricingSettings>;
```

**Step 4: Implement the methods in `DatabaseStorage`**

```ts
// ── Dream Home Pricing ────────────────────────────────────────────────────

async listDreamHomeFinishes(): Promise<DreamHomeFinish[]> {
  return db.select().from(dreamHomeFinishes).orderBy(dreamHomeFinishes.sortOrder);
}

async updateDreamHomeFinish(id: number, updates: Partial<InsertDreamHomeFinish>): Promise<DreamHomeFinish | undefined> {
  const [updated] = await db.update(dreamHomeFinishes).set(updates).where(eq(dreamHomeFinishes.id, id)).returning();
  return updated;
}

async listDreamHomePrices(): Promise<DreamHomePrice[]> {
  return db.select().from(dreamHomePrices);
}

async upsertDreamHomePrice(entry: InsertDreamHomePrice): Promise<DreamHomePrice> {
  const [existing] = await db
    .select()
    .from(dreamHomePrices)
    .where(and(eq(dreamHomePrices.cabinetType, entry.cabinetType), eq(dreamHomePrices.finishId, entry.finishId)));
  if (existing) {
    const [u] = await db
      .update(dreamHomePrices)
      .set({ priceCnyPerM: entry.priceCnyPerM })
      .where(eq(dreamHomePrices.id, existing.id))
      .returning();
    return u;
  }
  const [c] = await db.insert(dreamHomePrices).values(entry).returning();
  return c;
}

async listTallHeights(): Promise<TallHeight[]> {
  return db.select().from(tallHeights).orderBy(tallHeights.heightMm);
}

async upsertTallHeight(entry: InsertTallHeight): Promise<TallHeight> {
  const [existing] = await db
    .select()
    .from(tallHeights)
    .where(and(eq(tallHeights.heightMm, entry.heightMm), eq(tallHeights.finishId, entry.finishId)));
  if (existing) {
    const [u] = await db
      .update(tallHeights)
      .set({ priceCnyPerM: entry.priceCnyPerM, source: entry.source })
      .where(eq(tallHeights.id, existing.id))
      .returning();
    return u;
  }
  const [c] = await db.insert(tallHeights).values(entry).returning();
  return c;
}

async getPricingSettings(): Promise<PricingSettings> {
  const [row] = await db.select().from(pricingSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(pricingSettings).values({}).returning();
  return created;
}

async updatePricingSettings(updates: Partial<InsertPricingSettings>): Promise<PricingSettings> {
  const current = await this.getPricingSettings();
  const [updated] = await db
    .update(pricingSettings)
    .set(updates)
    .where(eq(pricingSettings.id, current.id))
    .returning();
  return updated;
}
```

**Step 5: Verify**

Run: `npm run build 2>&1 | tail -30`
Expected: `storage.ts` compiles. `routes.ts` may still error — that's Task 3.

---

## Task 3: API Routes — Remove old endpoints, add new ones

**Files:**
- Modify: `server/routes.ts`

**Step 1: Remove old pricing routes and imports**

DELETE all these route blocks:
- `// ── Pricing ──` section (GET/PUT/POST/DELETE /api/pricing)
- `// ── Finishing options ──` section
- `// ── Price matrix ──` section
- `// ── Depth options ──` section
- `// ── Height options ──` section
- `// ── Finish price matrix ──` section (from earlier today)

Remove these imports from the top of `routes.ts`:
- `insertPricingConfigSchema`
- `insertFinishingOptionSchema`
- `insertPriceMatrixSchema`
- `insertDepthOptionSchema`
- `insertHeightOptionSchema`
- `insertFinishPriceMatrixSchema`

**Step 2: Add new imports**

```ts
import {
  // ... existing, plus:
  insertDreamHomeFinishSchema,
  insertDreamHomePriceSchema,
  insertTallHeightSchema,
  insertPricingSettingsSchema,
} from "@shared/schema";
```

**Step 3: Add new routes (placed before `return httpServer;`)**

```ts
// ── Dream Home Pricing ────────────────────────────────────────────────────

app.get("/api/dream-home/finishes", async (_req, res) => {
  res.json(await storage.listDreamHomeFinishes());
});

app.put("/api/dream-home/finishes/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = insertDreamHomeFinishSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const updated = await storage.updateDreamHomeFinish(id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Finish not found" });
  res.json(updated);
});

app.get("/api/dream-home/prices", async (_req, res) => {
  res.json(await storage.listDreamHomePrices());
});

app.put("/api/dream-home/prices", async (req, res) => {
  const parsed = insertDreamHomePriceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.json(await storage.upsertDreamHomePrice(parsed.data));
});

app.get("/api/dream-home/tall-heights", async (_req, res) => {
  res.json(await storage.listTallHeights());
});

app.put("/api/dream-home/tall-heights", async (req, res) => {
  const parsed = insertTallHeightSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.json(await storage.upsertTallHeight(parsed.data));
});

app.get("/api/pricing-settings", async (_req, res) => {
  res.json(await storage.getPricingSettings());
});

app.put("/api/pricing-settings", async (req, res) => {
  const parsed = insertPricingSettingsSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.json(await storage.updatePricingSettings(parsed.data));
});
```

**Step 4: Verify backend builds**

Run: `npm run build 2>&1 | tail -30`
Expected: Backend compiles cleanly. Frontend may still error (admin.tsx + LayerPanel.tsx reference deleted types) — fixed in later tasks.

**Step 5: Commit backend**

```bash
git add shared/schema.ts server/seed.ts server/index.ts server/storage.ts server/routes.ts
git commit -m "$(cat <<'EOF'
feat(backend): replace old pricing tables with Dream Home schema

- Drop pricing_config, finishing_options, price_matrix, depth_options, height_options, finish_price_matrix
- Add dream_home_finishes, dream_home_prices, tall_heights, pricing_settings
- Seed 11 finishes, 22 Dream Home prices, 110 tall height rows, default settings
- Add new /api/dream-home/* and /api/pricing-settings endpoints

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

*(Commit even though frontend is broken — next tasks will fix it, and the commit is a logical unit.)*

---

## Task 4: Pricing Calculation Util

**Files:**
- Create: `client/src/lib/dream-home-pricing.ts`

**Step 1: Create the util file**

Content:

```ts
import type { DreamHomePrice, TallHeight, PricingSettings } from "@shared/schema";

// ─── Constants ──────────────────────────────────────────────────────────────

const STANDARDS = {
  base:         { heightMm: 670, depthMm: 550 },
  wall_cabinet: { heightMm: 700, depthMm: 330 },
  tall:         { depthMm: 550 },
} as const;

export const DREAM_HOME_TALL_HEIGHTS = [1900, 2000, 2100, 2200, 2400, 2600];
export const PLATINUM_TALL_HEIGHTS = [2700, 2800, 2900, 3000];

export const END_PANEL_BASE_AREA_M2 = 0.5;
export const END_PANEL_WALL_AREAS_M2 = [0.2, 0.3, 0.4] as const;
export const END_PANEL_DECOR_WIDTH_M = 0.6;
export const MIN_CHARGEABLE_AREA_M2 = 0.2;
export const FILLER_AREA_M2 = 0.2;

// ─── Core helpers ───────────────────────────────────────────────────────────

export function heightSurcharge(cm: number, standardMm: number): number {
  const mm = cm * 10;
  const extra = Math.max(0, mm - standardMm);
  const steps = Math.ceil(extra / 100);
  return 1 + 0.1 * steps;
}

export function depthSurcharge(cm: number, standardMm: number): number {
  const mm = cm * 10;
  const extra = Math.max(0, mm - standardMm);
  const steps = Math.ceil(extra / 100);
  return 1 + 0.1 * steps;
}

export function snapTallHeight(cm: number): { source: "dream_home" | "platinum"; heightMm: number } {
  const mm = cm * 10;
  if (mm <= 2600) {
    const snapped = DREAM_HOME_TALL_HEIGHTS.find((h) => h >= mm) ?? 2600;
    return { source: "dream_home", heightMm: snapped };
  }
  const snapped = PLATINUM_TALL_HEIGHTS.find((h) => h >= mm) ?? 3000;
  return { source: "platinum", heightMm: snapped };
}

export function toAED(cny: number, s: PricingSettings): number {
  const fx = Number(s.fxRate);
  const packing = Number(s.packingMult);
  const shipping = Number(s.shippingMult);
  const margin = Number(s.marginDiv);
  return (cny * fx * packing * shipping) / margin;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type LayerType = "base" | "wall_cabinet" | "tall" | "island" | "end_panel" | "filler" | "drawer";
export type EndPanelVariant = "base" | "wall" | "decorative";

export interface PricingLayer {
  id: string;
  type: LayerType;
  depth: number;             // cm
  height: number;            // cm
  finishId?: number;         // base|wall|tall|island
  endPanelVariant?: EndPanelVariant;
  endPanelWallArea?: number; // 0.2|0.3|0.4
  endPanelDecorHeight?: number; // cm
  qty?: number;
}

export interface PriceInput {
  layer: PricingLayer;
  lengthM: number;
  settings: PricingSettings;
  dreamHomePrices: DreamHomePrice[];
  tallHeights: TallHeight[];
}

export interface PriceResult {
  subtotalAED: number;
  breakdown: string;
  error?: string;
}

// ─── Lookup helpers ─────────────────────────────────────────────────────────

function lookupDreamHomePrice(prices: DreamHomePrice[], cabinetType: string, finishId: number): number {
  const row = prices.find((p) => p.cabinetType === cabinetType && p.finishId === finishId);
  return row ? Number(row.priceCnyPerM) : 0;
}

function lookupTallPrice(tallHeights: TallHeight[], heightMm: number, finishId: number): number {
  const row = tallHeights.find((t) => t.heightMm === heightMm && t.finishId === finishId);
  return row ? Number(row.priceCnyPerM) : 0;
}

// ─── Settings breakdown suffix (common to all calculations) ─────────────────

function settingsSuffix(s: PricingSettings): string {
  return `× ${Number(s.fxRate)} (FX) × ${Number(s.packingMult)} (packing) × ${Number(s.shippingMult)} (shipping) / ${Number(s.marginDiv)} (margin)`;
}

// ─── Main calculator ────────────────────────────────────────────────────────

export function calculateLayerPrice(input: PriceInput): PriceResult {
  const { layer } = input;
  switch (layer.type) {
    case "base":
    case "wall_cabinet":
      return calcBaseOrWall(input);
    case "tall":
      return calcTall(input);
    case "island":
      return calcIsland(input);
    case "end_panel":
      return calcEndPanel(input);
    case "filler":
      return calcFiller(input);
    case "drawer":
      return calcDrawer(input);
    default:
      return { subtotalAED: 0, breakdown: "Unknown layer type" };
  }
}

function calcBaseOrWall(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, dreamHomePrices } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };

  const std = STANDARDS[layer.type as "base" | "wall_cabinet"];
  const base = lookupDreamHomePrice(dreamHomePrices, layer.type, layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No price data" };

  const hSur = heightSurcharge(layer.height, std.heightMm);
  const dSur = depthSurcharge(layer.depth, std.depthMm);
  const cny = base * hSur * dSur * lengthM;
  const aed = toAED(cny, settings);

  const breakdown = `${base} CNY/m × (${hSur.toFixed(2)} × ${dSur.toFixed(2)}) × ${lengthM.toFixed(2)}m ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`;
  return { subtotalAED: aed, breakdown };
}

function calcTall(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, tallHeights } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };

  const snapped = snapTallHeight(layer.height);
  const base = lookupTallPrice(tallHeights, snapped.heightMm, layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No tall price data" };

  const dSur = depthSurcharge(layer.depth, STANDARDS.tall.depthMm);
  const cny = base * dSur * lengthM;
  const aed = toAED(cny, settings);

  const sourceLabel = snapped.source === "platinum" ? "Platinum" : "Dream Home";
  const breakdown = `${sourceLabel} ${snapped.heightMm}mm: ${base} CNY/m × ${dSur.toFixed(2)} × ${lengthM.toFixed(2)}m ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED`;
  return { subtotalAED: aed, breakdown };
}

function calcIsland(input: PriceInput): PriceResult {
  const { layer, lengthM, settings, dreamHomePrices } = input;
  if (!layer.finishId) return { subtotalAED: 0, breakdown: "No finish selected" };
  if (layer.depth > 110) return { subtotalAED: 0, breakdown: "", error: "Island depth max 110 cm" };

  const base = lookupDreamHomePrice(dreamHomePrices, "base", layer.finishId);
  if (base === 0) return { subtotalAED: 0, breakdown: "No price data" };

  const hSur = heightSurcharge(layer.height, STANDARDS.base.heightMm);
  const singleRowCny = base * hSur * lengthM;

  let cny: number;
  let breakdown: string;
  const decorativeRate = Number(settings.decorativeCnyPerM2);

  if (layer.depth < 75) {
    const backAreaM2 = lengthM * (layer.height / 100);
    const backCny = backAreaM2 * decorativeRate;
    cny = singleRowCny + backCny;
    breakdown = `(${base} × ${hSur.toFixed(2)} × ${lengthM.toFixed(2)}m) + (${backAreaM2.toFixed(2)}m² × ${decorativeRate}) = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)}`;
  } else {
    cny = 2 * singleRowCny;
    breakdown = `2 rows × ${base} × ${hSur.toFixed(2)} × ${lengthM.toFixed(2)}m = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)}`;
  }

  return { subtotalAED: toAED(cny, settings), breakdown };
}

function calcEndPanel(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 1;
  const rate = Number(settings.decorativeCnyPerM2);
  let areaM2 = 0;
  let label = "";

  switch (layer.endPanelVariant) {
    case "base":
      areaM2 = END_PANEL_BASE_AREA_M2 * qty;
      label = `${qty} × 0.5m² (Base)`;
      break;
    case "wall": {
      const variant = layer.endPanelWallArea ?? 0.2;
      areaM2 = variant * qty;
      label = `${qty} × ${variant}m² (Wall)`;
      break;
    }
    case "decorative": {
      const heightCm = layer.endPanelDecorHeight ?? 0;
      const pieceArea = Math.max(END_PANEL_DECOR_WIDTH_M * (heightCm / 100), MIN_CHARGEABLE_AREA_M2);
      areaM2 = pieceArea * qty;
      label = `${qty} × ${pieceArea.toFixed(2)}m² (Decor, min ${MIN_CHARGEABLE_AREA_M2})`;
      break;
    }
    default:
      return { subtotalAED: 0, breakdown: "Select end panel variant" };
  }

  const cny = areaM2 * rate;
  const aed = toAED(cny, settings);
  return { subtotalAED: aed, breakdown: `${label} × ${rate} CNY/m² = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED` };
}

function calcFiller(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 0;
  const rate = Number(settings.decorativeCnyPerM2);
  const areaM2 = FILLER_AREA_M2 * qty;
  const cny = areaM2 * rate;
  const aed = toAED(cny, settings);
  return { subtotalAED: aed, breakdown: `${qty} × 0.2m² × ${rate} CNY/m² = ${cny.toFixed(0)} CNY ${settingsSuffix(settings)} = ${aed.toFixed(0)} AED` };
}

function calcDrawer(input: PriceInput): PriceResult {
  const { layer, settings } = input;
  const qty = layer.qty ?? 0;
  const flatAed = Number(settings.drawerFlatAed);
  const aed = qty * flatAed;
  return { subtotalAED: aed, breakdown: `${qty} × ${flatAed} AED (flat) = ${aed.toFixed(0)} AED` };
}
```

**Step 2: Verify**

Run: `npm run build 2>&1 | tail -30`
Expected: util compiles. `admin.tsx` and `LayerPanel.tsx` still error on old imports — fixed next.

---

## Task 5: Admin Pricing Tab — Full rewrite

**Files:**
- Modify: `client/src/pages/admin.tsx`

**Step 1: Remove ALL old pricing code from admin.tsx**

Strip out:
- Imports of `PricingConfig`, `FinishingOption`, `PriceMatrix`, `DepthOption`, `HeightOption`, `FinishPriceMatrix`
- `FINISH_CABINET_TYPES` constant
- All mutations referencing `/api/pricing`, `/api/finishing-options`, `/api/finish-price-matrix`
- `FinishPriceMatrixGrid` component
- `FinishingRow`, `NewFinishingRow` components
- The TabsContent for `"pricing"` and for `"finishing"`
- The `<TabsTrigger value="finishing">` (already removed earlier)
- Query for `finishingOptions` from `/api/finishing-options`
- `addFinishingMutation`, `deleteFinishingMutation`, `finishingMutation`

**Step 2: Add new imports**

```ts
import type {
  AdminSettings,
  ElementDefinition,
  DreamHomeFinish,
  DreamHomePrice,
  TallHeight,
  PricingSettings,
} from "@shared/schema";
```

**Step 3: Replace Pricing tab content**

In the `Admin` component's JSX, the Pricing tab body should be:

```tsx
<TabsContent value="pricing">
  <div className="space-y-6">
    <PricingSettingsCard />
    <DreamHomeMatrixCard />
    <TallHeightsCard />
    <FinishesCard />
  </div>
</TabsContent>
```

**Step 4: Add `PricingSettingsCard` component**

```tsx
function PricingSettingsCard() {
  const { toast } = useToast();
  const { data: settings } = useQuery<PricingSettings>({ queryKey: ["/api/pricing-settings"] });

  const mutation = useMutation({
    mutationFn: (data: Partial<PricingSettings>) => apiRequest("PUT", "/api/pricing-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-settings"] });
      toast({ title: "Pricing settings saved" });
    },
  });

  if (!settings) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pricing Settings</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: "fxRate", label: "FX Rate (CNY → AED)" },
            { key: "packingMult", label: "Packing Multiplier" },
            { key: "shippingMult", label: "Shipping Multiplier" },
            { key: "marginDiv", label: "Margin Divisor" },
            { key: "decorativeCnyPerM2", label: "Decorative Panel CNY/m²" },
            { key: "drawerFlatAed", label: "Drawer Flat AED" },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                step="0.01"
                defaultValue={String(settings[key as keyof PricingSettings])}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== String(settings[key as keyof PricingSettings])) {
                    mutation.mutate({ [key]: val } as Partial<PricingSettings>);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 5: Add `DreamHomeMatrixCard` component**

```tsx
function DreamHomeMatrixCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: prices = [] } = useQuery<DreamHomePrice[]>({ queryKey: ["/api/dream-home/prices"] });

  const upsert = useMutation({
    mutationFn: (data: { cabinetType: string; finishId: number; priceCnyPerM: string }) =>
      apiRequest("PUT", "/api/dream-home/prices", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/prices"] }),
  });

  const getPrice = (type: string, fid: number) =>
    prices.find((p) => p.cabinetType === type && p.finishId === fid)?.priceCnyPerM ?? "";

  const rows = [
    { key: "base", label: "Base Cabinet" },
    { key: "wall_cabinet", label: "Wall Cabinet" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dream Home Prices (CNY / linear meter)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-border px-2 py-1 bg-orange-100 text-left sticky left-0">Cabinet</th>
                {finishes.map((f) => (
                  <th key={f.id} className="border border-border px-2 py-1 bg-yellow-100 min-w-[110px]">{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="border border-border px-2 py-1 bg-orange-50 font-medium sticky left-0">{row.label}</td>
                  {finishes.map((f) => {
                    const current = String(getPrice(row.key, f.id));
                    return (
                      <td key={f.id} className="border border-border bg-blue-50 p-0.5">
                        <Input
                          type="number"
                          defaultValue={current}
                          className="h-7 text-xs text-center"
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== current) {
                              upsert.mutate({ cabinetType: row.key, finishId: f.id, priceCnyPerM: e.target.value });
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 6: Add `TallHeightsCard` component**

```tsx
function TallHeightsCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: tallRows = [] } = useQuery<TallHeight[]>({ queryKey: ["/api/dream-home/tall-heights"] });

  const upsert = useMutation({
    mutationFn: (data: { source: string; heightMm: number; finishId: number; priceCnyPerM: string }) =>
      apiRequest("PUT", "/api/dream-home/tall-heights", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/tall-heights"] }),
  });

  const getPrice = (h: number, fid: number) =>
    tallRows.find((r) => r.heightMm === h && r.finishId === fid)?.priceCnyPerM ?? "";
  const getSource = (h: number) =>
    (tallRows.find((r) => r.heightMm === h)?.source ?? (h > 2600 ? "platinum" : "dream_home")) as "dream_home" | "platinum";

  const heights = [1900, 2000, 2100, 2200, 2400, 2600, 2700, 2800, 2900, 3000];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tall Cabinet Heights (CNY / linear meter)</CardTitle>
        <p className="text-[10px] text-muted-foreground">Dream Home: 1900–2600. Platinum fallback: 2700–3000.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-border px-2 py-1 bg-orange-100 sticky left-0">Source</th>
                <th className="border border-border px-2 py-1 bg-orange-100">Height</th>
                {finishes.map((f) => (
                  <th key={f.id} className="border border-border px-2 py-1 bg-yellow-100 min-w-[100px]">{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heights.map((h) => {
                const source = getSource(h);
                const bg = source === "platinum" ? "bg-purple-50" : "bg-orange-50";
                return (
                  <tr key={h}>
                    <td className={`border border-border px-2 py-1 ${bg} sticky left-0 font-medium text-[10px] uppercase`}>{source === "platinum" ? "Platinum" : "DH"}</td>
                    <td className={`border border-border px-2 py-1 ${bg} font-medium`}>{h} mm</td>
                    {finishes.map((f) => {
                      const current = String(getPrice(h, f.id));
                      return (
                        <td key={f.id} className="border border-border bg-blue-50 p-0.5">
                          <Input
                            type="number"
                            defaultValue={current}
                            className="h-7 text-xs text-center"
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== current) {
                                upsert.mutate({ source, heightMm: h, finishId: f.id, priceCnyPerM: e.target.value });
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 7: Add `FinishesCard` component**

```tsx
function FinishesCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });

  const mutation = useMutation({
    mutationFn: (data: { id: number; name: string }) =>
      apiRequest("PUT", `/api/dream-home/finishes/${data.id}`, { name: data.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/finishes"] }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Finishes (11)</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {finishes.map((f) => (
          <div key={f.id} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-6">#{f.sortOrder}</span>
            <Input
              defaultValue={f.name}
              className="flex-1"
              onBlur={(e) => {
                if (e.target.value && e.target.value !== f.name) {
                  mutation.mutate({ id: f.id, name: e.target.value });
                }
              }}
            />
            <span className="text-[10px] text-muted-foreground w-40 truncate">{f.system}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Step 8: Verify admin.tsx compiles**

Run: `npm run build 2>&1 | tail -30`
Expected: admin.tsx compiles. `LayerPanel.tsx` still broken — next task.

---

## Task 6: LayerPanel — Full rewrite to use new pricing

**Files:**
- Modify: `client/src/lib/kitchen-engine.ts` (LayerType enum, Layer interface, DEFAULT_HEIGHTS record)
- Modify: `client/src/components/kitchen/LayerPanel.tsx`
- Modify: `client/src/stores/useCanvasStore.ts` (verify no old type references)
- Modify: `client/src/lib/export.ts` (verify no old divider/finishId-as-string references)
- Modify: any file that loads saved project JSON (normalize legacy `divider` → `end_panel`, `finishId: "1"` → `1`)

**Step 1: Update `kitchen-engine.ts` — LayerType, Layer, DEFAULT_HEIGHTS**

Find the existing type definitions around lines 13–38 and 89–96. Replace with:

```ts
export type CabinetType = "base" | "wall_cabinet" | "tall" | "island";
export type LayerType = CabinetType | "end_panel" | "filler" | "drawer";

export interface Layer {
  id: string;
  type: LayerType;
  depth: number | null;            // cm; drawable layers only (null for count-only types)
  height: number | null;           // cm; drawable layers only
  finishId: number | null;         // FK to dream_home_finishes (was string, now number)
  endPanelVariant?: "base" | "wall" | "decorative";
  endPanelWallArea?: number;       // 0.2 | 0.3 | 0.4
  endPanelDecorHeight?: number;    // cm
  qty?: number;                    // end_panel | filler | drawer
  cabinetIds: string[];
}
```

Update `DEFAULT_HEIGHTS` (around line 89):

```ts
export const DEFAULT_HEIGHTS: Record<LayerType, number> = {
  base: 90,
  wall_cabinet: 60,
  tall: 210,
  island: 90,
  end_panel: 90,
  filler: 90,
  drawer: 90,
};
```

**Step 2: Handle legacy `divider` + stringified finishId in state load**

Search for anywhere that loads layers from saved project JSON:

```bash
grep -rn "layer.*type.*divider\|JSON.parse.*layers\|canvasData\|canvas_data" client/src --include="*.ts" --include="*.tsx"
```

The main candidate is `client/src/stores/useCanvasStore.ts` (in a `loadProject` / `setLayers` handler or similar) OR `client/src/pages/designer.tsx` when hydrating state from `project.spaces[0].canvasData`.

Add a normalization helper in `kitchen-engine.ts`:

```ts
export function normalizeLayer(raw: any): Layer {
  const out = { ...raw };
  // Legacy: divider → end_panel
  if (out.type === "divider") {
    out.type = "end_panel";
    out.endPanelVariant = out.endPanelVariant ?? "base";
    out.qty = out.qty ?? out.count ?? 1;
  }
  // Legacy: finishId stringified → number
  if (typeof out.finishId === "string") {
    const n = parseInt(out.finishId, 10);
    out.finishId = Number.isFinite(n) ? n : null;
  }
  return out as Layer;
}
```

Call it in the place where layers are loaded — map every incoming layer through `normalizeLayer`. For the project detail / designer page, that's wherever `setLayers(project.spaces[0].canvasData.layers)` is called. Wrap with `.map(normalizeLayer)`.

**Step 3: Scan other files for broken references**

Run these searches:

```bash
grep -n "divider" client/src/lib/export.ts client/src/stores/useCanvasStore.ts client/src/components/kitchen/LayerPanel.tsx
grep -n "layer.finishId\|finishId:" client/src/lib/export.ts client/src/stores/useCanvasStore.ts
```

Any `"divider"` references → replace with `"end_panel"` (or with conditional logic if it was behavior-specific).
Any place that treats `finishId` as a string (e.g. `finishId.toString()` on a string, comparisons with `=== "1"`, etc.) → update to handle `number | null`.

**Step 4: Rewrite `LayerPanel.tsx`**

Full replacement skeleton:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Layers } from "lucide-react";
import { useCanvasStore } from "@/stores/useCanvasStore";
import type {
  DreamHomeFinish,
  DreamHomePrice,
  TallHeight,
  PricingSettings,
} from "@shared/schema";
import type { Layer, LayerType, Cabinet, Wall } from "@/lib/kitchen-engine";
import { pixelsToCm, computeEffectiveLengths } from "@/lib/kitchen-engine";
import { calculateLayerPrice, type PricingLayer } from "@/lib/dream-home-pricing";

const LAYER_LABELS: Record<LayerType, string> = {
  base: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall: "Tall Cabinet",
  island: "Island",
  end_panel: "End Panel",
  filler: "Filler",
  drawer: "Drawer",
};

const LAYER_COLORS: Record<LayerType, string> = {
  base: "#3B82F6",
  wall_cabinet: "#22C55E",
  tall: "#A855F7",
  island: "#F59E0B",
  end_panel: "#6B7280",
  filler: "#9CA3AF",
  drawer: "#6B7280",
};

const DRAWABLE_TYPES: LayerType[] = ["base", "wall_cabinet", "tall", "island"];
const COUNT_TYPES: LayerType[] = ["end_panel", "filler", "drawer"];
const ALL_TYPES: LayerType[] = ["base", "wall_cabinet", "tall", "island", "end_panel", "filler", "drawer"];

function generateId() {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface LayerPanelProps {
  cabinets: Cabinet[];
  walls: Wall[];
}

export function LayerPanel({ cabinets, walls }: LayerPanelProps) {
  const { layers, activeLayerId, addLayer, removeLayer, updateLayer, setActiveLayer } = useCanvasStore();

  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: prices = [] } = useQuery<DreamHomePrice[]>({ queryKey: ["/api/dream-home/prices"] });
  const { data: tallRows = [] } = useQuery<TallHeight[]>({ queryKey: ["/api/dream-home/tall-heights"] });
  const { data: settings } = useQuery<PricingSettings>({ queryKey: ["/api/pricing-settings"] });

  const handleAddLayer = (type: LayerType) => {
    const defaults: Partial<Layer> = {
      id: generateId(),
      type,
      depth: type === "end_panel" || type === "filler" || type === "drawer" ? 0 : 60,
      height: type === "tall" ? 220 : type === "wall_cabinet" ? 70 : 90,
      finishId: finishes[0]?.id ?? null,
      cabinetIds: [],
    };
    if (type === "end_panel") {
      defaults.endPanelVariant = "base";
      defaults.qty = 1;
    }
    if (type === "filler" || type === "drawer") defaults.qty = 1;
    addLayer(defaults as Layer);
  };

  const getLayerCabinets = (layer: Layer): Cabinet[] =>
    cabinets.filter((c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id));

  const getLayerLength = (layer: Layer): number => {
    if (!DRAWABLE_TYPES.includes(layer.type)) return 0;
    const cabs = getLayerCabinets(layer);
    if (cabs.length === 0) return 0;
    const effectiveLengths = computeEffectiveLengths(cabs, walls, layer.depth ?? undefined);
    return cabs.reduce((sum, c) => sum + pixelsToCm(effectiveLengths.get(c.id) ?? 0) / 100, 0);
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-l border-sidebar-border" data-testid="layer-panel">
      <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            Layers
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Click a layer to draw on it</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              New Layer
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ALL_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => handleAddLayer(type)}>
                <div className="w-2.5 h-2.5 rounded-sm mr-2 shrink-0" style={{ backgroundColor: LAYER_COLORS[type] }} />
                {LAYER_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {layers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">No layers yet</p>
          </div>
        ) : (
          layers.map((layer, idx) => (
            <LayerCard
              key={layer.id}
              layer={layer}
              index={idx}
              isActive={layer.id === activeLayerId}
              lengthM={getLayerLength(layer)}
              finishes={finishes}
              prices={prices}
              tallRows={tallRows}
              settings={settings}
              onSelect={() => setActiveLayer(layer.id)}
              onUpdate={(updates) => updateLayer(layer.id, updates)}
              onDelete={() => removeLayer(layer.id)}
            />
          ))
        )}
      </div>

      <TotalFooter
        layers={layers}
        cabinets={cabinets}
        walls={walls}
        finishes={finishes}
        prices={prices}
        tallRows={tallRows}
        settings={settings}
      />
    </div>
  );
}

interface CardProps {
  layer: Layer;
  index: number;
  isActive: boolean;
  lengthM: number;
  finishes: DreamHomeFinish[];
  prices: DreamHomePrice[];
  tallRows: TallHeight[];
  settings?: PricingSettings;
  onSelect: () => void;
  onUpdate: (u: Partial<Layer>) => void;
  onDelete: () => void;
}

function LayerCard({ layer, index, isActive, lengthM, finishes, prices, tallRows, settings, onSelect, onUpdate, onDelete }: CardProps) {
  const isDrawable = DRAWABLE_TYPES.includes(layer.type);
  const isCount = COUNT_TYPES.includes(layer.type);

  const result = settings
    ? calculateLayerPrice({
        layer: layer as unknown as PricingLayer,
        lengthM,
        settings,
        dreamHomePrices: prices,
        tallHeights: tallRows,
      })
    : { subtotalAED: 0, breakdown: "Loading...", error: undefined };

  return (
    <div
      className={`rounded-md border p-2.5 cursor-pointer transition-colors ${
        isActive ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: LAYER_COLORS[layer.type] }} />
        <span className="text-xs font-medium text-card-foreground">{LAYER_LABELS[layer.type]}</span>
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">#{index + 1}</Badge>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-red-500 ml-1">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        {isDrawable && (
          <>
            <span className="text-muted-foreground">Length</span>
            <span className="text-right font-mono">{lengthM.toFixed(2)} m</span>

            <span className="text-muted-foreground self-center">Depth (cm)</span>
            <Input
              type="number"
              value={layer.depth ?? ""}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ depth: parseInt(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Height (cm)</span>
            <Input
              type="number"
              value={layer.height}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Finish</span>
            <Select
              value={layer.finishId?.toString() ?? ""}
              onValueChange={(v) => onUpdate({ finishId: parseInt(v) })}
            >
              <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {finishes.map((f) => (
                  <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {layer.type === "end_panel" && (
          <>
            <span className="text-muted-foreground self-center">Variant</span>
            <Select
              value={layer.endPanelVariant ?? "base"}
              onValueChange={(v) => onUpdate({ endPanelVariant: v as "base" | "wall" | "decorative" })}
            >
              <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base Cabinet (0.5 m²)</SelectItem>
                <SelectItem value="wall">Wall Cabinet (variants)</SelectItem>
                <SelectItem value="decorative">Decorative (60 cm × height)</SelectItem>
              </SelectContent>
            </Select>

            {layer.endPanelVariant === "wall" && (
              <>
                <span className="text-muted-foreground self-center">Area</span>
                <Select
                  value={String(layer.endPanelWallArea ?? 0.2)}
                  onValueChange={(v) => onUpdate({ endPanelWallArea: parseFloat(v) })}
                >
                  <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.2">0.2 m²</SelectItem>
                    <SelectItem value="0.3">0.3 m²</SelectItem>
                    <SelectItem value="0.4">0.4 m²</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            {layer.endPanelVariant === "decorative" && (
              <>
                <span className="text-muted-foreground self-center">Height (cm)</span>
                <Input
                  type="number"
                  value={layer.endPanelDecorHeight ?? 260}
                  className="h-6 text-xs text-right"
                  onChange={(e) => onUpdate({ endPanelDecorHeight: parseInt(e.target.value) || 0 })}
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            )}
          </>
        )}

        {isCount && (
          <>
            <span className="text-muted-foreground self-center">Qty</span>
            <Input
              type="number"
              value={layer.qty ?? 1}
              min={0}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ qty: parseInt(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
            />
          </>
        )}
      </div>

      <Separator className="my-1.5" />

      <div className="flex justify-between text-xs">
        <span className="font-medium text-card-foreground">Subtotal</span>
        <span className="font-semibold font-mono text-primary">
          {result.error ? "—" : `${result.subtotalAED.toFixed(0)} AED`}
        </span>
      </div>
      {result.error ? (
        <p className="text-[9px] text-red-500 mt-0.5">{result.error}</p>
      ) : (
        <p className="text-[9px] text-muted-foreground mt-0.5 break-words" title={result.breakdown}>
          {result.breakdown}
        </p>
      )}
    </div>
  );
}

function TotalFooter({ layers, cabinets, walls, finishes, prices, tallRows, settings }: {
  layers: Layer[];
  cabinets: Cabinet[];
  walls: Wall[];
  finishes: DreamHomeFinish[];
  prices: DreamHomePrice[];
  tallRows: TallHeight[];
  settings?: PricingSettings;
}) {
  if (!settings) return null;

  const getLength = (layer: Layer): number => {
    if (!DRAWABLE_TYPES.includes(layer.type)) return 0;
    const cabs = cabinets.filter((c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id));
    if (cabs.length === 0) return 0;
    const eff = computeEffectiveLengths(cabs, walls, layer.depth ?? undefined);
    return cabs.reduce((sum, c) => sum + pixelsToCm(eff.get(c.id) ?? 0) / 100, 0);
  };

  const total = layers.reduce((sum, layer) => {
    const result = calculateLayerPrice({
      layer: layer as unknown as PricingLayer,
      lengthM: getLength(layer),
      settings,
      dreamHomePrices: prices,
      tallHeights: tallRows,
    });
    return sum + (result.error ? 0 : result.subtotalAED);
  }, 0);

  return (
    <div className="p-3 border-t border-sidebar-border bg-sidebar">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-medium text-sidebar-foreground">Layers: {layers.length}</span>
        <span className="text-lg font-bold font-mono text-primary">{total.toFixed(0)} AED</span>
      </div>
    </div>
  );
}
```

**Step 5: Verify frontend builds**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build, zero errors.

**Step 6: Commit frontend**

```bash
git add client/src/lib/dream-home-pricing.ts client/src/pages/admin.tsx client/src/components/kitchen/LayerPanel.tsx client/src/lib/kitchen-engine.ts docs/plans/2026-04-14-dream-home-pricing.md
git commit -m "$(cat <<'EOF'
feat(frontend): Dream Home pricing UI — new admin tab + LayerPanel rewrite

- Add dream-home-pricing.ts util (pure functions, all 7 layer types)
- Admin Pricing tab: 4 cards (Settings, Dream Home Matrix, Tall Heights, Finishes)
- LayerPanel: cm inputs, per-layer finish, live subtotal + breakdown, total footer
- Extend LayerType: end_panel, filler, drawer (rename from divider)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Deploy & Smoke Test

**Step 1: Push to Railway**

```bash
git push origin main
```

**Step 2: Wait ~3 minutes for Railway deploy**

Open Railway dashboard → NEVRAKitchen service → Deployments. Wait for latest deploy to go from "Building" → "Deployed".

**Step 3: Smoke test on live URL** (`nevrakitchen-production.up.railway.app`)

- [ ] Log in → Admin → Pricing tab loads without errors
- [ ] Pricing Settings card shows all 6 fields with defaults (0.51, 1.10, 1.10, 0.50, 880, 500)
- [ ] Dream Home Matrix shows 2 rows × 11 columns with prefilled prices (Base row[0] = 2420)
- [ ] Tall Heights shows 10 rows (6 DH + 4 Platinum) × 11 columns prefilled
- [ ] Finishes card shows all 11 rows with inline rename
- [ ] Edit a cell (e.g. set Base × Embossed = 9999) → blur → toast success → reload page → value persists
- [ ] Open Designer → Create new layer "Base Cabinet" → type depth=60 height=90 → pick a finish → subtotal shows non-zero AED + breakdown string
- [ ] Add a "Tall Cabinet" layer → height 261 → breakdown mentions "Platinum 2700mm"
- [ ] Add an "Island" layer → depth 70 → subtotal reflects "1 row + back panel"; depth 90 → subtotal doubles (2 rows no back panel); depth 120 → error "max 110 cm"
- [ ] Add "End Panel" → variant Base, qty 3 → subtotal = 3 × 0.5 × 880 × conversion
- [ ] Add "Filler" → qty 5 → subtotal = 5 × 0.2 × 880 × conversion
- [ ] Add "Drawer" → qty 2 → subtotal = 1000 AED (2 × 500 flat)
- [ ] Total footer sums all layers correctly

**Step 4: If all pass, done.**

If anything fails, triage: is it a backend error (check Railway logs) or a frontend error (browser console)?

---

## Risk & Rollback

- If the deploy fails because `db:push` can't drop old tables (FK constraints), add explicit `DROP TABLE ... CASCADE` to a `server/drop-old-tables.ts` called before seed.
- Old saved projects with `divider` layers get normalized in state-load. No destructive migration.
- If a user already has data in `pricing_config` / `finishing_options`, it's lost — but Ahmed confirmed no real data existed.
- Rollback: `git revert HEAD~2..HEAD && git push` (2 commits).

---

## Notes on YAGNI / DRY / Simplicity

- No unit tests written (existing project has none). If Ahmed asks for them, add `dream-home-pricing.test.ts` with Vitest later — it's the most unit-testable file in the codebase.
- No server-side pricing math. All formulas live in `dream-home-pricing.ts`. One source of truth.
- Admin settings use save-on-blur (matches existing matrix pattern). No "big Save button".
- Tall heights table is 10 rows × 11 columns — small enough to fit without virtual scrolling.
- Seed file is idempotent — safe to ship repeatedly on every `db:push`.
