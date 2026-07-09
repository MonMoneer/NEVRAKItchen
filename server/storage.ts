import {
  type AdminSettings, type InsertAdminSettings,
  type SavedProject, type InsertSavedProject,
  type Space, type InsertSpace,
  type SpacePhoto, type InsertSpacePhoto,
  type ElementDefinition, type InsertElementDefinition,
  type WallPoint, type InsertWallPoint,
  type User, type InsertUser,
  type ProjectAttachment, type InsertProjectAttachment,
  type DreamHomeFinish, type InsertDreamHomeFinish,
  type DreamHomePrice, type InsertDreamHomePrice,
  type TallHeight, type InsertTallHeight,
  type PricingSettings, type InsertPricingSettings,
  type ProjectTimeline, type TimelineData,
  adminSettings, savedProjects,
  spaces, spacePhotos, elementDefinitions, wallPoints, users,
  projectAttachments,
  dreamHomeFinishes, dreamHomePrices, tallHeights, pricingSettings,
  projectTimelines,
  scheduleBuilderData,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, desc, and, sql } from "drizzle-orm";

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IStorage {
  // Admin settings
  getAdminSettings(): Promise<AdminSettings | undefined>;
  updateAdminSettings(settings: Partial<InsertAdminSettings>): Promise<AdminSettings>;

  // Dream Home Pricing
  listDreamHomeFinishes(): Promise<DreamHomeFinish[]>;
  updateDreamHomeFinish(id: number, updates: Partial<InsertDreamHomeFinish>): Promise<DreamHomeFinish | undefined>;

  listDreamHomePrices(): Promise<DreamHomePrice[]>;
  upsertDreamHomePrice(entry: InsertDreamHomePrice): Promise<DreamHomePrice>;

  listTallHeights(): Promise<TallHeight[]>;
  upsertTallHeight(entry: InsertTallHeight): Promise<TallHeight>;

  getPricingSettings(): Promise<PricingSettings>;
  updatePricingSettings(updates: Partial<InsertPricingSettings>): Promise<PricingSettings>;

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

  // Attachments
  getAttachments(projectId: number): Promise<ProjectAttachment[]>;
  createAttachment(attachment: InsertProjectAttachment): Promise<ProjectAttachment>;
  deleteAttachment(id: number): Promise<boolean>;

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

  // ── Attachments ────────────────────────────────────────────────────────────

  async getAttachments(projectId: number): Promise<ProjectAttachment[]> {
    return db.select().from(projectAttachments).where(eq(projectAttachments.projectId, projectId)).orderBy(desc(projectAttachments.createdAt));
  }

  async createAttachment(attachment: InsertProjectAttachment): Promise<ProjectAttachment> {
    const [created] = await db.insert(projectAttachments).values(attachment).returning();
    return created;
  }

  async deleteAttachment(id: number): Promise<boolean> {
    const [deleted] = await db.delete(projectAttachments).where(eq(projectAttachments.id, id)).returning();
    return !!deleted;
  }

  // ── Dream Home Pricing ────────────────────────────────────────────────────

  async listDreamHomeFinishes(): Promise<DreamHomeFinish[]> {
    return db.select().from(dreamHomeFinishes).orderBy(dreamHomeFinishes.sortOrder);
  }

  async updateDreamHomeFinish(id: number, updates: Partial<InsertDreamHomeFinish>): Promise<DreamHomeFinish | undefined> {
    const [updated] = await db
      .update(dreamHomeFinishes)
      .set(updates)
      .where(eq(dreamHomeFinishes.id, id))
      .returning();
    return updated;
  }

  async listDreamHomePrices(): Promise<DreamHomePrice[]> {
    return db.select().from(dreamHomePrices);
  }

  async upsertDreamHomePrice(entry: InsertDreamHomePrice): Promise<DreamHomePrice> {
    const [existing] = await db
      .select()
      .from(dreamHomePrices)
      .where(and(
        eq(dreamHomePrices.cabinetType, entry.cabinetType),
        eq(dreamHomePrices.finishId, entry.finishId),
      ));
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
      .where(and(
        eq(tallHeights.heightMm, entry.heightMm),
        eq(tallHeights.finishId, entry.finishId),
      ));
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

  // ── Project Timelines ────────────────────────────────────────────────────────

  async getTimelineByProject(projectId: number): Promise<ProjectTimeline | undefined> {
    const [row] = await db
      .select()
      .from(projectTimelines)
      .where(eq(projectTimelines.projectId, projectId));
    return row;
  }

  async getTimelineByShareToken(token: string): Promise<ProjectTimeline | undefined> {
    const [row] = await db
      .select()
      .from(projectTimelines)
      .where(eq(projectTimelines.shareToken, token));
    return row;
  }

  /** Insert on first save, update thereafter (one timeline per project). */
  async upsertTimeline(
    projectId: number,
    data: TimelineData,
    token: string,
    userId: number | null,
  ): Promise<ProjectTimeline> {
    const existing = await this.getTimelineByProject(projectId);
    if (existing) {
      const [updated] = await db
        .update(projectTimelines)
        .set({ data, updatedAt: new Date() })
        .where(eq(projectTimelines.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(projectTimelines)
      .values({ projectId, shareToken: token, data, createdByUserId: userId })
      .returning();
    return created;
  }

  // ── Schedule Builder (internal tool) ─────────────────────────────────────────

  async getScheduleBuilderProjects(): Promise<unknown[]> {
    const [row] = await db.select().from(scheduleBuilderData).limit(1);
    if (row) return row.projects as unknown[];
    const [created] = await db.insert(scheduleBuilderData).values({ projects: [] }).returning();
    return created.projects as unknown[];
  }

  async saveScheduleBuilderProjects(projects: unknown[]): Promise<unknown[]> {
    const [row] = await db.select().from(scheduleBuilderData).limit(1);
    if (row) {
      const [updated] = await db
        .update(scheduleBuilderData)
        .set({ projects, updatedAt: new Date() })
        .where(eq(scheduleBuilderData.id, row.id))
        .returning();
      return updated.projects as unknown[];
    }
    const [created] = await db.insert(scheduleBuilderData).values({ projects }).returning();
    return created.projects as unknown[];
  }
}

export const storage = new DatabaseStorage();
