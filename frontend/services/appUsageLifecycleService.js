/**
 * App Usage Lifecycle Service
 * 
 * Manages local app usage data aggregation and cleanup:
 * - Keeps last 7 days of DETAILED daily usage data
 * - After 7 days: REAGGREGATES old data into weekly summaries
 * - Removes granular entries after aggregation
 * - Maintains rolling archive for trend analysis
 * 
 * Architecture (Local-First):
 * ├─ APP_USAGE_DAILY: Last 7 days (detailed: screen time, app breakdown, pickups)
 * ├─ APP_USAGE_WEEKLY: 7+ days old (compressed, weekly rollups)
 * └─ APP_USAGE_MONTHLY: 30+ days old (minimal data, monthly trends)
 */

import localStorageService from './localStorageService';

// Storage key constants (same as in localStorageService)
const STORAGE_KEYS = {
  APP_USAGE_DAILY: "app_usage_daily",
  APP_USAGE_WEEKLY: "app_usage_weekly",
  APP_USAGE_MONTHLY: "app_usage_monthly",
};

const LIFECYCLE_CLEANUP_KEY = "app_usage_lifecycle_last_cleanup";

class AppUsageLifecycleService {
  constructor() {
    this.lastCleanupDate = null;
  }

  // ========================================
  // INITIALIZATION & PERIODIC CLEANUP
  // ========================================

  async initialize() {
    try {
      console.log('AppUsageLifecycleService: Initializing...');
      
      // Load last cleanup date
      this.lastCleanupDate = await localStorageService.getItem(LIFECYCLE_CLEANUP_KEY);
      
      // Run cleanup if not done today
      const today = new Date().toISOString().split('T')[0];
      if (this.lastCleanupDate !== today) {
        await this.runCleanupCycle();
        await localStorageService.setItem(LIFECYCLE_CLEANUP_KEY, today);
        this.lastCleanupDate = today;
      }
      
      console.log('AppUsageLifecycleService initialized');
    } catch (error) {
      console.error('AppUsageLifecycleService initialization error:', error);
    }
  }

  // ========================================
  // MAIN CLEANUP ALGORITHM
  // ========================================

