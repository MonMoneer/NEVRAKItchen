import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { storage } from "./storage";
import { passport, hashPassword } from "./auth";
import {
  insertAdminSettingsSchema,
  insertSavedProjectSchema,
  insertSpaceSchema,
  insertSpacePhotoSchema,
  insertElementDefinitionSchema,
  insertUserSchema,
  insertProjectAttachmentSchema,
  insertDreamHomeFinishSchema,
  insertDreamHomePriceSchema,
  insertTallHeightSchema,
  insertPricingSettingsSchema,
  timelineDataSchema,
  PREPARED_BY_OPTIONS,
  USER_PERMISSIONS,
} from "@shared/schema";
import type { User, UserPermissionKey, PricingSettings, DreamHomePrice, TallHeight } from "@shared/schema";
import { nanoid } from "nanoid";
import { renderTimeline, renderTimelineNotFound } from "./timeline-template";

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/**
 * Access is per user, not per role: an admin is just a user who happens to
 * have every flag set, so the check is always on the flag itself.
 */
function requirePermission(key: UserPermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as User;
    if (!user[key]) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

/** The signed-in user, or undefined when the request is anonymous. */
function currentUser(req: Request): User | undefined {
  return req.isAuthenticated() ? (req.user as User) : undefined;
}

// ─── Cost hiding ──────────────────────────────────────────────────────────────
// A user without canSeeCosts must never receive the factory CNY rate or the
// margin -- not merely hidden in the UI, but absent from the payload. Because
// toAED is linear in the CNY figure (aed = cny * fx * shipping *
// (1/margin + packing - 1)) we can fold that whole constant into the rates
// themselves and hand the browser multipliers of 1. The client's arithmetic is
// untouched and still lands on exactly the same AED.

function aedFactor(s: PricingSettings): number {
  const fx = Number(s.fxRate);
  const packing = Number(s.packingMult);
  const shipping = Number(s.shippingMult);
  const margin = Number(s.marginDiv);
  if (!margin) return 0;
  return fx * shipping * (1 / margin + packing - 1);
}

/** Scale a numeric column (Drizzle hands these back as strings). */
function scaleNumeric(value: string | number, k: number): string {
  // 4 dp, not 2: these go over the wire only, and rounding a rate to the fils
  // would drift by a few fils once multiplied out over a long run.
  return (Number(value) * k).toFixed(4);
}

function hideCostsInSettings(s: PricingSettings): PricingSettings & { costsHidden: true } {
  const k = aedFactor(s);
  return {
    ...s,
    // Neutralised so toAED() becomes the identity function.
    fxRate: "1",
    packingMult: "1",
    shippingMult: "1",
    marginDiv: "1",
    // Pre-converted to AED by the same factor.
    decorativeCnyPerM2: scaleNumeric(s.decorativeCnyPerM2, k),
    shelfSsRateCnyPerM2: scaleNumeric(s.shelfSsRateCnyPerM2, k),
    shelfGlassRateCnyPerPc: scaleNumeric(s.shelfGlassRateCnyPerPc, k),
    // drawerFlatAed is already AED and never passes through toAED().
    costsHidden: true,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { passwordHash: _ph, ...safeUser } = user;
        res.json({ user: safeUser });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { passwordHash: _ph, ...safeUser } = req.user as User;
    res.json({ user: safeUser });
  });

  // ── Admin settings ────────────────────────────────────────────────────────

  app.get("/api/admin/settings", async (_req, res) => {
    const settings = await storage.getAdminSettings();
    res.json(settings || {});
  });

  app.put("/api/admin/settings", requirePermission("canAccessAdmin"), async (req, res) => {
    const parsed = insertAdminSettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateAdminSettings(parsed.data);
    res.json(updated);
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  app.get("/api/projects", async (req, res) => {
    const stage = req.query.stage as string | undefined;
    const projects = await storage.getSavedProjects(stage);
    res.json(projects);
  });

  app.get("/api/projects/search", async (req, res) => {
    const phone = req.query.phone as string | undefined;
    const name = req.query.name as string | undefined;

    if (phone && phone.trim().length > 0) {
      const projects = await storage.searchProjectsByPhone(phone.trim());
      return res.json(projects);
    }
    if (name && name.trim().length > 0) {
      const projects = await storage.searchProjectsByName(name.trim());
      return res.json(projects);
    }
    res.status(400).json({ error: "phone or name query parameter is required" });
  });

  /**
   * The names offered in the "Prepared by" dropdown: the display name of every
   * active account. A blank display name means "not a salesperson", which is
   * what keeps service logins like `technician` out of the list.
   *
   * Until someone has been given a display name the old hardcoded roster
   * stands in, so the dropdown is never empty. Set display names on real
   * accounts and the roster is replaced by them -- that is how a salesperson
   * is added or removed from here without a code change.
   */
  async function salespeopleNames(): Promise<string[]> {
    const rows = await storage.listUsers();
    const fromUsers = Array.from(
      new Set(
        rows
          .filter((u) => u.isActive)
          .map((u) => u.displayName.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return fromUsers.length > 0 ? fromUsers : [...PREPARED_BY_OPTIONS];
  }

  app.get("/api/salespeople", requireAuth, async (_req, res) => {
    res.json(await salespeopleNames());
  });

  app.post("/api/projects", async (req, res) => {
    const parsed = insertSavedProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    // Accept the old roster too, so a project created from a stale tab (or an
    // integration) with a legacy name still saves.
    const validNames = [...(await salespeopleNames()), ...PREPARED_BY_OPTIONS];
    if (!parsed.data.preparedBy || !validNames.includes(parsed.data.preparedBy)) {
      return res.status(400).json({ error: "preparedBy is required and must be a valid salesperson" });
    }

    const project = await storage.createSavedProject(parsed.data);

    // Auto-create a default space for new projects
    await storage.createSpace({
      projectId: project.id,
      name: "Kitchen",
      type: "kitchen",
      canvasData: null,
      finishing: parsed.data.selectedFinishing || "1",
      notes: "",
      sortOrder: 0,
    });

    const full = await storage.getSavedProject(project.id);
    res.status(201).json(full);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const project = await storage.getSavedProject(id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  });

  app.put("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertSavedProjectSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateSavedProject(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Project not found" });
    res.json(updated);
  });

  app.delete("/api/projects/:id", requirePermission("canDeleteProjects"), async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteSavedProject(id);
    if (!deleted) return res.status(404).json({ error: "Project not found" });
    res.json({ success: true });
  });

  // ── Project Timeline (client-facing delivery schedule) ──────────────────────

  // Admin: load a project's timeline for editing (404 if none yet).
  app.get("/api/projects/:projectId/timeline", requireAuth, async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid id" });
    const timeline = await storage.getTimelineByProject(projectId);
    if (!timeline) return res.status(404).json({ error: "No timeline" });
    res.json(timeline);
  });

  // Admin: create-or-update the timeline; mints a shareToken on first save.
  app.put("/api/projects/:projectId/timeline", requireAuth, async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid id" });
    const parsed = timelineDataSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const existing = await storage.getTimelineByProject(projectId);
    const token = existing?.shareToken ?? nanoid(12);
    const userId = (req.user as User | undefined)?.id ?? null;
    const saved = await storage.upsertTimeline(projectId, parsed.data, token, userId);
    res.json(saved);
  });

  // PUBLIC: client-facing timeline page (no auth). Top-level route so it wins
  // over the SPA fallback (registerRoutes runs before serveStatic/vite).
  app.get("/timeline/:token", async (req, res) => {
    const timeline = await storage.getTimelineByShareToken(req.params.token);
    res
      .status(timeline ? 200 : 404)
      .type("html")
      .send(timeline ? renderTimeline(timeline.data) : renderTimelineNotFound());
  });

  // Internal tool, gated on canAccessScheduleBuilder. Top-level route so it
  // wins over the SPA fallback
  // (registerRoutes runs before serveStatic/vite).
  app.get("/schedule-builder", (req, res) => {
    if (!req.isAuthenticated() || !(req.user as User).canAccessScheduleBuilder) {
      return res.redirect("/login");
    }
    // esbuild's CJS production bundle provides a real __dirname; tsx's dev-time
    // ESM execution doesn't, so fall back to import.meta.url there.
    const moduleDir =
      typeof __dirname !== "undefined"
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));
    res.type("html").sendFile(path.resolve(moduleDir, "schedule-builder.html"));
  });

  // Schedule Builder data — one shared list of projects for every admin, backed
  // by Postgres instead of each device's own localStorage.
  app.get("/api/schedule-builder/projects", async (req, res) => {
    if (!req.isAuthenticated() || !(req.user as User).canAccessScheduleBuilder) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const projects = await storage.getScheduleBuilderProjects();
    res.json({ projects });
  });

  app.put("/api/schedule-builder/projects", async (req, res) => {
    if (!req.isAuthenticated() || !(req.user as User).canAccessScheduleBuilder) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!Array.isArray(req.body?.projects)) {
      return res.status(400).json({ error: "projects must be an array" });
    }
    const saved = await storage.saveScheduleBuilderProjects(req.body.projects);
    res.json({ projects: saved });
  });

  // ── Spaces ────────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/spaces", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    const spaceList = await storage.getSpaces(projectId);
    res.json(spaceList);
  });

  app.post("/api/projects/:projectId/spaces", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });

    const parsed = insertSpaceSchema.safeParse({ ...req.body, projectId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const space = await storage.createSpace(parsed.data);
    res.status(201).json(space);
  });

  app.get("/api/spaces/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const space = await storage.getSpace(id);
    if (!space) return res.status(404).json({ error: "Space not found" });
    res.json(space);
  });

  app.put("/api/spaces/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertSpaceSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateSpace(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Space not found" });
    res.json(updated);
  });

  app.put("/api/spaces/:id/reference", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { referenceImage } = req.body;
    if (!referenceImage) return res.status(400).json({ error: "referenceImage is required" });
    const updated = await storage.updateSpaceReference(id, referenceImage);
    if (!updated) return res.status(404).json({ error: "Space not found" });
    res.json(updated);
  });

  app.delete("/api/spaces/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteSpace(id);
    if (!deleted) return res.status(404).json({ error: "Space not found" });
    res.json({ success: true });
  });

  // ── Photos ────────────────────────────────────────────────────────────────

  app.get("/api/spaces/:spaceId/photos", async (req, res) => {
    const spaceId = parseInt(req.params.spaceId);
    if (isNaN(spaceId)) return res.status(400).json({ error: "Invalid spaceId" });
    const photos = await storage.getSpacePhotos(spaceId);
    // Don't send base64 data in list — only id, caption, createdAt
    res.json(photos.map(({ data: _d, ...meta }) => meta));
  });

  app.get("/api/photos/:id", async (req, res) => {
    // Returns full photo including base64 data
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const photos = await storage.getSpacePhotos(0); // will fix with direct query below
    // Actually we need a getPhotoById — handled by returning full data here via space list
    res.status(501).json({ error: "Use GET /api/spaces/:id/photos" });
  });

  app.post("/api/spaces/:spaceId/photos", async (req, res) => {
    const spaceId = parseInt(req.params.spaceId);
    if (isNaN(spaceId)) return res.status(400).json({ error: "Invalid spaceId" });
    const parsed = insertSpacePhotoSchema.safeParse({ ...req.body, spaceId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const photo = await storage.createSpacePhoto(parsed.data);
    const { data: _d, ...meta } = photo;
    res.status(201).json(meta);
  });

  app.delete("/api/photos/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteSpacePhoto(id);
    if (!deleted) return res.status(404).json({ error: "Photo not found" });
    res.json({ success: true });
  });

  // ── Wall points (electrical / plumbing site measurement) ─────────────────

  app.get("/api/spaces/:spaceId/wall-points", async (req, res) => {
    const spaceId = parseInt(req.params.spaceId);
    if (isNaN(spaceId)) return res.status(400).json({ error: "Invalid spaceId" });
    const points = await storage.getWallPoints(spaceId);
    res.json(points);
  });

  app.post("/api/spaces/:spaceId/wall-points", async (req, res) => {
    const spaceId = parseInt(req.params.spaceId);
    if (isNaN(spaceId)) return res.status(400).json({ error: "Invalid spaceId" });
    const point = await storage.createWallPoint({ ...req.body, spaceId });
    res.status(201).json(point);
  });

  app.delete("/api/wall-points/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteWallPoint(id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  });

  // ── Attachments ──────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/attachments", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    const attachments = await storage.getAttachments(projectId);
    res.json(attachments);
  });

  app.post("/api/projects/:projectId/attachments", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    const parsed = insertProjectAttachmentSchema.safeParse({ ...req.body, projectId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const attachment = await storage.createAttachment(parsed.data);
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteAttachment(id);
    if (!deleted) return res.status(404).json({ error: "Attachment not found" });
    res.json({ success: true });
  });

  // ── Element definitions ───────────────────────────────────────────────────

  app.get("/api/element-definitions", async (_req, res) => {
    const defs = await storage.getElementDefinitions();
    res.json(defs);
  });

  app.post("/api/element-definitions", async (req, res) => {
    const parsed = insertElementDefinitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await storage.createElementDefinition(parsed.data);
    res.status(201).json(created);
  });

  app.put("/api/element-definitions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertElementDefinitionSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateElementDefinition(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Element definition not found" });
    res.json(updated);
  });

  // ── Users (admin only) ────────────────────────────────────────────────────

  const PERMISSION_KEYS = USER_PERMISSIONS.map((p) => p.key);

  app.get("/api/users", requirePermission("canAccessAdmin"), async (_req, res) => {
    const userList = await storage.listUsers();
    res.json(userList);
  });

  app.post("/api/users", requirePermission("canAccessAdmin"), async (req, res) => {
    const { password, ...rest } = req.body;
    if (!password) return res.status(400).json({ error: "password is required" });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const parsed = insertUserSchema.omit({ passwordHash: true }).safeParse(rest);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    // Check username uniqueness
    const existing = await storage.getUserByUsername(rest.username);
    if (existing) return res.status(409).json({ error: "Username already taken" });

    const user = await storage.createUser({ ...parsed.data, passwordHash: hashPassword(password) });
    const { passwordHash: _ph, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  app.put("/api/users/:id", requirePermission("canAccessAdmin"), async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const target = await storage.getUserById(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    const { password, username, displayName, role, isActive } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (username !== undefined) {
      const name = String(username).trim();
      if (!name) return res.status(400).json({ error: "Username cannot be empty" });
      const clash = await storage.getUserByUsername(name);
      if (clash && clash.id !== id) return res.status(409).json({ error: "Username already taken" });
      updates.username = name;
    }
    if (displayName !== undefined) updates.displayName = String(displayName).trim();
    if (role !== undefined) {
      if (!["admin", "sales", "technician"].includes(String(role))) {
        return res.status(400).json({ error: "Invalid role" });
      }
      updates.role = String(role);
    }
    if (password !== undefined && password !== "") {
      if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      updates.passwordHash = hashPassword(String(password));
    }
    for (const key of PERMISSION_KEYS) {
      if (req.body?.[key] !== undefined) updates[key] = !!req.body[key];
    }
    if (isActive !== undefined) updates.isActive = !!isActive;

    // Guardrails: never let an admin lock themselves -- or everyone -- out.
    const me = currentUser(req)!;
    const losesAdmin = updates.canAccessAdmin === false || updates.isActive === false;
    if (losesAdmin && target.id === me.id) {
      return res.status(400).json({ error: "You cannot remove your own admin access." });
    }
    if (losesAdmin && target.canAccessAdmin && target.isActive) {
      const admins = await storage.countAdminUsers();
      if (admins <= 1) return res.status(400).json({ error: "At least one account must keep admin access." });
    }

    const updated = await storage.updateUser(id, updates as any);
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json(updated);
  });

  app.delete("/api/users/:id", requirePermission("canAccessAdmin"), async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const target = await storage.getUserById(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    const me = currentUser(req)!;
    if (target.id === me.id) return res.status(400).json({ error: "You cannot delete your own account." });
    if (target.canAccessAdmin && target.isActive) {
      const admins = await storage.countAdminUsers();
      if (admins <= 1) return res.status(400).json({ error: "At least one account must keep admin access." });
    }

    // Projects and timelines point at their author. Deleting the row would
    // take that history with it, so such accounts are deactivated instead:
    // they can no longer log in, but every quotation keeps its author.
    if (await storage.isUserReferenced(id)) {
      const deactivated = await storage.updateUser(id, { isActive: false } as any);
      return res.json({ deleted: false, deactivated: true, user: deactivated });
    }

    await storage.deleteUser(id);
    res.json({ deleted: true, deactivated: false });
  });

  // ── Dream Home Pricing ────────────────────────────────────────────────────

  app.get("/api/dream-home/finishes", async (_req, res) => {
    res.json(await storage.listDreamHomeFinishes());
  });

  app.put("/api/dream-home/finishes/:id", requirePermission("canAccessAdmin"), async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertDreamHomeFinishSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateDreamHomeFinish(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Finish not found" });
    res.json(updated);
  });

  app.get("/api/dream-home/prices", async (req, res) => {
    const rows = await storage.listDreamHomePrices();
    const user = currentUser(req);
    if (user?.canSeeCosts) return res.json(rows);
    const settings = await storage.getPricingSettings();
    const k = settings ? aedFactor(settings) : 0;
    res.json(rows.map((r: DreamHomePrice) => ({ ...r, priceCnyPerM: scaleNumeric(r.priceCnyPerM, k) })));
  });

  app.put("/api/dream-home/prices", requirePermission("canAccessAdmin"), requirePermission("canSeeCosts"), async (req, res) => {
    const parsed = insertDreamHomePriceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(await storage.upsertDreamHomePrice(parsed.data));
  });

  app.get("/api/dream-home/tall-heights", async (req, res) => {
    const rows = await storage.listTallHeights();
    const user = currentUser(req);
    if (user?.canSeeCosts) return res.json(rows);
    const settings = await storage.getPricingSettings();
    const k = settings ? aedFactor(settings) : 0;
    res.json(rows.map((r: TallHeight) => ({ ...r, priceCnyPerM: scaleNumeric(r.priceCnyPerM, k) })));
  });

  app.put("/api/dream-home/tall-heights", requirePermission("canAccessAdmin"), requirePermission("canSeeCosts"), async (req, res) => {
    const parsed = insertTallHeightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(await storage.upsertTallHeight(parsed.data));
  });

  app.get("/api/pricing-settings", async (req, res) => {
    const settings = await storage.getPricingSettings();
    const user = currentUser(req);
    if (!settings || user?.canSeeCosts) return res.json(settings);
    res.json(hideCostsInSettings(settings));
  });

  app.put("/api/pricing-settings", requirePermission("canAccessAdmin"), requirePermission("canSeeCosts"), async (req, res) => {
    const parsed = insertPricingSettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.json(await storage.updatePricingSettings(parsed.data));
  });

  return httpServer;
}
