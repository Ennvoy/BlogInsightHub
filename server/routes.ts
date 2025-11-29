import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { refreshSchedule, unregisterSchedule, registerSchedule, calculateNextRun } from "./scheduler";
import { 
  insertSearchConfigSchema, 
  insertBloggerLeadSchema, 
  insertReviewDecisionSchema,
  insertCollaborationSchema,
  insertScheduleSchema
} from "@shared/schema";
import { z } from "zod";

const settingsUpdateSchema = z.object({
  serpResultsNum: z.number().int().min(1).max(100).optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ============ Stats API ============
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ============ Search Configurations API ============
  app.get("/api/search-configs", async (req, res) => {
    try {
      const configs = await storage.getSearchConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Error fetching search configs:", error);
      res.status(500).json({ error: "Failed to fetch search configurations" });
    }
  });

  app.get("/api/search-configs/:id", async (req, res) => {
    try {
      const config = await storage.getSearchConfig(req.params.id);
      if (!config) {
        return res.status(404).json({ error: "Search configuration not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Error fetching search config:", error);
      res.status(500).json({ error: "Failed to fetch search configuration" });
    }
  });

  // ============ Settings API ============
  app.get("/api/settings", async (req, res) => {
    try {
      const s = await storage.getSettings();
      res.json(s);
    } catch (error) {
      console.error("Error fetching settings:", error);
      const msg = (error && (error as any).message) || String(error);
      if (/relation ".*settings" does not exist|no such table: settings/i.test(msg)) {
        return res.status(500).json({ error: "Settings table not found. Run `npm run db:push` to create DB tables." });
      }
      res.status(500).json({ error: "Failed to fetch settings", detail: msg });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const validated = settingsUpdateSchema.parse(req.body);
      const updated = await storage.updateSettings(validated as any);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      console.error("Error updating settings:", error);
      const msg = (error && (error as any).message) || String(error);
      if (/relation ".*settings" does not exist|no such table: settings/i.test(msg)) {
        return res.status(500).json({ error: "Settings table not found. Run `npm run db:push` to create DB tables." });
      }
      res.status(500).json({ error: "Failed to update settings", detail: msg });
    }
  });

  app.post("/api/search-configs", async (req, res) => {
    try {
      const validatedData = insertSearchConfigSchema.parse(req.body);
      const config = await storage.createSearchConfig(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating search config:", error);
      res.status(500).json({ error: "Failed to create search configuration" });
    }
  });

  app.patch("/api/search-configs/:id", async (req, res) => {
    try {
      const validatedData = insertSearchConfigSchema.partial().parse(req.body);
      const config = await storage.updateSearchConfig(req.params.id, validatedData);
      if (!config) {
        return res.status(404).json({ error: "Search configuration not found" });
      }
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating search config:", error);
      res.status(500).json({ error: "Failed to update search configuration" });
    }
  });

  app.delete("/api/search-configs/:id", async (req, res) => {
    try {
      const success = await storage.deleteSearchConfig(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Search configuration not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting search config:", error);
      res.status(500).json({ error: "Failed to delete search configuration" });
    }
  });

  // ============ Blogger Leads API ============
  app.get("/api/blogger-leads", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const status = req.query.status as string | undefined;
      const leads = await storage.getBloggerLeads(limit, status);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching blogger leads:", error);
      res.status(500).json({ error: "Failed to fetch blogger leads" });
    }
  });

  app.get("/api/blogger-leads/:id", async (req, res) => {
    try {
      const lead = await storage.getBloggerLead(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: "Blogger lead not found" });
      }
      res.json(lead);
    } catch (error) {
      console.error("Error fetching blogger lead:", error);
      res.status(500).json({ error: "Failed to fetch blogger lead" });
    }
  });

  app.post("/api/blogger-leads", async (req, res) => {
    try {
      const validatedData = insertBloggerLeadSchema.parse(req.body);
      
      // Check if URL already exists
      const existing = await storage.getBloggerLeadByUrl(validatedData.url);
      if (existing) {
        return res.status(409).json({ error: "A lead with this URL already exists" });
      }
      
      const lead = await storage.createBloggerLead(validatedData);
      res.status(201).json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating blogger lead:", error);
      res.status(500).json({ error: "Failed to create blogger lead" });
    }
  });

  app.patch("/api/blogger-leads/:id", async (req, res) => {
    try {
      const validatedData = insertBloggerLeadSchema.partial().parse(req.body);
      const lead = await storage.updateBloggerLead(req.params.id, validatedData);
      if (!lead) {
        return res.status(404).json({ error: "Blogger lead not found" });
      }
      res.json(lead);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating blogger lead:", error);
      res.status(500).json({ error: "Failed to update blogger lead" });
    }
  });

  app.delete("/api/blogger-leads/:id", async (req, res) => {
    try {
      const success = await storage.deleteBloggerLead(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Blogger lead not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting blogger lead:", error);
      res.status(500).json({ error: "Failed to delete blogger lead" });
    }
  });

  // ============ Review Decisions API ============
  app.get("/api/review-decisions", async (req, res) => {
    try {
      const decisions = await storage.getReviewDecisions();
      res.json(decisions);
    } catch (error) {
      console.error("Error fetching review decisions:", error);
      res.status(500).json({ error: "Failed to fetch review decisions" });
    }
  });

  app.post("/api/review-decisions", async (req, res) => {
    try {
      const validatedData = insertReviewDecisionSchema.parse(req.body);
      const decision = await storage.createReviewDecision(validatedData);
      
      // Update the lead status based on decision
      const newStatus = validatedData.decision === 'yes' ? 'approved' : 'rejected';
      await storage.updateBloggerLead(validatedData.leadId, {
        status: newStatus,
        reviewedAt: new Date(),
      });
      
      res.status(201).json(decision);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating review decision:", error);
      res.status(500).json({ error: "Failed to create review decision" });
    }
  });

  // ============ Collaborations API ============
  app.get("/api/collaborations", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const collaborations = await storage.getCollaborations(status);
      res.json(collaborations);
    } catch (error) {
      console.error("Error fetching collaborations:", error);
      res.status(500).json({ error: "Failed to fetch collaborations" });
    }
  });

  app.get("/api/collaborations/:id", async (req, res) => {
    try {
      const collaboration = await storage.getCollaboration(req.params.id);
      if (!collaboration) {
        return res.status(404).json({ error: "Collaboration not found" });
      }
      res.json(collaboration);
    } catch (error) {
      console.error("Error fetching collaboration:", error);
      res.status(500).json({ error: "Failed to fetch collaboration" });
    }
  });

  app.post("/api/collaborations", async (req, res) => {
    try {
      const validatedData = insertCollaborationSchema.parse(req.body);
      const collaboration = await storage.createCollaboration(validatedData);
      res.status(201).json(collaboration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating collaboration:", error);
      res.status(500).json({ error: "Failed to create collaboration" });
    }
  });

  app.patch("/api/collaborations/:id", async (req, res) => {
    try {
      const validatedData = insertCollaborationSchema.partial().parse(req.body);
      const collaboration = await storage.updateCollaboration(req.params.id, validatedData);
      if (!collaboration) {
        return res.status(404).json({ error: "Collaboration not found" });
      }
      res.json(collaboration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating collaboration:", error);
      res.status(500).json({ error: "Failed to update collaboration" });
    }
  });

  app.delete("/api/collaborations/:id", async (req, res) => {
    try {
      const success = await storage.deleteCollaboration(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Collaboration not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting collaboration:", error);
      res.status(500).json({ error: "Failed to delete collaboration" });
    }
  });

  // ============ Schedules API ============
  app.get("/api/schedules", async (req, res) => {
    try {
      const schedules = await storage.getSchedules();
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ error: "Failed to fetch schedules" });
    }
  });

  app.get("/api/schedules/:id", async (req, res) => {
    try {
      const schedule = await storage.getSchedule(req.params.id);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching schedule:", error);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      console.log("[routes] POST /api/schedules body:", req.body);
      // Convert enabledAt if it's sent as an ISO string from the client
      if (req.body && typeof req.body.enabledAt === "string") {
        try {
          req.body.enabledAt = new Date(req.body.enabledAt);
        } catch (e) {
          // leave as-is; zod will validate later
        }
      }

      const validated = insertScheduleSchema.parse(req.body);
      const schedule = await storage.createSchedule(validated);

      // 重新從 DB 讀回以取得 drizzle 的標準回傳結構
      const saved = await storage.getSchedule(schedule.id);

      console.log("[routes] created schedule (db):", saved);

      // 計算並儲存下一次執行時間（讓 UI 立即可顯示）
      try {
        if (saved) {
          const nextRun = calculateNextRun(saved);
          await storage.updateSchedule(saved.id, { nextRunAt: nextRun } as any);
        }
      } catch (e) {
        console.error("[routes] failed to set nextRunAt:", e);
      }

      // 重新從 DB 讀取最終物件
      const final = saved ? await storage.getSchedule(saved.id) : schedule;

      // 新建排程後自動註冊到排程引擎（使用最終 DB 回傳的物件）
      if (final) registerSchedule(final);

      res.status(201).json(final || schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      console.error("Error creating schedule:", error);
      res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  app.patch("/api/schedules/:id", async (req, res) => {
    try {
      console.log("[routes] PATCH /api/schedules/:id body:", req.params.id, req.body);
      // Convert enabledAt if it's sent as an ISO string from the client
      if (req.body && typeof req.body.enabledAt === "string") {
        try {
          req.body.enabledAt = new Date(req.body.enabledAt);
        } catch (e) {
          // noop
        }
      }

      const validated = insertScheduleSchema.partial().parse(req.body);
      const schedule = await storage.updateSchedule(req.params.id, validated);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // 從 DB 重新讀取最新物件
      const refreshed = await storage.getSchedule(schedule.id);

      console.log("[routes] updated schedule (db):", refreshed);

      // 更新後計算 nextRunAt 並刷新排程註冊（使用 DB 回傳的物件）
      try {
        if (refreshed) {
          const nextRun = calculateNextRun(refreshed);
          await storage.updateSchedule(refreshed.id, { nextRunAt: nextRun } as any);
        }
      } catch (e) {
        console.error("[routes] failed to set nextRunAt on update:", e);
      }

      // 重新讀取最終物件，並用它去刷新排程註冊
      const finalRefreshed = refreshed ? await storage.getSchedule(refreshed.id) : undefined;
      if (finalRefreshed) refreshSchedule(finalRefreshed);

      res.json(refreshed || schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      console.error("Error updating schedule:", error);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  app.delete("/api/schedules/:id", async (req, res) => {
    try {
      const success = await storage.deleteSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      
      // 刪除後取消排程註冊
      unregisterSchedule(req.params.id);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  return httpServer;
}