  async runCleanupCycle() {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔄 App usage data cleanup cycle starting...');
      console.log('═══════════════════════════════════════════════════════════');
      
      const startTime = Date.now();
      
      // Phase 1: Calculate cutoff dates
      const today = new Date();
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      console.log(`📅 Cutoff dates: 7d=${sevenDaysAgoStr}, 30d=${thirtyDaysAgoStr}`);

      // Phase 2: Fetch all daily usage data
      const allDaily = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_DAILY) || {};
      const allWeekly = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_WEEKLY) || {};
      const allMonthly = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_MONTHLY) || {};
      
      const allDates = Object.keys(allDaily).sort();
      console.log(`📊 Total daily usage records: ${allDates.length}`);
      
      // ✅ ENHANCED: Show individual daily usage records
      if (allDates.length > 0) {
        console.log('\n📱 DAILY USAGE RECORDS:');
        allDates.slice(-10).forEach((date) => {
          const record = allDaily[date];
          const screenHours = (record.screenTimeMinutes / 60).toFixed(1);
          const appCount = record.appUsage?.length || 0;
          console.log(`  ${date} - ${screenHours}h screen | ${record.pickupCount} pickups | ${appCount} apps`);
        });
        console.log('');
      }

      // Phase 3: Identify data to aggregate
      const datesToAggregate = allDates.filter(date => date < sevenDaysAgoStr);
      console.log(`🔍 Records to aggregate: ${datesToAggregate.length}`);

      if (datesToAggregate.length > 0) {
        // Phase 4: Aggregate to weekly
        await this.aggregateToWeekly(datesToAggregate, allDaily, allWeekly, sevenDaysAgoStr, thirtyDaysAgoStr);

        // Phase 5: Aggregate to monthly
        await this.aggregateToMonthly(allWeekly, allMonthly, thirtyDaysAgoStr);

        // Phase 6: Clean up old daily records
        const cleanedDaily = {};
        allDates.forEach(date => {
          if (date >= sevenDaysAgoStr) {
            cleanedDaily[date] = allDaily[date];
          }
        });

        await localStorageService.setItem(STORAGE_KEYS.APP_USAGE_DAILY, cleanedDaily);
        console.log(`✅ Cleaned up ${allDates.length - Object.keys(cleanedDaily).length} daily records`);
      }

      const duration = Date.now() - startTime;
      console.log(`⏱️  Cleanup completed in ${duration}ms`);
      console.log('═══════════════════════════════════════════════════════════\n');
      
    } catch (error) {
      console.error('App usage cleanup cycle error:', error);
    }
  }

  // ========================================
  // AGGREGATION HELPERS
  // ========================================

  async aggregateToWeekly(datesToAggregate, allDaily, allWeekly, sevenDaysAgoStr, thirtyDaysAgoStr) {
    console.log('📊 Aggregating to weekly summaries...');
    
    let weeklyCount = 0;

    // Group by week
    const weeklyData = {};
    datesToAggregate.forEach(date => {
      const dateObj = new Date(date);
      const weekStart = this.getWeekStart(dateObj);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = [];
      }
      weeklyData[weekKey].push({ date, data: allDaily[date] });
    });

    // Aggregate each week
    for (const [weekKey, dayRecords] of Object.entries(weeklyData)) {
      if (dayRecords.length === 0) continue;

      const aggregated = this.aggregateUsageRecords(dayRecords.map(r => r.data));
      
      allWeekly[weekKey] = {
        weekStart: weekKey,
        dayCount: dayRecords.length,
        avgScreenTimeMinutes: aggregated.avgScreenTime,
        totalScreenTimeMinutes: aggregated.totalScreenTime,
        avgPickupCount: aggregated.avgPickups,
        maxScreenTimeDay: aggregated.maxScreenTime,
        topApps: aggregated.topApps.slice(0, 5),
        recordCount: dayRecords.length,
        aggregatedAt: new Date().toISOString(),
      };
      weeklyCount++;
    }

    await localStorageService.setItem(STORAGE_KEYS.APP_USAGE_WEEKLY, allWeekly);
    console.log(`  ✓ Created/updated ${weeklyCount} weekly summaries`);
  }

  async aggregateToMonthly(allWeekly, allMonthly, thirtyDaysAgoStr) {
    console.log('📊 Aggregating to monthly summaries...');
    
    let monthlyCount = 0;
    const weeklyDates = Object.keys(allWeekly).sort();

    // Group by month
    const monthlyData = {};
    weeklyDates.forEach(weekKey => {
      const dateObj = new Date(weekKey);
      const monthKey = dateObj.toISOString().substring(0, 7); // YYYY-MM

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = [];
      }
      monthlyData[monthKey].push(allWeekly[weekKey]);
    });

    // Aggregate each month
    for (const [monthKey, weeklyRecords] of Object.entries(monthlyData)) {
      if (weeklyRecords.length === 0) continue;

      const totalScreenTime = weeklyRecords.reduce((sum, w) => sum + (w.totalScreenTimeMinutes || 0), 0);
      const avgScreenTime = totalScreenTime / weeklyRecords.length;

      // Combine top apps from all weeks
      const appMap = {};
      weeklyRecords.forEach(week => {
        (week.topApps || []).forEach(app => {
          if (!appMap[app.appName]) {
            appMap[app.appName] = { ...app, weekCount: 0 };
          }
          appMap[app.appName].weekCount++;
        });
      });

      const topApps = Object.values(appMap)
        .sort((a, b) => b.weekCount - a.weekCount)
        .slice(0, 5);

      allMonthly[monthKey] = {
        month: monthKey,
        weekCount: weeklyRecords.length,
        totalScreenTimeMinutes: totalScreenTime,
        avgScreenTimeMinutes: Math.round(avgScreenTime),
        topApps: topApps,
        aggregatedAt: new Date().toISOString(),
      };
      monthlyCount++;
    }

    await localStorageService.setItem(STORAGE_KEYS.APP_USAGE_MONTHLY, allMonthly);
    console.log(`  ✓ Created/updated ${monthlyCount} monthly summaries`);
  }

  // ========================================
  // AGGREGATION UTILITIES
  // ========================================

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  aggregateUsageRecords(records) {
    if (records.length === 0) {
      return {
        totalScreenTime: 0,
        avgScreenTime: 0,
        avgPickups: 0,
        maxScreenTime: 0,
        topApps: [],
      };
    }

    const totalScreenTime = records.reduce((sum, r) => sum + (r.screenTimeMinutes || 0), 0);
    const totalPickups = records.reduce((sum, r) => sum + (r.pickupCount || 0), 0);
    const maxScreenTime = Math.max(...records.map(r => r.screenTimeMinutes || 0));

    // Combine and rank apps across all days
    const appMap = {};
    records.forEach(record => {
      (record.appUsage || []).forEach(app => {
        if (!appMap[app.appName]) {
          appMap[app.appName] = { appName: app.appName, totalMinutes: 0, dayCount: 0 };
        }
        appMap[app.appName].totalMinutes += app.durationMinutes || 0;
        appMap[app.appName].dayCount++;
      });
    });

    const topApps = Object.values(appMap)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);

    return {
      totalScreenTime: Math.round(totalScreenTime),
      avgScreenTime: Math.round(totalScreenTime / records.length),
      avgPickups: Math.round(totalPickups / records.length),
      maxScreenTime: Math.round(maxScreenTime),
      topApps,
    };
  }

  // ========================================
  // PUBLIC QUERY METHODS
  // ========================================

  async getDailyUsage(date) {
    try {
      const daily = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_DAILY) || {};
      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
      return daily[dateStr] || null;
    } catch (error) {
      console.error('Error getting daily usage:', error);
      return null;
    }
  }

  async getWeeklyUsage(days = 7) {
    try {
      const daily = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_DAILY) || {};
      const weekly = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_WEEKLY) || {};

      const today = new Date();
      const cutoffDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      // Get daily records within range
      const recentDaily = [];
      Object.entries(daily).forEach(([date, data]) => {
        if (date >= cutoffStr) {
          recentDaily.push({
            date,
            screenTimeHours: (data.screenTimeMinutes || 0) / 60,
            pickupCount: data.pickupCount || 0,
            appCount: (data.appUsage || []).length,
            topApp: (data.appUsage || [])[0]?.appName || 'N/A',
          });
        }
      });

      return recentDaily.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error('Error getting weekly usage:', error);
      return [];
    }
  }

  async getMonthlyUsage() {
    try {
      const monthly = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_MONTHLY) || {};
      return Object.values(monthly)
        .sort((a, b) => new Date(b.month) - new Date(a.month))
        .slice(0, 12); // Last 12 months
    } catch (error) {
      console.error('Error getting monthly usage:', error);
      return [];
    }
  }

  async getTrendAnalysis() {
    try {
      const daily = await localStorageService.getItem(STORAGE_KEYS.APP_USAGE_DAILY) || {};
      const dates = Object.keys(daily).sort();

      if (dates.length < 7) return { trend: 'insufficient_data', trendDays: dates.length };

      // Last 7 days vs previous 7 days
      const recentDays = dates.slice(-7);
      const previousDays = dates.slice(-14, -7);

      const recentAvg = recentDays.reduce((sum, d) => sum + (daily[d].screenTimeMinutes || 0), 0) / 7;
      const previousAvg = previousDays.reduce((sum, d) => sum + (daily[d].screenTimeMinutes || 0), 0) / 7;

      const percentChange = ((recentAvg - previousAvg) / previousAvg) * 100;

      let trend = 'stable';
      if (percentChange > 10) trend = 'increasing';
      else if (percentChange < -10) trend = 'decreasing';

      return {
        trend,
        percentChange: Math.round(percentChange * 10) / 10,
        recentAvgScreenTimeHours: Math.round((recentAvg / 60) * 10) / 10,
        previousAvgScreenTimeHours: Math.round((previousAvg / 60) * 10) / 10,
        trendStrength: Math.abs(Math.round(percentChange)),
      };
    } catch (error) {
      console.error('Error analyzing usage trend:', error);
      return { trend: 'error', trendStrength: 0 };
    }
  }
}

export default new AppUsageLifecycleService();
