import type { 
  BloggerLead, 
  InsertBloggerLead,
  Collaboration,
  InsertCollaboration,
  SearchConfig,
  InsertSearchConfig,
  ReviewDecision,
  InsertReviewDecision,
  Schedule,
  InsertSchedule
} from "@shared/schema";

// 🔁 後端 API 基底網址：優先用 Vercel/環境變數，不然就退回本機
const API_BASE = `${
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5001"
}/api`;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

// Stats API（之後要用再實作後端）
export async function getStats() {
  return fetchJson<{
    todayNewLeads: number;
    pendingReview: number;
    monthlyCollaborations: number;
    activeCollaborations: number;
  }>("/stats");
}

// Blogger Leads API
export async function getBloggerLeads(limit?: number, status?: string) {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  if (status) params.append("status", status);
  const query = params.toString();
  return fetchJson<BloggerLead[]>(`/blogger-leads${query ? `?${query}` : ""}`);
}

export async function getBloggerLead(id: string) {
  return fetchJson<BloggerLead>(`/blogger-leads/${id}`);
}

export async function createBloggerLead(lead: InsertBloggerLead) {
  return fetchJson<BloggerLead>("/blogger-leads", {
    method: "POST",
    body: JSON.stringify(lead),
  });
}

export async function updateBloggerLead(id: string, lead: Partial<InsertBloggerLead>) {
  return fetchJson<BloggerLead>(`/blogger-leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(lead),
  });
}

export async function deleteBloggerLead(id: string) {
  return fetchJson<void>(`/blogger-leads/${id}`, {
    method: "DELETE",
  });
}

// Search Configurations API（目前後端還沒實作 REST 版，可先不使用）
export async function getSearchConfigs() {
  return fetchJson<SearchConfig[]>("/search-configs");
}

export async function getSearchConfig(id: string) {
  return fetchJson<SearchConfig>(`/search-configs/${id}`);
}

export async function createSearchConfig(config: InsertSearchConfig) {
  return fetchJson<SearchConfig>("/search-configs", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function updateSearchConfig(id: string, config: Partial<InsertSearchConfig>) {
  return fetchJson<SearchConfig>(`/search-configs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function deleteSearchConfig(id: string) {
  return fetchJson<void>(`/search-configs/${id}`, {
    method: "DELETE",
  });
}

// Review Decisions API（暫時沒用到）
export async function getReviewDecisions() {
  return fetchJson<ReviewDecision[]>("/review-decisions");
}

export async function createReviewDecision(decision: InsertReviewDecision) {
  return fetchJson<ReviewDecision>("/review-decisions", {
    method: "POST",
    body: JSON.stringify(decision),
  });
}

// Collaborations API（之後要用再串後端）
export async function getCollaborations(status?: string) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  const query = params.toString();
  return fetchJson<Collaboration[]>(`/collaborations${query ? `?${query}` : ""}`);
}

export async function getCollaboration(id: string) {
  return fetchJson<Collaboration>(`/collaborations/${id}`);
}

export async function createCollaboration(collaboration: InsertCollaboration) {
  return fetchJson<Collaboration>("/collaborations", {
    method: "POST",
    body: JSON.stringify(collaboration),
  });
}

export async function updateCollaboration(id: string, collaboration: Partial<InsertCollaboration>) {
  return fetchJson<Collaboration>(`/collaborations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(collaboration),
  });
}

export async function deleteCollaboration(id: string) {
  return fetchJson<void>(`/collaborations/${id}`, {
    method: "DELETE",
  });
}

// Schedules API
export async function getSchedules() {
  return fetchJson<Schedule[]>("/schedules");
}

export async function getSchedule(id: string) {
  return fetchJson<Schedule>(`/schedules/${id}`);
}

export async function createSchedule(schedule: InsertSchedule) {
  return fetchJson<Schedule>("/schedules", {
    method: "POST",
    body: JSON.stringify(schedule),
  });
}

export async function updateSchedule(id: string, schedule: Partial<InsertSchedule>) {
  return fetchJson<Schedule>(`/schedules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(schedule),
  });
}

export async function deleteSchedule(id: string) {
  return fetchJson<void>(`/schedules/${id}`, {
    method: "DELETE",
  });
}

// Settings API
export async function getSettings() {
  return fetchJson<any>(`/settings`);
}

export async function updateSettings(payload: { serpResultsNum?: number }) {
  return fetchJson<any>(`/settings`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
