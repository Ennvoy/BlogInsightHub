import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";
import type {
  SearchConfig,
  InsertSearchConfig,
  BloggerLead,
  InsertBloggerLead,
  ReviewDecision,
  InsertReviewDecision,
  Collaboration,
  InsertCollaboration,
  Schedule,
  InsertSchedule,
  Settings,
  InsertSettings,
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export interface IStorage {
  // Search Configurations
  getSearchConfigs(): Promise<SearchConfig[]>;
  getSearchConfig(id: string): Promise<SearchConfig | undefined>;
  createSearchConfig(config: InsertSearchConfig): Promise<SearchConfig>;
  updateSearchConfig(id: string, config: Partial<InsertSearchConfig>): Promise<SearchConfig | undefined>;
  deleteSearchConfig(id: string): Promise<boolean>;

  // Blogger Leads
  getBloggerLeads(limit?: number, status?: string): Promise<BloggerLead[]>;
  getBloggerLead(id: string): Promise<BloggerLead | undefined>;
  getBloggerLeadByUrl(url: string): Promise<BloggerLead | undefined>;
  createBloggerLead(lead: InsertBloggerLead): Promise<BloggerLead>;
  updateBloggerLead(id: string, lead: Partial<InsertBloggerLead>): Promise<BloggerLead | undefined>;
  deleteBloggerLead(id: string): Promise<boolean>;

  // Review Decisions
  getReviewDecisions(): Promise<ReviewDecision[]>;
  createReviewDecision(decision: InsertReviewDecision): Promise<ReviewDecision>;

  // Collaborations
  getCollaborations(status?: string): Promise<Collaboration[]>;
  getCollaboration(id: string): Promise<Collaboration | undefined>;
  createCollaboration(collaboration: InsertCollaboration): Promise<Collaboration>;
  updateCollaboration(id: string, collaboration: Partial<InsertCollaboration>): Promise<Collaboration | undefined>;
  deleteCollaboration(id: string): Promise<boolean>;

  // Schedules
  getSchedules(): Promise<Schedule[]>;
  getSchedule(id: string): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;

  // Stats
  getStats(): Promise<{
    todayNewLeads: number;
    pendingReview: number;
    monthlyCollaborations: number;
    activeCollaborations: number;
  }>;
  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(payload: Partial<InsertSettings>): Promise<Settings>;
}

export class DatabaseStorage implements IStorage {
  // Search Configurations
  async getSearchConfigs(): Promise<SearchConfig[]> {
    return await db.select().from(schema.searchConfigs).orderBy(desc(schema.searchConfigs.updatedAt));
  }

  async getSearchConfig(id: string): Promise<SearchConfig | undefined> {
    const results = await db.select().from(schema.searchConfigs).where(eq(schema.searchConfigs.id, id));
    return results[0];
  }

  async createSearchConfig(config: InsertSearchConfig): Promise<SearchConfig> {
    const results = await db.insert(schema.searchConfigs).values({
      ...config,
      sources: config.sources as any,
      filters: config.filters as any,
    }).returning();
    return results[0];
  }

  async updateSearchConfig(id: string, config: Partial<InsertSearchConfig>): Promise<SearchConfig | undefined> {
    const updateData: any = { ...config, updatedAt: new Date() };
    if (config.sources) updateData.sources = config.sources as any;
    if (config.filters) updateData.filters = config.filters as any;
    
    const results = await db
      .update(schema.searchConfigs)
      .set(updateData)
      .where(eq(schema.searchConfigs.id, id))
      .returning();
    return results[0];
  }

  async deleteSearchConfig(id: string): Promise<boolean> {
    const results = await db.delete(schema.searchConfigs).where(eq(schema.searchConfigs.id, id)).returning();
    return results.length > 0;
  }

  // Blogger Leads
  async getBloggerLeads(limit: number = 100, status?: string): Promise<BloggerLead[]> {
    if (status) {
      return await db
        .select()
        .from(schema.bloggerLeads)
        .where(eq(schema.bloggerLeads.status, status))
        .orderBy(desc(schema.bloggerLeads.createdAt))
        .limit(limit);
    }
    return await db.select().from(schema.bloggerLeads).orderBy(desc(schema.bloggerLeads.createdAt)).limit(limit);
  }

  async getBloggerLead(id: string): Promise<BloggerLead | undefined> {
    const results = await db.select().from(schema.bloggerLeads).where(eq(schema.bloggerLeads.id, id));
    return results[0];
  }

  async getBloggerLeadByUrl(url: string): Promise<BloggerLead | undefined> {
    const results = await db.select().from(schema.bloggerLeads).where(eq(schema.bloggerLeads.url, url));
    return results[0];
  }

  async createBloggerLead(lead: InsertBloggerLead): Promise<BloggerLead> {
    const results = await db.insert(schema.bloggerLeads).values(lead).returning();
    return results[0];
  }

  async updateBloggerLead(id: string, lead: Partial<InsertBloggerLead>): Promise<BloggerLead | undefined> {
    const results = await db
      .update(schema.bloggerLeads)
      .set({ ...lead, updatedAt: new Date() })
      .where(eq(schema.bloggerLeads.id, id))
      .returning();
    return results[0];
  }

  async deleteBloggerLead(id: string): Promise<boolean> {
    const results = await db.delete(schema.bloggerLeads).where(eq(schema.bloggerLeads.id, id)).returning();
    return results.length > 0;
  }

  // Review Decisions
  async getReviewDecisions(): Promise<ReviewDecision[]> {
    return await db.select().from(schema.reviewDecisions).orderBy(desc(schema.reviewDecisions.createdAt));
  }

  async createReviewDecision(decision: InsertReviewDecision): Promise<ReviewDecision> {
    const results = await db.insert(schema.reviewDecisions).values(decision).returning();
    return results[0];
  }

  // Collaborations
  async getCollaborations(status?: string): Promise<Collaboration[]> {
    if (status) {
      return await db
        .select()
        .from(schema.collaborations)
        .where(eq(schema.collaborations.status, status))
        .orderBy(desc(schema.collaborations.updatedAt));
    }
    return await db.select().from(schema.collaborations).orderBy(desc(schema.collaborations.updatedAt));
  }

  async getCollaboration(id: string): Promise<Collaboration | undefined> {
    const results = await db.select().from(schema.collaborations).where(eq(schema.collaborations.id, id));
    return results[0];
  }

  async createCollaboration(collaboration: InsertCollaboration): Promise<Collaboration> {
    const results = await db.insert(schema.collaborations).values(collaboration).returning();
    return results[0];
  }

  async updateCollaboration(
    id: string,
    collaboration: Partial<InsertCollaboration>
  ): Promise<Collaboration | undefined> {
    const results = await db
      .update(schema.collaborations)
      .set({ ...collaboration, updatedAt: new Date() })
      .where(eq(schema.collaborations.id, id))
      .returning();
    return results[0];
  }

  async deleteCollaboration(id: string): Promise<boolean> {
    const results = await db.delete(schema.collaborations).where(eq(schema.collaborations.id, id)).returning();
    return results.length > 0;
  }

  // Schedules
  async getSchedules(): Promise<Schedule[]> {
    const schedules = await db
      .select()
      .from(schema.schedules)
      .orderBy(desc(schema.schedules.createdAt));
    return schedules;
  }

  async getSchedule(id: string): Promise<Schedule | undefined> {
    const schedules = await db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.id, id));
    return schedules[0];
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    const id = crypto.randomUUID();
    const now = new Date();
    const results = await db
      .insert(schema.schedules)
      .values({
        ...schedule,
        id,
        createdAt: now,
        updatedAt: now,
        isEnabled: (schedule as any).isEnabled ?? true,
      } as any)
      .returning();
    return results[0];
  }

  async updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    const results = await db
      .update(schema.schedules)
      .set({ ...schedule, updatedAt: new Date() } as any)
      .where(eq(schema.schedules.id, id))
      .returning();
    return results[0];
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const results = await db
      .delete(schema.schedules)
      .where(eq(schema.schedules.id, id))
      .returning();
    return results.length > 0;
  }

  // Settings
  async getSettings(): Promise<Settings> {
    const rows = await db.select().from(schema.settings).limit(1);
    if (rows && rows.length > 0) return rows[0];

    // If not exist, create default row
    const id = crypto.randomUUID();
    const now = new Date();
    const results = await db.insert(schema.settings).values({
      id,
      serpResultsNum: 10,
      serpPages: 1,
      createdAt: now,
      updatedAt: now,
    } as any).returning();
    return results[0];
  }

  async updateSettings(payload: Partial<InsertSettings>): Promise<Settings> {
    const rows = await db.select().from(schema.settings).limit(1);
    if (!rows || rows.length === 0) {
      // insert new
      const id = crypto.randomUUID();
      const now = new Date();
      const insertData: any = {
        id,
        serpResultsNum: Math.min(10, payload.serpResultsNum ?? 10),
        serpPages: typeof payload.serpPages === "number" ? payload.serpPages : 1,
        createdAt: now,
        updatedAt: now,
      };
      const results = await db.insert(schema.settings).values(insertData).returning();
      return results[0];
    }

    const existing = rows[0];
    const updateData: any = { updatedAt: new Date() };
    if (typeof payload.serpResultsNum === "number") updateData.serpResultsNum = Math.min(10, payload.serpResultsNum);
    if (typeof payload.serpPages === "number") updateData.serpPages = payload.serpPages;

    const results = await db
      .update(schema.settings)
      .set(updateData)
      .where(eq(schema.settings.id, existing.id))
      .returning();
    return results[0];
  }

  // Stats
  async getStats(): Promise<{
    todayNewLeads: number;
    pendingReview: number;
    monthlyCollaborations: number;
    activeCollaborations: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLeads = await db
      .select()
      .from(schema.bloggerLeads)
      .where(eq(schema.bloggerLeads.createdAt, today));

    const pendingLeads = await db
      .select()
      .from(schema.bloggerLeads)
      .where(eq(schema.bloggerLeads.status, "pending_review"));

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyCollabs = await db
      .select()
      .from(schema.collaborations)
      .where(eq(schema.collaborations.status, "closed"));

    const activeCollabs = await db.select().from(schema.collaborations);

    return {
      todayNewLeads: todayLeads.length,
      pendingReview: pendingLeads.length,
      monthlyCollaborations: monthlyCollabs.filter((c) => new Date(c.createdAt!) >= firstDayOfMonth).length,
      activeCollaborations: activeCollabs.filter((c) => c.status !== "closed" && c.status !== "rejected").length,
    };
  }
}

export const storage = new DatabaseStorage();