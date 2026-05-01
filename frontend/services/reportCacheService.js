import localStorageService from "./localStorageService";
import reportGenerationService from "./reportGenerationService";
import dataAggregationService from "./dataAggregationService";
import devModeService from "./devsModeService";

const CACHE_KEYS = {
  weekly: "report_cache_weekly",
  monthly: "report_cache_monthly",
  lastGenerated: "report_cache_last_generated",
};

class ReportCacheService {
  async initialize() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const lastGenerated = await localStorageService.getItem(CACHE_KEYS.lastGenerated);
      if (lastGenerated !== today) {
        await this.refreshCaches();
      }
    } catch (error) {
      console.error("Report cache initialization error:", error);
    }
  }

  async refreshCaches() {
    try {
      await localStorageService.initialize();

      // Ensure reports are generated from latest storage state, not stale in-memory aggregates.
      // When Dev Mode is active, allow bypassing the aggregation cache clear so seeded/demo
      // data remains visible during presentations. In production (Dev Mode off) we clear.
      const shouldClear = !devModeService?.isActive;
      if (shouldClear && typeof dataAggregationService.clearCache === "function") {
        dataAggregationService.clearCache();
      }

      const [weeklyRes, monthlyRes] = await Promise.all([
        reportGenerationService.generateWeeklyReport(),
        reportGenerationService.generateMonthlyReport(),
      ]);

      if (weeklyRes?.success) {
        await localStorageService.setItem(CACHE_KEYS.weekly, weeklyRes.report);
      }

      if (monthlyRes?.success) {
        await localStorageService.setItem(CACHE_KEYS.monthly, monthlyRes.report);
      }

      const today = new Date().toISOString().split("T")[0];
      await localStorageService.setItem(CACHE_KEYS.lastGenerated, today);
    } catch (error) {
      console.error("Report cache refresh error:", error);
    }
  }

  async getCachedReport(type) {
    const key = CACHE_KEYS[type];
    if (!key) return null;
    return await localStorageService.getItem(key);
  }
}

export default new ReportCacheService();
