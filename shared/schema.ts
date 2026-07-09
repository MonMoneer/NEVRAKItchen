/**
 * ─── Inner-Face Wall Model (since 2026-04-21) ──────────────────────────────
 *
 * Walls and wall-bound cabinets/openings store COORDINATES OF THE INNER FACE
 * of the room (the visible inside surface of the wall). Wall thickness extends
 * OUTWARD from this inner face by `wall.thickness` pixels.
 *
 * - Wall.start / Wall.end       : inner-face corner points
 * - Cabinet.start / Cabinet.end : back-corner points ON the inner-face line
 * - Opening.start / Opening.end : edge points ON the inner-face line; opening
 *                                 depth is derived from the host wall's thickness
 *
 * Outer face is computed at render time as: inner + outwardNormal × thickness.
 * outwardNormal is reoriented by reorientWalls() so closed rooms have walls
 * with thickness pointing AWAY from the polygon interior.
 */
import { pgTable, text, serial, numeric, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Existing tables (unchanged) ────────────────────────────────────────────

export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("NIVRA Kitchen"),
  logoUrl: text("logo_url").default(""),
  primaryColor: text("primary_color").notNull().default("#2563eb"),
  footerText: text("footer_text").notNull().default("NIVRA Kitchen - Professional Kitchen Design"),
  gridEnabled: boolean("grid_enabled").notNull().default(true),
  midpointEnabled: boolean("midpoint_enabled").notNull().default(true),
  snapRadius: integer("snap_radius").notNull().default(12),
});

// ─── Projects (extended from saved_projects) ────────────────────────────────

export const savedProjects = pgTable("saved_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  clientPhone: text("client_phone").notNull().default(""),
  clientEmail: text("client_email").notNull().default(""),
  address: text("address").notNull().default(""),
  stage: text("stage").notNull().default("estimated_price"),
  // estimated_price | site_measurement
  notes: text("notes").notNull().default(""),
  selectedFinishing: text("selected_finishing").default("1"),
  projectData: jsonb("project_data"), // nullable — legacy field kept for migration
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  assignedTo: integer("assigned_to").references(() => users.id),
});

// ─── Spaces (multi-room per project) ────────────────────────────────────────

