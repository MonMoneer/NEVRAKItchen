import {
  type AdminSettings, type InsertAdminSettings,
  type PricingConfig, type InsertPricingConfig,
  type FinishingOption, type InsertFinishingOption,
  type SavedProject, type InsertSavedProject,
  type Space, type InsertSpace,
  type SpacePhoto, type InsertSpacePhoto,
  type ElementDefinition, type InsertElementDefinition,
  type WallPoint, type InsertWallPoint,
  type User, type InsertUser,
  adminSettings, pricingConfig, finishingOptions, savedProjects,
  spaces, spacePhotos, elementDefinitions, wallPoints, users,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, desc, and, sql } from "drizzle-orm";

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IStorage {
  // Admin settings
  getAdminSettings(): Promise<AdminSettings | undefined>;
  updateAdminSettings(settings: Partial<InsertAdminSettings>): Promise<AdminSettings>;

  // Pricing
  getPricingConfigs(): Promise<PricingConfig[]>;
  updatePricingConfig(id: number, config: Partial<InsertPricingConfig>): Promise<PricingConfig | undefined>;
  createPricingConfig(config: InsertPricingConfig): Promise<PricingConfig>;
  deletePricingConfig(id: number): Promise<boolean>;

  // Finishing options
  getFinishingOptions(): Promise<FinishingOption[]>;
  updateFinishingOption(id: number, option: Partial<InsertFinishingOption>): Promise<FinishingOption | undefined>;
  createFinishingOption(option: InsertFinishingOption): Promise<FinishingOption>;
  deleteFinishingOption(id: number): Promise<boolean>;

  // Projects
  getSavedProjects(stage?: string): Promise<(SavedProject & { spaceCount: number })[]>;
  getSavedProject(id: number): Promise<(SavedProject & { spaces: Space[] }) | undefined>;
  createSavedProject(project: InsertSavedProject): Promise<SavedProject>;
  updateSavedProject(id: number, updates: Partial<InsertSavedProject>): Promise<SavedProject | undefined>;
  deleteSavedProject(id: number): Promise<boolean>;
  searchProjectsByPhone(phone: string): Promise<(SavedProject & { spaceCount: number })[]>;
  searchProjectsByName(name: string): Promise<(SavedProject & { spaceCount: number })[]>;

  // Spaces
  getSpaces(projectId: number): Promise<Space[]>;
  getSpace(id: number): Promise<Space | undefined>;
  createSpace(space: InsertSpace): Promise<Space>;
  updateSpace(id: number, updates: Partial<InsertSpace>): Promise<Space | undefined>;
  updateSpaceReference(id: number, referenceImage: string): Promise<Space | undefined>;
  deleteSpace(id: number): Promise<boolean>;

  // Photos
  getSpacePhotos(spaceId: number): Promise<SpacePhoto[]>;
  createSpacePhoto(photo: InsertSpacePhoto): Promise<SpacePhoto>;
  deleteSpacePhoto(id: number): Promise<boolean>;

  // Element definitions
  getElementDefinitions(): Promise<ElementDefinition[]>;
  createElementDefinition(def: InsertElementDefinition): Promise<ElementDefinition>;
  updateElementDefinition(id: number, updates: Partial<InsertElementDefinition>): Promise<ElementDefinition | undefined>;

  // Wall points
  getWallPoints(spaceId: number): Promise<WallPoint[]>;
  createWallPoint(point: InsertWallPoint): Promise<WallPoint>;
  deleteWallPoint(id: number): Promise<boolean>;

  // Users
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUsers(): Promise<Omit<User, "passwordHash">[]>;
}

