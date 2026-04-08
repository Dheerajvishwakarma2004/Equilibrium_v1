/**
 * Sleep Data Lifecycle Service
 * 
 * Manages local sleep data aggregation and cleanup:
 * - Keeps last 30 days of DETAILED nightly data
 * - After 30 days: REAGGREGATES old data into weekly/monthly summaries
 * - Removes granular entries after aggregation
 * - Maintains rolling archive for year-long trends
 * 
 * Architecture (Local-First):
 * ├─ SLEEP_NIGHTLY_SUMMARIES: Last 30 days (detailed, high storage)
 * ├─ SLEEP_WEEKLY_AGGREGATES: 30+ days old (compressed, weekly rollups)
 * ├─ SLEEP_MONTHLY_AGGREGATES: 90+ days old (compressed, monthly rollups)
 * └─ SLEEP_YEARLY_ARCHIVE: 365+ days (minimal data, for trends)
 */

import localStorageService from './localStorageService';

class SleepDataLifecycleService {
  constructor() {
    this.lastCleanupDate = null;
  }

  // ========================================
  // INITIALIZATION & PERIODIC CLEANUP
  // ========================================

  async initialize() {
    try {
      console.log('SleepDataLifecycleService: Initializing...');
      
      // Load last cleanup date
      this.lastCleanupDate = await localStorageService.getItem('sleep_lifecycle_last_cleanup');
      
      // Run cleanup if not done today
      const today = new Date().toISOString().split('T')[0];
      if (this.lastCleanupDate !== today) {
        await this.runCleanupCycle();
        await localStorageService.setItem('sleep_lifecycle_last_cleanup', today);
        this.lastCleanupDate = today;
      }
      
      console.log('SleepDataLifecycleService initialized');
    } catch (error) {
      console.error('SleepDataLifecycleService initialization error:', error);
    }
  }

  // ========================================
  // MAIN CLEANUP ALGORITHM
  // ========================================

