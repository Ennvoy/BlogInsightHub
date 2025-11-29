import * as cron from "node-cron";
import { storage } from "./storage";
import type { Schedule } from "@shared/schema";
import axios from "axios";

// 存儲已註冊的任務，便於後續管理
const registeredTasks: Map<string, cron.ScheduledTask> = new Map();

/**
 * 將 Schedule 轉換為 cron 表達式
 * cron 格式: "分 時 日 月 週"
 */
function toCronExpression(schedule: Schedule): string {
  const { frequency, hour, minute, dayOfWeek, dayOfMonth } = schedule;

  // cron 表達式格式：分 時 日 月 週
  // 週：0-6 (0=日, 1=一, 2=二, ..., 6=六)

  if (frequency === "daily") {
    // 每日：* * * * * → 每分鐘（改為指定時間）
    return `${minute} ${hour} * * *`;
  } else if (frequency === "weekly") {
    // 每週特定日期
    const dow = dayOfWeek ?? 0;
    return `${minute} ${hour} * * ${dow}`;
  } else if (frequency === "monthly") {
    // 每月特定日期
    const dom = dayOfMonth ?? 1;
    return `${minute} ${hour} ${dom} * *`;
  }

  // 預設：每天午夜
  return "0 0 * * *";
}

/**
 * 執行搜尋任務
 */
async function executeSearch(schedule: Schedule): Promise<void> {
  try {
    const now = new Date();
    // 如果啟用時間尚未到，略過執行（但任務仍已註冊）
    if (schedule.enabledAt) {
      const en = new Date(schedule.enabledAt);
      if (en > now) {
        console.log(
          `[排程執行] 尚未到啟用時間，略過執行: ${schedule.name} (enabledAt: ${en.toISOString()})`
        );
        return;
      }
    }

    console.log(`[排程執行] 開始執行排程: ${schedule.name} (${schedule.id})`);

    // 1. 更新 lastRunAt 和 lastRunStatus 為 "pending"
    await storage.updateSchedule(schedule.id, {
      lastRunAt: new Date(),
      lastRunStatus: "pending",
    } as any);

    // 2. 調用搜尋 API（假設已存在）
    const searchConfig = schedule.searchConfig;
    if (!searchConfig) {
      throw new Error("No search config found");
    }

    // 構建搜尋請求
    const searchParams = {
      q: schedule.coreKeywords?.join(" ") || "",
      language: searchConfig.language,
      region: searchConfig.region,
      industryCategory: searchConfig.industry,
      filters: {
        minWords: searchConfig.minWords,
        maxTrafficRank: searchConfig.maxTrafficRank,
        excludeGovEdu: searchConfig.excludeGovEdu,
        requireImages: searchConfig.requireImages,
        negativeKeywords: searchConfig.negativeKeywords,
      },
    };

    // 調用後端搜尋端點（自己呼叫自己）
    const apiUrl = process.env.API_BASE_URL || "http://127.0.0.1:5001";
    const response = await axios.post(`${apiUrl}/api/search`, searchParams, {
      timeout: 60000,
    });

    console.log(
      `[排程執行] 搜尋完成，返回 ${response.data?.results?.length || 0} 筆結果`
    );

    // 3. 更新 lastRunStatus 為 "success"
    const nextRun = calculateNextRun(schedule);
    await storage.updateSchedule(schedule.id, {
      lastRunStatus: "success",
      nextRunAt: nextRun,
    } as any);

    console.log(`[排程執行] 排程已完成: ${schedule.name}`);
  } catch (error: any) {
    console.error(`[排程執行失敗] ${schedule.name}:`, error.message);

    // 更新 lastRunStatus 為 "error"
    try {
      const nextRun = calculateNextRun(schedule);
      await storage.updateSchedule(schedule.id, {
        lastRunStatus: "error",
        nextRunAt: nextRun,
      } as any);
    } catch (updateError) {
      console.error("[排程狀態更新失敗]", updateError);
    }
  }
}

/**
 * 計算下次執行時間
 */
function calculateNextRun(schedule: Schedule): Date {
  const now = new Date();
  const next = new Date(now);

  if (schedule.frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (schedule.frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (schedule.frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  }

  next.setHours(schedule.hour, schedule.minute, 0, 0);
  return next;
}

/**
 * 註冊單個排程任務
 */
export function registerSchedule(schedule: Schedule): void {
  // 檢查排程是否應該執行
  const now = new Date();
  if (!schedule.isEnabled) {
    console.log(
      `[排程註冊] 跳過未啟用的排程: ${schedule.name} (enabled: ${schedule.isEnabled})`
    );
    return;
  }

  // 獲取 cron 表達式
  const cronExpression = toCronExpression(schedule);
  console.log(
    `[排程註冊] 註冊排程: ${schedule.name} - cron 表達式: ${cronExpression}`
  );

  try {
    // 建立 cron 任務
    const task = cron.schedule(cronExpression, () => {
      executeSearch(schedule);
    });

    // 存儲任務引用
    registeredTasks.set(schedule.id, task);
  } catch (error) {
    console.error(`[排程註冊失敗] ${schedule.name}:`, error);
  }
}

/**
 * 取消註冊排程任務
 */
export function unregisterSchedule(scheduleId: string): void {
  const task = registeredTasks.get(scheduleId);
  if (task) {
    task.stop();
    registeredTasks.delete(scheduleId);
    console.log(`[排程取消] 已取消排程: ${scheduleId}`);
  }
}

/**
 * 初始化所有排程
 * 在服務器啟動時調用
 */
export async function initializeScheduler(): Promise<void> {
  try {
    console.log("[排程初始化] 開始加載所有排程...");

    const schedules = await storage.getSchedules();
    console.log(`[排程初始化] 找到 ${schedules.length} 個排程`);

    for (const schedule of schedules) {
      registerSchedule(schedule);
    }

    console.log(
      `[排程初始化] 完成，已註冊 ${registeredTasks.size} 個活跃排程`
    );
  } catch (error) {
    console.error("[排程初始化失敗]", error);
  }
}

/**
 * 刷新單個排程（用於更新後重新註冊）
 */
export function refreshSchedule(schedule: Schedule): void {
  // 先取消舊任務
  unregisterSchedule(schedule.id);

  // 再註冊新任務
  registerSchedule(schedule);
}

/**
 * 獲取所有註冊的排程任務
 */
export function getRegisteredTasks(): string[] {
  return Array.from(registeredTasks.keys());
}