export const spaces = pgTable("spaces", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => savedProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("kitchen"),
  // kitchen | bathroom | washroom | tv_unit
  canvasData: jsonb("canvas_data"),
  siteMeasurementData: jsonb("site_measurement_data"),
  finishing: text("finishing").default("1"),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  referenceImage: text("reference_image"), // base64 PNG — captured when advancing to site_measurement
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Space photos ────────────────────────────────────────────────────────────

export const spacePhotos = pgTable("space_photos", {
  id: serial("id").primaryKey(),
  spaceId: integer("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  data: text("data").notNull(), // base64 encoded image
  caption: text("caption").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Element definitions (admin-configurable: sockets, sinks, appliances) ───

export const elementDefinitions = pgTable("element_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // electrical | plumbing | appliance
  icon: text("icon").notNull().default(""),
  defaultWidth: integer("default_width").notNull().default(60), // cm
  defaultDepth: integer("default_depth").notNull().default(60), // cm
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Wall points (electrical/plumbing placed in site_measurement) ────────────

export const wallPoints = pgTable("wall_points", {
  id: serial("id").primaryKey(),
  spaceId: integer("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // electrical | plumbing
  wallId: text("wall_id").notNull().default(""),
  distanceCm: integer("distance_cm").notNull().default(0),
  heightCm: integer("height_cm").notNull().default(0),
  photo: text("photo").default(""), // base64
  note: text("note").notNull().default(""),
  posX: integer("pos_x").notNull().default(0), // canvas pixel position (stored for rendering)
  posY: integer("pos_y").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Project attachments (PDFs, images uploaded per project) ────────────────

export const projectAttachments = pgTable("project_attachments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => savedProjects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(),
  fileType: text("file_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("sales"), // admin | sales | technician
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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

// ─── Insert schemas ──────────────────────────────────────────────────────────

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ id: true });
export const insertSavedProjectSchema = createInsertSchema(savedProjects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaceSchema = createInsertSchema(spaces).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpacePhotoSchema = createInsertSchema(spacePhotos).omit({ id: true, createdAt: true });
export const insertElementDefinitionSchema = createInsertSchema(elementDefinitions).omit({ id: true, createdAt: true });
export const insertWallPointSchema = createInsertSchema(wallPoints).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProjectAttachmentSchema = createInsertSchema(projectAttachments).omit({ id: true, createdAt: true });
export const insertDreamHomeFinishSchema = createInsertSchema(dreamHomeFinishes).omit({ id: true });
export const insertDreamHomePriceSchema = createInsertSchema(dreamHomePrices).omit({ id: true });
export const insertTallHeightSchema = createInsertSchema(tallHeights).omit({ id: true });
export const insertPricingSettingsSchema = createInsertSchema(pricingSettings).omit({ id: true });

// ─── Types ───────────────────────────────────────────────────────────────────

export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;

export type InsertSavedProject = z.infer<typeof insertSavedProjectSchema>;
export type SavedProject = typeof savedProjects.$inferSelect;

export type InsertSpace = z.infer<typeof insertSpaceSchema>;
export type Space = typeof spaces.$inferSelect;

export type InsertSpacePhoto = z.infer<typeof insertSpacePhotoSchema>;
export type SpacePhoto = typeof spacePhotos.$inferSelect;

export type InsertElementDefinition = z.infer<typeof insertElementDefinitionSchema>;
export type ElementDefinition = typeof elementDefinitions.$inferSelect;

export type InsertWallPoint = z.infer<typeof insertWallPointSchema>;
export type WallPoint = typeof wallPoints.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type ProjectAttachment = typeof projectAttachments.$inferSelect;
export type InsertProjectAttachment = typeof projectAttachments.$inferInsert;

export type DreamHomeFinish = typeof dreamHomeFinishes.$inferSelect;
export type InsertDreamHomeFinish = z.infer<typeof insertDreamHomeFinishSchema>;
export type DreamHomePrice = typeof dreamHomePrices.$inferSelect;
export type InsertDreamHomePrice = z.infer<typeof insertDreamHomePriceSchema>;
export type TallHeight = typeof tallHeights.$inferSelect;
export type InsertTallHeight = z.infer<typeof insertTallHeightSchema>;
export type PricingSettings = typeof pricingSettings.$inferSelect;
export type InsertPricingSettings = z.infer<typeof insertPricingSettingsSchema>;

// ─── Project Timelines (client-facing delivery schedule) ──────────────────────
//
// Stored as a single jsonb `data` blob per project. The public page is rendered
// server-side from this structure (see server/timeline-template.ts) and
// self-advances by date on the client. Statuses for steps are derived from
// today vs start/end; payment status is stored explicitly.

export const timelineStepSchema = z.object({
  kind: z.literal("step"),
  title: z.string(),
  detail: z.string().default(""),
  start: z.string().default(""), // ISO yyyy-mm-dd
  end: z.string().default(""),
  dateLabel: z.string().default(""),
});

export const timelinePaymentSchema = z.object({
  kind: z.literal("payment"),
  eyebrow: z.string(),
  amount: z.string(),
  detail: z.string().default(""),
  when: z.string().default(""),
  status: z.enum(["paid", "due", "pending"]).default("pending"),
  pillLabel: z.string().default(""), // e.g. "Overdue" / "✓ Paid" / "Pending"
  start: z.string().default(""),
  end: z.string().default(""),
});

export const timelineTransitSchema = z.object({
  kind: z.literal("transit"),
  text: z.string(),
});

export const timelineDaysSchema = z.object({
  kind: z.literal("days"),
  title: z.string(),
  detail: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  dateLabel: z.string().default(""),
  days: z.array(z.string()).default([]),
});

export const timelineItemSchema = z.discriminatedUnion("kind", [
  timelineStepSchema,
  timelinePaymentSchema,
  timelineTransitSchema,
  timelineDaysSchema,
]);

export const timelinePhaseSchema = z.object({
  num: z.string(),
  title: z.string(),
  sub: z.string().default(""),
  items: z.array(timelineItemSchema).default([]),
});

export const timelineDataSchema = z.object({
  docRef: z.string().default(""),
  issuedDate: z.string().default(""),
  eyebrow: z.string().default("Project Schedule & Payment Plan"),
  title: z.string().default(""),
  subtitle: z.string().default(""),
  note: z.string().default(""),
  theme: z.enum(["orange", "charcoal", "blue"]).default("orange"),
  client: z.object({
    name: z.string().default(""),
    tag: z.string().default("Client · Residential"),
    phone: z.string().default(""),
    address: z.string().default(""),
    projectValue: z.string().default(""),
    approval: z.string().default(""),
  }),
  phases: z.array(timelinePhaseSchema).default([]),
  completion: z.object({
    title: z.string().default("Kitchen fully installed & handed over"),
    dateBig: z.string().default(""),
    dateSub: z.string().default(""),
  }),
  summary: z.object({
    total: z.string().default(""),
    payments: z.array(z.object({
      label: z.string(),
      amount: z.string(),
      status: z.enum(["paid", "due", "pending"]).default("pending"),
      when: z.string().default(""),
    })).default([]),
  }),
  footer: z.string().default(""),
});

export type TimelineStep = z.infer<typeof timelineStepSchema>;
export type TimelinePayment = z.infer<typeof timelinePaymentSchema>;
export type TimelineTransit = z.infer<typeof timelineTransitSchema>;
export type TimelineDays = z.infer<typeof timelineDaysSchema>;
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type TimelinePhase = z.infer<typeof timelinePhaseSchema>;
export type TimelineData = z.infer<typeof timelineDataSchema>;

export const projectTimelines = pgTable("project_timelines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => savedProjects.id, { onDelete: "cascade" })
    .unique(), // one timeline per project
  shareToken: text("share_token").notNull().unique(), // nanoid(12) — public link
  data: jsonb("timeline_data").$type<TimelineData>().notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProjectTimeline = typeof projectTimelines.$inferSelect;
export type InsertProjectTimeline = typeof projectTimelines.$inferInsert;

// ─── Schedule Builder (internal tool) ─────────────────────────────────────────
//
// Single shared row holding every project the Schedule Builder tool manages,
// as one jsonb array. The server never interprets the array's contents — it's
// opaque storage for the tool's own client-side data model.

export const scheduleBuilderData = pgTable("schedule_builder_data", {
  id: serial("id").primaryKey(),
  projects: jsonb("projects").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ScheduleBuilderData = typeof scheduleBuilderData.$inferSelect;
