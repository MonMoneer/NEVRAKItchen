import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { passport, hashPassword } from "./auth";
import {
  insertAdminSettingsSchema,
  insertPricingConfigSchema,
  insertFinishingOptionSchema,
  insertSavedProjectSchema,
  insertSpaceSchema,
  insertSpacePhotoSchema,
  insertElementDefinitionSchema,
  insertUserSchema,
  insertProjectAttachmentSchema,
} from "@shared/schema";
import type { User } from "@shared/schema";

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as User;
    if (!roles.includes(user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
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

  app.put("/api/admin/settings", async (req, res) => {
    const parsed = insertAdminSettingsSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateAdminSettings(parsed.data);
    res.json(updated);
  });

  // ── Pricing ───────────────────────────────────────────────────────────────

  app.get("/api/pricing", async (_req, res) => {
    const configs = await storage.getPricingConfigs();
    res.json(configs);
  });

  app.put("/api/pricing", async (req, res) => {
    const { id, ...data } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    const parsed = insertPricingConfigSchema.partial().safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updatePricingConfig(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Pricing config not found" });
    res.json(updated);
  });

  app.post("/api/pricing", async (req, res) => {
    const parsed = insertPricingConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await storage.createPricingConfig(parsed.data);
    res.status(201).json(created);
  });

  app.delete("/api/pricing/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deletePricingConfig(id);
    if (!deleted) return res.status(404).json({ error: "Pricing config not found" });
    res.json({ success: true });
  });

  // ── Finishing options ─────────────────────────────────────────────────────

  app.get("/api/finishing-options", async (_req, res) => {
    const options = await storage.getFinishingOptions();
    res.json(options);
  });

  app.put("/api/finishing-options", async (req, res) => {
    const { id, ...data } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    const parsed = insertFinishingOptionSchema.partial().safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const updated = await storage.updateFinishingOption(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Finishing option not found" });
    res.json(updated);
  });

  app.post("/api/finishing-options", async (req, res) => {
    const parsed = insertFinishingOptionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await storage.createFinishingOption(parsed.data);
    res.status(201).json(created);
  });

  app.delete("/api/finishing-options/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteFinishingOption(id);
    if (!deleted) return res.status(404).json({ error: "Finishing option not found" });
    res.json({ success: true });
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

  app.post("/api/projects", async (req, res) => {
    const parsed = insertSavedProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

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

  app.delete("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteSavedProject(id);
    if (!deleted) return res.status(404).json({ error: "Project not found" });
    res.json({ success: true });
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

  app.get("/api/users", requireRole("admin"), async (_req, res) => {
    const userList = await storage.listUsers();
    res.json(userList);
  });

  app.post("/api/users", requireRole("admin"), async (req, res) => {
    const { password, ...rest } = req.body;
    if (!password) return res.status(400).json({ error: "password is required" });

    const parsed = insertUserSchema.omit({ passwordHash: true }).safeParse(rest);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    // Check username uniqueness
    const existing = await storage.getUserByUsername(rest.username);
    if (existing) return res.status(409).json({ error: "Username already taken" });

    const user = await storage.createUser({ ...parsed.data, passwordHash: hashPassword(password) });
    const { passwordHash: _ph, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  return httpServer;
}