  /**
   * ✅ CORE ALGORITHM: Run complete cleanup cycle
   * 
   * Phases:
   * 1. Identify cutoff dates
   * 2. Aggregate old data
   * 3. Move to archives
   * 4. Delete granular entries
   * 5. Validate storage health
   */
  async runCleanupCycle() {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔄 Sleep data cleanup cycle starting...');
      console.log('═══════════════════════════════════════════════════════════');
      
      const startTime = Date.now();
      
      // Phase 1: Calculate cutoff dates
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      const threeHundredSixtyFiveDaysAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
      const yearAgoStr = threeHundredSixtyFiveDaysAgo.toISOString().split('T')[0];

      console.log(`📅 Cutoff dates: 30d=${thirtyDaysAgoStr}, 90d=${ninetyDaysAgoStr}, 365d=${yearAgoStr}`);

      // Phase 2: Fetch all nightly data
      const allSummaries = await localStorageService.getItem('sleep_nightly_summaries') || {};
      const allDates = Object.keys(allSummaries).sort();
      
      console.log(`📊 Total nightly records: ${allDates.length}`);
      
      // ✅ ENHANCED: Show individual nightly records
      if (allDates.length > 0) {
        console.log('\n📝 NIGHTLY RECORDS:');
        allDates.forEach((date, index) => {
          const record = allSummaries[date];
          const source = record.sleep_source === 'manual' ? '📌 Manual' : '📱 Auto';
          const napInfo = record.nap_sessions?.length ? ` | Naps: ${record.nap_sessions.length}` : '';
          console.log(`  [${index + 1}/${allDates.length}] ${date} - ${record.total_sleep_minutes}min | Efficiency: ${(record.sleep_efficiency * 100).toFixed(0)}% | ${source}${napInfo}`);
        });
        console.log('');
      }

      // Phase 3: Categorize data by age
      const recentData = {}; // Keep detailed (0-30 days)
      const weeklyAggregateData = {}; // Aggregate (31-90 days)
      const monthlyAggregateData = {}; // Aggregate (91-365 days)
      const oldData = []; // Archive (365+ days)

      allDates.forEach(date => {
        if (date >= thirtyDaysAgoStr) {
          // Recent: keep as-is
          recentData[date] = allSummaries[date];
        } else if (date >= ninetyDaysAgoStr) {
          // Weekly aggregate zone
          weeklyAggregateData[date] = allSummaries[date];
        } else if (date >= yearAgoStr) {
          // Monthly aggregate zone
          monthlyAggregateData[date] = allSummaries[date];
        } else {
          // Archive zone
          oldData.push(date);
        }
      });

      console.log(`📈 Data categorized:`);
      console.log(`  📌 Recent (0-30d): ${Object.keys(recentData).length} records`);
      if (Object.keys(recentData).length > 0) {
        Object.keys(recentData).forEach(date => {
          const r = recentData[date];
          console.log(`     └─ ${date}: ${r.total_sleep_minutes}min | ${(r.sleep_efficiency * 100).toFixed(0)}%`);
        });
      }
      console.log(`  📊 Weekly zone (31-90d): ${Object.keys(weeklyAggregateData).length} records (to aggregate)`);
      console.log(`  📈 Monthly zone (91-365d): ${Object.keys(monthlyAggregateData).length} records (to aggregate)`);
      console.log(`  📚 Old archive (365+d): ${oldData.length} records (to archive)`);
      console.log('');

      // Phase 4: Aggregate old data
      const weeklyAggregates = await this.aggregateByWeek(weeklyAggregateData);
      const monthlyAggregates = await this.aggregateByMonth(monthlyAggregateData);
      const yearlyArchive = await this.aggregateByMonth(
        oldData.reduce((acc, date) => {
          acc[date] = allSummaries[date];
          return acc;
        }, {})
      );

      // Phase 5: Save aggregates to storage
      await localStorageService.setItem('sleep_nightly_summaries', recentData);
      await localStorageService.setItem('sleep_weekly_aggregates', weeklyAggregates);
      await localStorageService.setItem('sleep_monthly_aggregates', monthlyAggregates);
      await localStorageService.setItem('sleep_yearly_archive', yearlyArchive);

      // Phase 6: Log statistics
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      console.log(`✅ Cleanup complete! (${durationMs}ms)`);
      console.log(`\n📊 FINAL SUMMARY:`);
      console.log(`  📝 Nightly (Recent): ${Object.keys(recentData).length} records`);
      console.log(`  📊 Weekly aggregates: ${Object.keys(weeklyAggregates).length}`);
      console.log(`  📈 Monthly aggregates: ${Object.keys(monthlyAggregates).length}`);
      console.log(`  📚 Yearly archive: ${Object.keys(yearlyArchive).length}`);
      
      // Show sample aggregates
      if (Object.keys(weeklyAggregates).length > 0) {
        console.log(`\n  Sample Weekly Aggregates:`);
        Object.entries(weeklyAggregates).slice(0, 3).forEach(([week, data]) => {
          console.log(`    └─ ${data.week_start} to ${data.week_end}: Avg ${data.avg_sleep_minutes}min | ${data.avg_efficiency}% efficiency`);
        });
      }
      
      if (Object.keys(monthlyAggregates).length > 0) {
        console.log(`\n  Sample Monthly Aggregates:`);
        Object.entries(monthlyAggregates).slice(0, 3).forEach(([month, data]) => {
          console.log(`    └─ ${data.month_start}: Avg ${data.avg_sleep_minutes}min | ${data.avg_efficiency}% efficiency`);
        });
      }
      
      console.log('');
      console.log(`💾 Deleted ${allDates.length - Object.keys(recentData).length} old records from nightly storage`);
      console.log('═══════════════════════════════════════════════════════════\n');

      // Phase 7: Validate storage health
      await this.validateStorageHealth();

    } catch (error) {
      console.error('Cleanup cycle error:', error);
      throw error;
    }
  }

  // ========================================
  // AGGREGATION FUNCTIONS
  // ========================================

  /**
   * ✅ Aggregate sleep data by week
   * Returns: { "week_start_date": aggregated_data }
   * 
   * Weekly aggregation keeps:
   * - avg_sleep_minutes, avg_efficiency, avg_consistency
   * - min/max values
   * - nap counts and totals
   * - date range for reference
   */
  async aggregateByWeek(dataByDate) {
    try {
      const grouped = this.groupByWeek(dataByDate);
      const aggregates = {};

      Object.entries(grouped).forEach(([weekStart, entries]) => {
        if (entries.length === 0) return;

        const days = Object.values(entries).flat();
        
        // Filter out nap-only days for main sleep calculations
        const mainDays = days.filter(d => !d.nap_only_day && d.total_sleep_minutes);
        
        if (mainDays.length === 0) {
          // Only naps this week
          aggregates[weekStart] = {
            type: 'weekly_nap_aggregate',
            week_start: weekStart,
            week_end: this.getWeekEnd(weekStart),
            days_count: days.length,
            total_nap_minutes: days.reduce((sum, d) => sum + (d.nap_total_minutes || 0), 0),
            nap_sessions_count: days.reduce((sum, d) => sum + (d.nap_sessions?.length || 0), 0),
            aggregated_at: new Date().toISOString(),
          };
        } else {
          // Main sleep aggregation
          const totalSleep = mainDays.reduce((sum, d) => sum + (d.total_sleep_minutes || 0), 0);
          const totalEfficiency = mainDays.reduce((sum, d) => sum + (d.sleep_efficiency || 0), 0);
          const totalDeep = mainDays.reduce((sum, d) => sum + (d.deep_sleep_minutes || 0), 0);
          const totalLight = mainDays.reduce((sum, d) => sum + (d.light_sleep_minutes || 0), 0);
          const totalNaps = days.reduce((sum, d) => sum + (d.nap_total_minutes || 0), 0);
          const totalNapSessions = days.reduce((sum, d) => sum + (d.nap_sessions?.length || 0), 0);

          aggregates[weekStart] = {
            type: 'weekly_aggregate',
            week_start: weekStart,
            week_end: this.getWeekEnd(weekStart),
            days_count: mainDays.length,
            avg_sleep_minutes: Math.round(totalSleep / mainDays.length),
            avg_efficiency: Math.round((totalEfficiency / mainDays.length) * 100),
            avg_deep_sleep_minutes: Math.round(totalDeep / mainDays.length),
            avg_light_sleep_minutes: Math.round(totalLight / mainDays.length),
            min_sleep_minutes: Math.min(...mainDays.map(d => d.total_sleep_minutes)),
            max_sleep_minutes: Math.max(...mainDays.map(d => d.total_sleep_minutes)),
            total_nap_minutes: totalNaps,
            nap_sessions_count: totalNapSessions,
            aggregated_at: new Date().toISOString(),
          };
        }
      });

      console.log(`📊 Weekly aggregates created: ${Object.keys(aggregates).length}`);
      return aggregates;
    } catch (error) {
      console.error('Weekly aggregation error:', error);
      return {};
    }
  }

  /**
   * ✅ Aggregate sleep data by month
   * Returns: { "month_start_date": aggregated_data }
   * 
   * Monthly aggregation keeps minimal data:
   * - avg_sleep, efficiency (most important)
   * - date range for reference
   * - nap summary
   */
  async aggregateByMonth(dataByDate) {
    try {
      const grouped = this.groupByMonth(dataByDate);
      const aggregates = {};

      Object.entries(grouped).forEach(([monthStart, entries]) => {
        if (entries.length === 0) return;

        const days = Object.values(entries).flat();
        const mainDays = days.filter(d => !d.nap_only_day && d.total_sleep_minutes);

        if (mainDays.length === 0) {
          aggregates[monthStart] = {
            type: 'monthly_nap_aggregate',
            month_start: monthStart,
            month_end: this.getMonthEnd(monthStart),
            days_count: days.length,
            total_nap_minutes: days.reduce((sum, d) => sum + (d.nap_total_minutes || 0), 0),
            aggregated_at: new Date().toISOString(),
          };
        } else {
          const totalSleep = mainDays.reduce((sum, d) => sum + (d.total_sleep_minutes || 0), 0);
          const totalEfficiency = mainDays.reduce((sum, d) => sum + (d.sleep_efficiency || 0), 0);
          const totalNaps = days.reduce((sum, d) => sum + (d.nap_total_minutes || 0), 0);

          aggregates[monthStart] = {
            type: 'monthly_aggregate',
            month_start: monthStart,
            month_end: this.getMonthEnd(monthStart),
            days_count: mainDays.length,
            avg_sleep_minutes: Math.round(totalSleep / mainDays.length),
            avg_efficiency: Math.round((totalEfficiency / mainDays.length) * 100),
            min_sleep_minutes: Math.min(...mainDays.map(d => d.total_sleep_minutes)),
            max_sleep_minutes: Math.max(...mainDays.map(d => d.total_sleep_minutes)),
            total_nap_minutes: totalNaps,
            aggregated_at: new Date().toISOString(),
          };
        }
      });

      console.log(`📈 Monthly aggregates created: ${Object.keys(aggregates).length}`);
      return aggregates;
    } catch (error) {
      console.error('Monthly aggregation error:', error);
      return {};
    }
  }

  // ========================================
  // DATA RETRIEVAL (Multi-tier)
  // ========================================

  /**
   * ✅ Get sleep data with intelligent tiering
   * 
   * Strategy:
   * - Last 30 days: Detailed nightly summaries
   * - 30-90 days: Weekly aggregates (~ 12 records)
   * - 90-365 days: Monthly aggregates (~ 12 records)
   * - 365+ days: Yearly archive (minimal)
   */
  async getSleepDataTiered(daysBack = 90) {
    try {
      const today = new Date();
      const targetDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      const result = {
        recent: [],
        aggregated_weekly: [],
        aggregated_monthly: [],
        metadata: {
          fetched_at: new Date().toISOString(),
          days_requested: daysBack,
          date_range_from: targetDateStr,
          date_range_to: today.toISOString().split('T')[0],
        }
      };

      // Fetch recent detailed data
      const nightly = await localStorageService.getItem('sleep_nightly_summaries') || {};
      const recentDates = Object.keys(nightly)
        .filter(date => date >= targetDateStr)
        .sort()
        .reverse();
      result.recent = recentDates.map(date => ({ date, ...nightly[date] }));

      // If requesting more than 30 days, include aggregates
      if (daysBack > 30) {
        const weeklyAgg = await localStorageService.getItem('sleep_weekly_aggregates') || {};
        const weeklyDates = Object.keys(weeklyAgg)
          .filter(date => date >= targetDateStr && date < Object.keys(nightly).sort()[0]) // Between recent cutoff
          .sort()
          .reverse();
        result.aggregated_weekly = weeklyDates.map(date => ({ date, ...weeklyAgg[date] }));
      }

      if (daysBack > 90) {
        const monthlyAgg = await localStorageService.getItem('sleep_monthly_aggregates') || {};
        const monthlyDates = Object.keys(monthlyAgg)
          .filter(date => date >= targetDateStr)
          .sort()
          .reverse();
        result.aggregated_monthly = monthlyDates.map(date => ({ date, ...monthlyAgg[date] }));
      }

      console.log(`📊 Tiered data retrieved: ${result.recent.length} recent, ${result.aggregated_weekly.length} weekly, ${result.aggregated_monthly.length} monthly`);
      return result;
    } catch (error) {
      console.error('Get tiered data error:', error);
      return { recent: [], aggregated_weekly: [], aggregated_monthly: [], metadata: {} };
    }
  }

  /**
   * ✅ Get storage breakdown (for debugging & UI)
   */
  async getStorageBreakdown() {
    try {
      const nightly = await localStorageService.getItem('sleep_nightly_summaries') || {};
      const weekly = await localStorageService.getItem('sleep_weekly_aggregates') || {};
      const monthly = await localStorageService.getItem('sleep_monthly_aggregates') || {};
      const yearly = await localStorageService.getItem('sleep_yearly_archive') || {};

      return {
        nightly_summaries: {
          count: Object.keys(nightly).length,
          size_estimate_kb: Math.round(JSON.stringify(nightly).length / 1024),
          date_range: Object.keys(nightly).length > 0 
            ? `${Object.keys(nightly).sort()[0]} to ${Object.keys(nightly).sort().reverse()[0]}`
            : 'empty'
        },
        weekly_aggregates: {
          count: Object.keys(weekly).length,
          size_estimate_kb: Math.round(JSON.stringify(weekly).length / 1024),
        },
        monthly_aggregates: {
          count: Object.keys(monthly).length,
          size_estimate_kb: Math.round(JSON.stringify(monthly).length / 1024),
        },
        yearly_archive: {
          count: Object.keys(yearly).length,
          size_estimate_kb: Math.round(JSON.stringify(yearly).length / 1024),
        },
        total_size_kb: 
          Math.round(JSON.stringify(nightly).length / 1024) +
          Math.round(JSON.stringify(weekly).length / 1024) +
          Math.round(JSON.stringify(monthly).length / 1024) +
          Math.round(JSON.stringify(yearly).length / 1024)
      };
    } catch (error) {
      console.error('Get storage breakdown error:', error);
      return {};
    }
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  groupByWeek(dataByDate) {
    const grouped = {};
    Object.entries(dataByDate).forEach(([date, data]) => {
      const d = new Date(date);
      const weekStart = this.getWeekStart(d);
      if (!grouped[weekStart]) grouped[weekStart] = {};
      grouped[weekStart][date] = data;
    });
    return grouped;
  }

  groupByMonth(dataByDate) {
    const grouped = {};
    Object.entries(dataByDate).forEach(([date, data]) => {
      const monthStart = date.substring(0, 7) + '-01'; // YYYY-MM-01
      if (!grouped[monthStart]) grouped[monthStart] = {};
      grouped[monthStart][date] = data;
    });
    return grouped;
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStartDate = new Date(d.setDate(diff));
    return weekStartDate.toISOString().split('T')[0];
  }

  getWeekEnd(weekStartStr) {
    const date = new Date(weekStartStr);
    date.setDate(date.getDate() + 6);
    return date.toISOString().split('T')[0];
  }

  getMonthEnd(monthStartStr) {
    const date = new Date(monthStartStr);
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    return date.toISOString().split('T')[0];
  }

  async validateStorageHealth() {
    try {
      const breakdown = await this.getStorageBreakdown();
      const totalSize = breakdown.total_size_kb;
      
      console.log(`💾 Storage health:`);
      console.log(`  Total: ${totalSize} KB (~${Math.round(totalSize / 1024)} MB)`);
      console.log(`  Nightly: ${breakdown.nightly_summaries.count} records (${breakdown.nightly_summaries.size_estimate_kb} KB)`);
      console.log(`  Weekly agg: ${breakdown.weekly_aggregates.count} records (${breakdown.weekly_aggregates.size_estimate_kb} KB)`);
      console.log(`  Monthly agg: ${breakdown.monthly_aggregates.count} records (${breakdown.monthly_aggregates.size_estimate_kb} KB)`);
      console.log(`  Yearly archive: ${breakdown.yearly_archive.count} records (${breakdown.yearly_archive.size_estimate_kb} KB)`);
      
      // ⚠️ Warning if storage exceeds 50 MB
      if (totalSize > 50000) {
        console.warn(`⚠️ Sleep data storage exceeds 50 MB. Consider archiving or implementing retention policy.`);
      }
    } catch (error) {
      console.error('Storage health validation error:', error);
    }
  }
}

export default new SleepDataLifecycleService();