// ─── Implementation ──────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {

  // ── Admin settings ─────────────────────────────────────────────────────────

  async getAdminSettings(): Promise<AdminSettings | undefined> {
    const [settings] = await db.select().from(adminSettings).limit(1);
    return settings;
  }

  async updateAdminSettings(settings: Partial<InsertAdminSettings>): Promise<AdminSettings> {
    const existing = await this.getAdminSettings();
    if (existing) {
      const [updated] = await db.update(adminSettings).set(settings).where(eq(adminSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(adminSettings).values(settings as InsertAdminSettings).returning();
    return created;
  }

  // ── Pricing ────────────────────────────────────────────────────────────────

  async getPricingConfigs(): Promise<PricingConfig[]> {
    return db.select().from(pricingConfig);
  }

  async updatePricingConfig(id: number, config: Partial<InsertPricingConfig>): Promise<PricingConfig | undefined> {
    const [updated] = await db.update(pricingConfig).set(config).where(eq(pricingConfig.id, id)).returning();
    return updated;
  }

  async createPricingConfig(config: InsertPricingConfig): Promise<PricingConfig> {
    const [created] = await db.insert(pricingConfig).values(config).returning();
    return created;
  }

  async deletePricingConfig(id: number): Promise<boolean> {
    const result = await db.delete(pricingConfig).where(eq(pricingConfig.id, id)).returning();
    return result.length > 0;
  }

  // ── Finishing options ──────────────────────────────────────────────────────

  async getFinishingOptions(): Promise<FinishingOption[]> {
    return db.select().from(finishingOptions).orderBy(finishingOptions.sortOrder);
  }

  async updateFinishingOption(id: number, option: Partial<InsertFinishingOption>): Promise<FinishingOption | undefined> {
    const [updated] = await db.update(finishingOptions).set(option).where(eq(finishingOptions.id, id)).returning();
    return updated;
  }

  async createFinishingOption(option: InsertFinishingOption): Promise<FinishingOption> {
    const [created] = await db.insert(finishingOptions).values(option).returning();
    return created;
  }

  async deleteFinishingOption(id: number): Promise<boolean> {
    const result = await db.delete(finishingOptions).where(eq(finishingOptions.id, id)).returning();
    return result.length > 0;
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async getSavedProjects(stage?: string): Promise<(SavedProject & { spaceCount: number })[]> {
    const rows = await db
      .select({
        project: savedProjects,
        spaceCount: sql<number>`cast(count(${spaces.id}) as int)`,
      })
      .from(savedProjects)
      .leftJoin(spaces, eq(spaces.projectId, savedProjects.id))
      .where(stage ? eq(savedProjects.stage, stage) : undefined)
      .groupBy(savedProjects.id)
      .orderBy(desc(savedProjects.updatedAt));

    return rows.map(({ project, spaceCount }) => ({ ...project, spaceCount }));
  }

  async getSavedProject(id: number): Promise<(SavedProject & { spaces: Space[] }) | undefined> {
    const [project] = await db.select().from(savedProjects).where(eq(savedProjects.id, id));
    if (!project) return undefined;

    const projectSpaces = await db
      .select()
      .from(spaces)
      .where(eq(spaces.projectId, id))
      .orderBy(spaces.sortOrder);

    return { ...project, spaces: projectSpaces };
  }

  async createSavedProject(project: InsertSavedProject): Promise<SavedProject> {
    const [created] = await db.insert(savedProjects).values(project).returning();
    return created;
  }

  async updateSavedProject(id: number, updates: Partial<InsertSavedProject>): Promise<SavedProject | undefined> {
    const [updated] = await db
      .update(savedProjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(savedProjects.id, id))
      .returning();
    return updated;
  }

  async deleteSavedProject(id: number): Promise<boolean> {
    const result = await db.delete(savedProjects).where(eq(savedProjects.id, id)).returning();
    return result.length > 0;
  }

  async searchProjectsByPhone(phone: string): Promise<(SavedProject & { spaceCount: number })[]> {
    const rows = await db
      .select({
        project: savedProjects,
        spaceCount: sql<number>`cast(count(${spaces.id}) as int)`,
      })
      .from(savedProjects)
      .leftJoin(spaces, eq(spaces.projectId, savedProjects.id))
      .where(ilike(savedProjects.clientPhone, `%${phone}%`))
      .groupBy(savedProjects.id)
      .orderBy(desc(savedProjects.updatedAt));

    return rows.map(({ project, spaceCount }) => ({ ...project, spaceCount }));
  }

  async searchProjectsByName(name: string): Promise<(SavedProject & { spaceCount: number })[]> {
    const rows = await db
      .select({
        project: savedProjects,
        spaceCount: sql<number>`cast(count(${spaces.id}) as int)`,
      })
      .from(savedProjects)
      .leftJoin(spaces, eq(spaces.projectId, savedProjects.id))
      .where(ilike(savedProjects.clientName, `%${name}%`))
      .groupBy(savedProjects.id)
      .orderBy(desc(savedProjects.updatedAt));

    return rows.map(({ project, spaceCount }) => ({ ...project, spaceCount }));
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────

  async getSpaces(projectId: number): Promise<Space[]> {
    return db
      .select()
      .from(spaces)
      .where(eq(spaces.projectId, projectId))
      .orderBy(spaces.sortOrder);
  }

  async getSpace(id: number): Promise<Space | undefined> {
    const [space] = await db.select().from(spaces).where(eq(spaces.id, id));
    return space;
  }

  async createSpace(space: InsertSpace): Promise<Space> {
    const [created] = await db.insert(spaces).values(space).returning();
    return created;
  }

  async updateSpace(id: number, updates: Partial<InsertSpace>): Promise<Space | undefined> {
    const [updated] = await db
      .update(spaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(spaces.id, id))
      .returning();
    return updated;
  }

  async updateSpaceReference(id: number, referenceImage: string): Promise<Space | undefined> {
    const [updated] = await db
      .update(spaces)
      .set({ referenceImage, updatedAt: new Date() })
      .where(eq(spaces.id, id))
      .returning();
    return updated;
  }

  async deleteSpace(id: number): Promise<boolean> {
    const result = await db.delete(spaces).where(eq(spaces.id, id)).returning();
    return result.length > 0;
  }

  // ── Photos ─────────────────────────────────────────────────────────────────

  async getSpacePhotos(spaceId: number): Promise<SpacePhoto[]> {
    return db
      .select()
      .from(spacePhotos)
      .where(eq(spacePhotos.spaceId, spaceId))
      .orderBy(desc(spacePhotos.createdAt));
  }

  async createSpacePhoto(photo: InsertSpacePhoto): Promise<SpacePhoto> {
    const [created] = await db.insert(spacePhotos).values(photo).returning();
    return created;
  }

  async deleteSpacePhoto(id: number): Promise<boolean> {
    const result = await db.delete(spacePhotos).where(eq(spacePhotos.id, id)).returning();
    return result.length > 0;
  }

  // ── Element definitions ────────────────────────────────────────────────────

  async getElementDefinitions(): Promise<ElementDefinition[]> {
    return db
      .select()
      .from(elementDefinitions)
      .where(eq(elementDefinitions.isActive, true))
      .orderBy(elementDefinitions.category, elementDefinitions.name);
  }

  async createElementDefinition(def: InsertElementDefinition): Promise<ElementDefinition> {
    const [created] = await db.insert(elementDefinitions).values(def).returning();
    return created;
  }

  async updateElementDefinition(id: number, updates: Partial<InsertElementDefinition>): Promise<ElementDefinition | undefined> {
    const [updated] = await db
      .update(elementDefinitions)
      .set(updates)
      .where(eq(elementDefinitions.id, id))
      .returning();
    return updated;
  }

  // ── Wall points ────────────────────────────────────────────────────────────

  async getWallPoints(spaceId: number): Promise<WallPoint[]> {
    return db.select().from(wallPoints).where(eq(wallPoints.spaceId, spaceId)).orderBy(wallPoints.createdAt);
  }

  async createWallPoint(point: InsertWallPoint): Promise<WallPoint> {
    const [created] = await db.insert(wallPoints).values(point).returning();
    return created;
  }

  async deleteWallPoint(id: number): Promise<boolean> {
    const result = await db.delete(wallPoints).where(eq(wallPoints.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async listUsers(): Promise<Omit<User, "passwordHash">[]> {
    const rows = await db.select().from(users).orderBy(users.createdAt);
    return rows.map(({ passwordHash: _ph, ...rest }) => rest);
  }
}

export const storage = new DatabaseStorage();
