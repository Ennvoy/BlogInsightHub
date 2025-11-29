import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Search Configuration - 搜尋條件設定
export const searchConfigs = pgTable("search_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  language: text("language").notNull().default('zh-tw'),
  keywords: text("keywords").array().notNull(),
  sources: jsonb("sources").$type<{
    google: boolean;
    rss: boolean;
    social: boolean;
    news: boolean;
  }>().notNull(),
  filters: jsonb("filters").$type<{
    minWordCount: number;
    maxTrafficRank: number;
    excludeGovEdu: boolean;
    requireImages: boolean;
    negativeKeywords: string[];
  }>().notNull(),
  // 信件模板設定
  emailTemplate: jsonb("email_template").$type<{
    subject: string;
    body: string;
  }>().notNull().default({ subject: "[預設主旨]", body: "[預設信件內容]" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Blogger Leads - 部落客名單
export const bloggerLeads = pgTable("blogger_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  domain: text("domain").notNull(),
  snippet: text("snippet"),
  keywords: text("keywords").array().notNull(),
  aiScore: integer("ai_score").notNull(),
  trafficEstimate: text("traffic_estimate"),
  domainAuthority: integer("domain_authority"),
  serpRank: text("serp_rank"),
  contactEmail: text("contact_email"),
  aiAnalysis: text("ai_analysis"),
  status: text("status").notNull().default('pending_review'), // pending_review, approved, rejected, auto_filtered
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Review Decisions - 審核記錄
export const reviewDecisions = pgTable("review_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => bloggerLeads.id),
  decision: text("decision").notNull(), // yes, no
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Collaborations - 合作追蹤
export const collaborations = pgTable("collaborations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => bloggerLeads.id),
  bloggerName: text("blogger_name").notNull(),
  blogName: text("blog_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default('drafting'), // drafting, contacted, negotiating, closed, rejected
  stage: text("stage").notNull(),
  nextAction: text("next_action"),
  lastContactDate: timestamp("last_contact_date"),
  budget: integer("budget"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Schedules - 搜尋排程
export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  frequency: text("frequency").notNull(), // daily, weekly, monthly
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  hour: integer("hour").notNull(), // 0-23
  minute: integer("minute").notNull().default(0), // 0-59
  isEnabled: boolean("is_enabled").notNull().default(true),
  enabledAt: timestamp("enabled_at").notNull().defaultNow(), // 啟用日期
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"), // success, error, pending
  nextRunAt: timestamp("next_run_at"),
  notes: text("notes"),
  // 搜尋設定相關
  coreKeywords: text("core_keywords").array().notNull().default([]),
  searchConfig: jsonb("search_config").$type<{
    industry: string;
    language: string;
    region: string;
    minWords: number;
    maxTrafficRank: number;
    excludeGovEdu: boolean;
    requireImages: boolean;
    requireEmail: boolean;
    avoidDuplicates: boolean;
    negativeKeywords: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Zod schemas for validation
export const insertSearchConfigSchema = createInsertSchema(searchConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBloggerLeadSchema = createInsertSchema(bloggerLeads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReviewDecisionSchema = createInsertSchema(reviewDecisions).omit({
  id: true,
  createdAt: true,
});

export const insertCollaborationSchema = createInsertSchema(collaborations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScheduleSchema = createInsertSchema(schedules)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    lastRunAt: true,
    nextRunAt: true,
  })
  .extend({
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  });

// TypeScript types
export type InsertSearchConfig = z.infer<typeof insertSearchConfigSchema>;
export type SearchConfig = typeof searchConfigs.$inferSelect;

export type InsertBloggerLead = z.infer<typeof insertBloggerLeadSchema>;
export type BloggerLead = typeof bloggerLeads.$inferSelect;

export type InsertReviewDecision = z.infer<typeof insertReviewDecisionSchema>;
export type ReviewDecision = typeof reviewDecisions.$inferSelect;

export type InsertCollaboration = z.infer<typeof insertCollaborationSchema>;
export type Collaboration = typeof collaborations.$inferSelect;

export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

// System Settings - 單一設定列，用於儲存全域可調整的系統參數
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serpResultsNum: integer("serp_results_num").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;