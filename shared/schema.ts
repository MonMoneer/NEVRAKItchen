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

export const pricingConfig = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  unitType: text("unit_type").notNull(),
  pricePerMeter: numeric("price_per_meter", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("AED"),
});

export const finishingOptions = pgTable("finishing_options", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ─── Projects (extended from saved_projects) ────────────────────────────────

export const savedProjects = pgTable("saved_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  clientPhone: text("client_phone").notNull().default(""),
  clientEmail: text("client_email").notNull().default(""),
  address: text("address").notNull().default(""),
  stage: text("stage").notNull().default("estimated_budget"),
  // estimated_budget | site_measurement | final
  notes: text("notes").notNull().default(""),
  selectedFinishing: text("selected_finishing").default("1"),
  projectData: jsonb("project_data"), // nullable — legacy field kept for migration
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Spaces (multi-room per project) ────────────────────────────────────────

export const spaces = pgTable("spaces", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => savedProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("kitchen"),
  // kitchen | bathroom | washroom | tv_unit
  canvasData: jsonb("canvas_data"),
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

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("sales"), // admin | sales | technician
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Insert schemas ──────────────────────────────────────────────────────────

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({ id: true });
export const insertPricingConfigSchema = createInsertSchema(pricingConfig).omit({ id: true });
export const insertFinishingOptionSchema = createInsertSchema(finishingOptions).omit({ id: true });
export const insertSavedProjectSchema = createInsertSchema(savedProjects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpaceSchema = createInsertSchema(spaces).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpacePhotoSchema = createInsertSchema(spacePhotos).omit({ id: true, createdAt: true });
export const insertElementDefinitionSchema = createInsertSchema(elementDefinitions).omit({ id: true, createdAt: true });
export const insertWallPointSchema = createInsertSchema(wallPoints).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

// ─── Types ───────────────────────────────────────────────────────────────────

export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;

export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfig.$inferSelect;

export type InsertFinishingOption = z.infer<typeof insertFinishingOptionSchema>;
export type FinishingOption = typeof finishingOptions.$inferSelect;

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
