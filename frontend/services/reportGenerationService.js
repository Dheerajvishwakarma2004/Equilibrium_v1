import dataAggregationService from "./dataAggregationService";
import localStorageService from "./localStorageService";

class ReportGenerationService {
  async generateReport(days = 7, type = "weekly") {
    try {
      await dataAggregationService.initialize();

      const { startDate, endDate } = this._getDateRangeForDays(days);
      const aggregate = await dataAggregationService.generateRollingAggregate(days);
      if (!aggregate) {
        return { success: false, message: "No data available for report" };
      }

      const coverage = await this._buildCoverage(aggregate, days, startDate, endDate);
      const noData = coverage.overallCoverage < 40;
      const lowCoverage = coverage.overallCoverage < 60;

      const compare = await dataAggregationService.comparePeriods(days, days * 2);
      const summary = this._buildSummary(aggregate);
      const topApps = await this._getTopAppsForRange(startDate, endDate, days);
      const drivers = this._buildDrivers(aggregate);
      const volatility = this._buildVolatility(aggregate);
      const resolution = this._buildResolution(days);
      let insights = noData ? [] : this._buildInsights(summary, aggregate, topApps);
      let recommendations = noData ? [] : this._buildRecommendations(summary, aggregate, topApps);

      if (!noData && lowCoverage) {
        const warning = this._buildCoverageWarning(coverage);
        insights = [warning, ...insights].slice(0, 2);
        recommendations = recommendations.slice(0, 2);
      }

      const report = {
        id: `${type}-${days}-${Date.now()}`,
        type,
        periodDays: days,
        periodLabel: type === "weekly" ? "Weekly Summary" : type === "monthly" ? "Monthly Trends" : `${days} Day Report`,
        generatedAt: new Date().toISOString(),
        status: noData ? "no_data" : lowCoverage ? "limited_data" : "ready",
        message: noData
          ? "No tracked data found for this period."
          : lowCoverage
            ? "Limited data coverage. Some insights may be incomplete."
            : null,
        dateRange: { start: startDate, end: endDate },
        summary,
        coverage,
        resolution,
        topApps,
        drivers,
        volatility,
        changes: compare?.changes || null,
        trendFlags: compare?.trends || null,
        dataQuality: aggregate.data_quality,
        insights,
        recommendations,
        aggregate,
      };

      return { success: true, report };
    } catch (error) {
      console.error("Report generation error:", error);
      return { success: false, message: "Failed to generate report" };
    }
  }

  async generateWeeklyReport() {
    return this.generateReport(7, "weekly");
  }

  async generateMonthlyReport() {
    return this.generateReport(30, "monthly");
  }

  async generateDateRangeReport(startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { success: false, message: "Invalid date range" };
      }
      if (end < start) {
        return { success: false, message: "End date must be after start date" };
      }

      const daysSpan = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

      const sleepRangeData = await this._getSleepRangeData(startDate, endDate);
      const journalEntries = await localStorageService.getJournalEntries(365);
      const activityData = await localStorageService.getActivityData(365);

      const inRange = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      };

      const sleepRange = sleepRangeData;
      const journalRange = journalEntries.filter((j) => inRange(j.date));
      const activityRange = activityData.filter((a) => inRange(a.date));

      const sleep = this._buildSleepAggregateFromRange(sleepRange, daysSpan, startDate, endDate);
      const wellness = this._buildWellnessAggregate(journalRange, daysSpan, startDate, endDate);
      const activity = this._buildActivityAggregate(activityRange, daysSpan, startDate, endDate);

      const aggregate = {
        period: `${daysSpan} days`,
        generated_at: new Date().toISOString(),
        sleep,
        wellness,
        activity,
        overall_trend: dataAggregationService._calculateOverallTrend(sleep, wellness, activity),
        data_quality: {
          sleep_completeness: sleep.data_completeness,
          wellness_completeness: wellness.daily_breakdown?.length > 0 ? 100 : 0,
          activity_completeness: activity.data_completeness || 0,
          average_completeness: (
            (sleep.data_completeness || 0) +
            (wellness.daily_breakdown?.length > 0 ? 100 : 0) +
            (activity.data_completeness || 0)
          ) / 3,
        },
        date_range: { start: startDate, end: endDate },
      };

      const coverage = await this._buildCoverage(aggregate, daysSpan, startDate, endDate);
      const noData = coverage.overallCoverage < 40;
      const lowCoverage = coverage.overallCoverage < 60;
      const summary = this._buildSummary(aggregate);
      const topApps = await this._getTopAppsForRange(startDate, endDate, daysSpan);
      const drivers = this._buildDrivers(aggregate);
      const volatility = this._buildVolatility(aggregate);
      const resolution = this._buildResolution(daysSpan);

      let insights = noData ? [] : this._buildInsights(summary, aggregate, topApps);
      let recommendations = noData ? [] : this._buildRecommendations(summary, aggregate, topApps);

      if (!noData && lowCoverage) {
        const warning = this._buildCoverageWarning(coverage);
        insights = [warning, ...insights].slice(0, 2);
        recommendations = recommendations.slice(0, 2);
      }

      const report = {
        id: `custom-${Date.now()}`,
        type: "custom",
        periodDays: daysSpan,
        periodLabel: "Custom Range",
        generatedAt: new Date().toISOString(),
        status: noData ? "no_data" : lowCoverage ? "limited_data" : "ready",
        message: noData
          ? "No tracked data found for the selected range."
          : lowCoverage
            ? "Limited data coverage. Some insights may be incomplete."
            : null,
        dateRange: { start: startDate, end: endDate },
        summary,
        coverage,
        resolution,
        topApps,
        drivers,
        volatility,
        changes: null,
        trendFlags: null,
        dataQuality: aggregate.data_quality,
        insights,
        recommendations,
        aggregate,
      };

      return { success: true, report };
    } catch (error) {
      console.error("Custom report generation error:", error);
      return { success: false, message: "Failed to generate custom report" };
    }
  }

  _buildSummary(aggregate) {
    const sleep = aggregate.sleep || {};
    const wellness = aggregate.wellness || {};
    const activity = aggregate.activity || {};

    return {
      avgSleepHours: this._roundTo(sleep.avg_sleep_hours, 1),
      avgMoodScore: this._roundTo(wellness.avg_mood_score, 1),
      avgScreenTimeMinutes: this._roundTo(activity.avg_screen_time_minutes, 0),
      totalEntries: wellness.total_entries || 0,
      consistencyScore: sleep.consistency_score || 0,
      sleepDebtMinutes: sleep.sleep_debt_minutes || 0,
      overallTrend: aggregate.overall_trend || "stable",
      moodTrend: wellness.mood_trend || "stable",
      sleepTrend: sleep.trend || "stable",
      screenTimeTrend: activity.screen_time_trend || "stable",
    };
  }

  _buildInsights(summary, aggregate, topApps = []) {
    const insights = [];

    if (summary.avgSleepHours > 0 && summary.avgSleepHours < 7) {
      insights.push({
        title: "Sleep Improvement Needed",
        subtitle: `Average sleep is ${summary.avgSleepHours}h. Aim for 7-9h for better recovery.`,
        color: "#f59e0b",
      });
    } else if (summary.avgSleepHours >= 7) {
      insights.push({
        title: "Solid Sleep Routine",
        subtitle: `You're averaging ${summary.avgSleepHours}h of sleep. Keep it consistent.`,
        color: "#10b981",
      });
    }

    if (summary.avgMoodScore > 0 && summary.avgMoodScore < 50) {
      insights.push({
        title: "Mood Support",
        subtitle: "Mood scores are trending low. Consider extra support or restorative activities.",
        color: "#ef4444",
      });
    } else if (summary.avgMoodScore >= 70) {
      insights.push({
        title: "Positive Mood Trend",
        subtitle: "Mood scores are strong overall. Keep doing what's working.",
        color: "#3b82f6",
      });
    }

    if (summary.avgScreenTimeMinutes >= 360) {
      insights.push({
        title: "High Screen Time",
        subtitle: "Average screen time is above 6 hours. Consider short breaks and limits.",
        color: "#8b5cf6",
      });
    }

    const nightMinutes = aggregate.activity?.avg_night_screen_minutes || 0;
    const nightUsagePercent = aggregate.activity?.avg_night_usage_percent || 0;
    if (nightMinutes >= 90 || nightUsagePercent >= 35) {
      insights.push({
        title: "Late Night Usage",
        subtitle: "Night screen time is elevated. Consider a screen-free wind-down routine.",
        color: "#6366f1",
      });
    }

    if (topApps.length > 0 && topApps[0].sharePercent >= 25) {
      insights.push({
        title: "Top App Dominates Usage",
        subtitle: `${topApps[0].appName} accounts for ${topApps[0].sharePercent}% of screen time.`,
        color: "#0ea5e9",
      });
    }

    const quality = aggregate.data_quality?.average_completeness || 0;
    if (quality > 0 && quality < 60) {
      insights.push({
        title: "Limited Data Coverage",
        subtitle: "More consistent tracking will improve report accuracy.",
        color: "#f97316",
      });
    }

    if (summary.overallTrend === "improving") {
      insights.push({
        title: "Momentum Building",
        subtitle: "Overall trend is improving. Stay consistent with your routines.",
        color: "#10b981",
      });
    } else if (summary.overallTrend === "declining") {
      insights.push({
        title: "Recent Decline",
        subtitle: "Overall trend has dipped. Consider small adjustments this week.",
        color: "#ef4444",
      });
    }

    return insights.slice(0, 4);
  }

  _buildRecommendations(summary, aggregate, topApps = []) {
    const recommendations = [];

    if (summary.avgSleepHours > 0 && summary.avgSleepHours < 7) {
      recommendations.push("Try a consistent bedtime and reduce late-night screen use");
    }

    if (summary.avgScreenTimeMinutes >= 360) {
      recommendations.push("Add two short screen breaks during the day");
    }

    if (topApps.length > 0 && topApps[0].sharePercent >= 30) {
      recommendations.push(`Try reducing ${topApps[0].appName} by 20-30 minutes each day`);
    }

    if (summary.avgMoodScore > 0 && summary.avgMoodScore < 50) {
      recommendations.push("Schedule a short recovery activity (walk, journaling, or breathing)");
    }

    if ((aggregate.data_quality?.average_completeness || 0) < 60) {
      recommendations.push("Track at least one key metric daily for stronger insights");
    }

    if (recommendations.length === 0) {
      recommendations.push("Keep your current routine and continue tracking consistently");
    }

    return recommendations.slice(0, 4);
  }

  _roundTo(value, decimals) {
    if (value === null || value === undefined || Number.isNaN(value)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  _getDateRangeForDays(days) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  async _buildCoverage(aggregate, days, startDate, endDate) {
    const sleepDays = aggregate.sleep?.days_with_data || 0;
    const activityDays = aggregate.activity?.days_with_data || 0;
    const moodDays = this._countUniqueDays(aggregate.wellness?.daily_breakdown || []);
    const appUsageDays = await this._getAppUsageDaysInRange(startDate, endDate, days);

    const sleepCoverage = this._toPercent(sleepDays, days);
    const moodCoverage = this._toPercent(moodDays, days);
    const activityCoverage = this._toPercent(activityDays, days);
    const appUsageCoverage = this._toPercent(appUsageDays, days);

    const overallCoverage = Math.round(
      (sleepCoverage * 0.4) +
      (moodCoverage * 0.3) +
      (activityCoverage * 0.2) +
      (appUsageCoverage * 0.1)
    );

    return {
      sleepDays,
      moodDays,
      activityDays,
      appUsageDays,
      totalDays: days,
      sleepCoverage,
      moodCoverage,
      activityCoverage,
      appUsageCoverage,
      overallCoverage,
      confidence: this._getConfidenceTier(overallCoverage),
    };
  }

  _countUniqueDays(entries) {
    const set = new Set();
    entries.forEach((e) => {
      if (e?.date) set.add(e.date);
    });
    return set.size;
  }

  _toPercent(value, total) {
    if (!total || total <= 0) return 0;
    return Math.round((value / total) * 100);
  }

  _getConfidenceTier(coverage) {
    if (coverage >= 80) return "high";
    if (coverage >= 60) return "medium";
    if (coverage >= 40) return "low";
    return "none";
  }

  async _getAppUsageDaysInRange(startDate, endDate, days) {
    try {
      const daily = await localStorageService.getItem("app_usage_daily") || {};
      const weekly = await localStorageService.getItem("app_usage_weekly") || {};
      const monthly = await localStorageService.getItem("app_usage_monthly") || {};

      const start = new Date(startDate);
      const end = new Date(endDate);

      const dailyDays = Object.keys(daily).filter((dateStr) => {
        const d = new Date(dateStr);
        return d >= start && d <= end;
      }).length;

      let aggregatedDays = 0;
      if (days > 90) {
        aggregatedDays = Object.values(monthly).reduce((sum, entry) => {
          const monthStart = entry.month || entry.month_start;
          if (!monthStart) return sum;
          const { start: ms, end: me } = this._getMonthRange(monthStart);
          if (me < start || ms > end) return sum;
          const daysInMonth = this._daysBetween(ms, me) + 1;
          return sum + daysInMonth;
        }, 0);
      } else if (days > 7) {
        aggregatedDays = Object.values(weekly).reduce((sum, entry) => {
          const weekStart = entry.weekStart || entry.week_start;
          if (!weekStart) return sum;
          const weekEnd = this._getWeekEnd(weekStart);
          if (new Date(weekEnd) < start || new Date(weekStart) > end) return sum;
          return sum + (entry.dayCount || entry.days_count || 7);
        }, 0);
      }

      return Math.min(days, dailyDays + aggregatedDays);
    } catch (error) {
      console.error("App usage coverage error:", error);
      return 0;
    }
  }

  async _getTopAppsForRange(startDate, endDate, days) {
    try {
      const daily = await localStorageService.getItem("app_usage_daily") || {};
      const weekly = await localStorageService.getItem("app_usage_weekly") || {};
      const monthly = await localStorageService.getItem("app_usage_monthly") || {};

      const start = new Date(startDate);
      const end = new Date(endDate);

      const dailyEntries = Object.entries(daily)
        .filter(([dateStr]) => {
          const d = new Date(dateStr);
          return d >= start && d <= end;
        })
        .map(([date, data]) => ({ date, ...data }));

      const earliestDaily = dailyEntries.length > 0
        ? dailyEntries.reduce((min, entry) => (entry.date < min ? entry.date : min), dailyEntries[0].date)
        : null;

      const weeklyEntries = Object.values(weekly).filter((entry) => {
        const weekStart = entry.weekStart || entry.week_start;
        if (!weekStart) return false;
        const weekEnd = this._getWeekEnd(weekStart);
        const overlaps = new Date(weekEnd) >= start && new Date(weekStart) <= end;
        const beforeDaily = earliestDaily ? new Date(weekEnd) < new Date(earliestDaily) : true;
        return overlaps && beforeDaily;
      });

      const monthlyEntries = days > 90 && weeklyEntries.length === 0
        ? Object.values(monthly)
        : [];

      const totals = this._accumulateAppUsage(dailyEntries, weeklyEntries, monthlyEntries);
      if (totals.totalMinutes <= 0) return [];

      return Object.values(totals.appMap)
        .map((app) => ({
          appName: app.appName,
          minutes: Math.round(app.minutes),
          sharePercent: Math.round((app.minutes / totals.totalMinutes) * 100),
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 5);
    } catch (error) {
      console.error("Top apps calculation error:", error);
      return [];
    }
  }

  _accumulateAppUsage(dailyEntries, weeklyEntries, monthlyEntries) {
    const appMap = {};
    let totalMinutes = 0;

    dailyEntries.forEach((entry) => {
      totalMinutes += entry.screenTimeMinutes || 0;
      (entry.appUsage || []).forEach((app) => {
        if (!app?.appName) return;
        if (!appMap[app.appName]) {
          appMap[app.appName] = { appName: app.appName, minutes: 0 };
        }
        appMap[app.appName].minutes += app.durationMinutes || 0;
      });
    });

    weeklyEntries.forEach((entry) => {
      totalMinutes += entry.totalScreenTimeMinutes || 0;
      (entry.topApps || []).forEach((app) => {
        if (!app?.appName) return;
        const minutes = app.totalMinutes ?? app.minutes;
        if (!minutes) return;
        if (!appMap[app.appName]) {
          appMap[app.appName] = { appName: app.appName, minutes: 0 };
        }
        appMap[app.appName].minutes += minutes;
      });
    });

    monthlyEntries.forEach((entry) => {
      totalMinutes += entry.totalScreenTimeMinutes || 0;
      (entry.topApps || []).forEach((app) => {
        if (!app?.appName) return;
        const minutes = app.totalMinutes ?? app.minutes;
        if (!minutes) return;
        if (!appMap[app.appName]) {
          appMap[app.appName] = { appName: app.appName, minutes: 0 };
        }
        appMap[app.appName].minutes += minutes;
      });
    });

    return { appMap, totalMinutes };
  }

  _buildCoverageWarning(coverage) {
    return {
      title: "Limited Data Coverage",
      subtitle: `Coverage is ${coverage.overallCoverage}%. Track more days for stronger insights.`,
      color: "#f97316",
    };
  }

  _buildResolution(days) {
    return {
      sleep: days > 90 ? "monthly" : days > 30 ? "weekly" : "daily",
      mood: "daily",
      activity: "daily",
      appUsage: days > 90 ? "monthly" : days > 7 ? "weekly" : "daily",
    };
  }

  _buildDrivers(aggregate) {
    const sleepSeries = this._seriesByDate(aggregate.sleep?.daily_breakdown, "sleep_minutes");
    const moodSeries = this._seriesByDate(aggregate.wellness?.daily_breakdown, "mood_score");
    const screenSeries = this._seriesByDate(aggregate.activity?.daily_breakdown, "screen_time");
    const nightSeries = this._seriesByDate(aggregate.activity?.daily_breakdown, "night_usage");

    const drivers = [];

    const sleepMood = this._correlateSeries(sleepSeries, moodSeries);
    if (sleepMood) {
      drivers.push({
        factor: "sleep_duration",
        direction: sleepMood.correlation >= 0 ? "positive" : "negative",
        strength: this._roundTo(Math.abs(sleepMood.correlation), 2),
        note: sleepMood.correlation >= 0
          ? "More sleep aligns with higher mood scores."
          : "Lower sleep aligns with lower mood scores.",
      });
    }

    const screenSleep = this._correlateSeries(screenSeries, sleepSeries);
    if (screenSleep) {
      drivers.push({
        factor: "screen_time",
        direction: screenSleep.correlation >= 0 ? "negative" : "positive",
        strength: this._roundTo(Math.abs(screenSleep.correlation), 2),
        note: screenSleep.correlation >= 0
          ? "More screen time aligns with lower sleep duration."
          : "Lower screen time aligns with better sleep duration.",
      });
    }

    const nightSleep = this._correlateSeries(nightSeries, sleepSeries);
    if (nightSleep) {
      drivers.push({
        factor: "night_screen_time",
        direction: nightSleep.correlation >= 0 ? "negative" : "positive",
        strength: this._roundTo(Math.abs(nightSleep.correlation), 2),
        note: nightSleep.correlation >= 0
          ? "Late-night usage aligns with reduced sleep."
          : "Lower late-night usage aligns with better sleep.",
      });
    }

    return drivers
      .filter((d) => d.strength >= 0.35)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 2);
  }

  _buildVolatility(aggregate) {
    const sleepValues = (aggregate.sleep?.daily_breakdown || [])
      .map((d) => d.sleep_minutes || 0)
      .filter((v) => v > 0);
    const moodValues = (aggregate.wellness?.daily_breakdown || [])
      .map((d) => d.mood_score || 0)
      .filter((v) => v > 0);

    const sleepStd = this._stdDev(sleepValues);
    const moodStd = this._stdDev(moodValues);

    return {
      sleepStdDevMinutes: this._roundTo(sleepStd, 1),
      moodStdDevScore: this._roundTo(moodStd, 1),
      sleepVolatility: this._volatilityTier(sleepStd, 45, 90),
      moodVolatility: this._volatilityTier(moodStd, 8, 15),
    };
  }

  _seriesByDate(entries, valueKey) {
    const map = new Map();
    (entries || []).forEach((entry) => {
      if (!entry?.date) return;
      const value = entry[valueKey];
      if (value === null || value === undefined) return;
      map.set(entry.date, value);
    });
    return map;
  }

  _correlateSeries(mapA, mapB) {
    if (!mapA || !mapB) return null;
    const pairs = [];
    mapA.forEach((value, date) => {
      if (mapB.has(date)) {
        pairs.push([value, mapB.get(date)]);
      }
    });

    if (pairs.length < 4) return null;

    const xs = pairs.map((p) => p[0]);
    const ys = pairs.map((p) => p[1]);
    const correlation = this._calculateCorrelation(xs, ys);
    if (Number.isNaN(correlation)) return null;
    return { correlation, count: pairs.length };
  }

  _calculateCorrelation(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return 0;
    const avgX = xs.reduce((a, b) => a + b, 0) / n;
    const avgY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i] - avgX;
      const y = ys[i] - avgY;
      num += x * y;
      dx += x * x;
      dy += y * y;
    }
    if (dx === 0 || dy === 0) return 0;
    return num / Math.sqrt(dx * dy);
  }

  _stdDev(values) {
    if (!values || values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  _volatilityTier(value, mediumThreshold, highThreshold) {
    if (value >= highThreshold) return "high";
    if (value >= mediumThreshold) return "medium";
    if (value > 0) return "low";
    return "none";
  }

  async _getSleepRangeData(startDate, endDate) {
    try {
      const nightly = await localStorageService.getItem("sleep_nightly_summaries") || {};
      const weekly = await localStorageService.getItem("sleep_weekly_aggregates") || {};
      const monthly = await localStorageService.getItem("sleep_monthly_aggregates") || {};
      const yearly = await localStorageService.getItem("sleep_yearly_archive") || {};

      const start = new Date(startDate);
      const end = new Date(endDate);

      const nightlyEntries = Object.keys(nightly)
        .filter((dateStr) => {
          const d = new Date(dateStr);
          return d >= start && d <= end;
        })
        .map((date) => ({ date, ...nightly[date] }));

      const weeklyEntries = Object.keys(weekly)
        .map((key) => ({ key, ...weekly[key] }))
        .filter((entry) => {
          const weekStart = entry.week_start || entry.weekStart || entry.key;
          const weekEnd = entry.week_end || this._getWeekEnd(weekStart);
          return new Date(weekEnd) >= start && new Date(weekStart) <= end;
        });

      const monthlyEntries = Object.keys(monthly)
        .map((key) => ({ key, ...monthly[key] }))
        .filter((entry) => {
          const monthStart = entry.month_start || entry.month || entry.key;
          const monthEnd = entry.month_end || this._getMonthRange(monthStart).end.toISOString().split("T")[0];
          return new Date(monthEnd) >= start && new Date(monthStart) <= end;
        });

      const yearlyEntries = Object.keys(yearly)
        .map((key) => ({ key, ...yearly[key] }))
        .filter((entry) => {
          const monthStart = entry.month_start || entry.month || entry.key;
          const monthEnd = entry.month_end || this._getMonthRange(monthStart).end.toISOString().split("T")[0];
          return new Date(monthEnd) >= start && new Date(monthStart) <= end;
        });

      return { nightlyEntries, weeklyEntries, monthlyEntries, yearlyEntries };
    } catch (error) {
      console.error("Sleep range data error:", error);
      return { nightlyEntries: [], weeklyEntries: [], monthlyEntries: [], yearlyEntries: [] };
    }
  }

  _buildSleepAggregateFromRange(rangeData, daysSpan, startDate, endDate) {
    const nightly = rangeData.nightlyEntries || [];
    const weekly = rangeData.weeklyEntries || [];
    const monthly = rangeData.monthlyEntries || [];
    const yearly = rangeData.yearlyEntries || [];

    if (nightly.length === 0 && weekly.length === 0 && monthly.length === 0 && yearly.length === 0) {
      return this._buildSleepAggregate([], daysSpan, startDate, endDate);
    }

    const weightedTotals = this._accumulateSleepWeightedTotals(nightly, weekly, monthly, yearly);
    const daysWithData = weightedTotals.daysWithData;
    const totalDays = Math.min(daysSpan, weightedTotals.totalDays || daysSpan);
    const avgSleepMinutes = totalDays > 0 ? weightedTotals.totalSleepMinutes / totalDays : 0;

    const trendSeries = this._buildSleepTrendSeries(nightly, weekly, monthly, yearly);

    return {
      period_days: daysSpan,
      date_range: { start: startDate, end: endDate },
      avg_sleep_hours: avgSleepMinutes / 60,
      consistency_score: dataAggregationService._calculateConsistencyScore(nightly),
      sleep_debt_minutes: dataAggregationService._calculateSleepDebt(nightly, 480),
      trend: dataAggregationService._detectTrend(trendSeries),
      days_with_data: daysWithData,
      data_completeness: totalDays > 0 ? (daysWithData / totalDays) * 100 : 0,
      daily_breakdown: nightly.map((s) => ({
        date: s.date,
        sleep_minutes: s.total_sleep_minutes,
        efficiency: s.sleep_efficiency,
      })),
    };
  }

  _accumulateSleepWeightedTotals(nightly, weekly, monthly, yearly) {
    const totals = {
      totalSleepMinutes: 0,
      daysWithData: 0,
      totalDays: 0,
    };

    nightly.forEach((entry) => {
      const minutes = entry.total_sleep_minutes || 0;
      totals.totalSleepMinutes += minutes;
      totals.totalDays += 1;
      if (minutes > 0) totals.daysWithData += 1;
    });

    const addAggregate = (entry, daysFallback) => {
      const daysCount = entry.days_count || entry.dayCount || daysFallback;
      const avgMinutes = entry.avg_sleep_minutes || 0;
      totals.totalSleepMinutes += avgMinutes * daysCount;
      totals.totalDays += daysCount;
      if (avgMinutes > 0) totals.daysWithData += daysCount;
    };

    weekly.forEach((entry) => addAggregate(entry, 7));
    monthly.forEach((entry) => {
      const monthStart = entry.month_start || entry.month || entry.key;
      const daysFallback = monthStart ? this._daysInMonth(monthStart) : 30;
      addAggregate(entry, daysFallback);
    });
    yearly.forEach((entry) => {
      const monthStart = entry.month_start || entry.month || entry.key;
      const daysFallback = monthStart ? this._daysInMonth(monthStart) : 30;
      addAggregate(entry, daysFallback);
    });

    return totals;
  }

  _buildSleepTrendSeries(nightly, weekly, monthly, yearly) {
    const series = [];

    nightly
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((entry) => series.push(entry.total_sleep_minutes || 0));

    weekly
      .slice()
      .sort((a, b) => new Date(a.week_start || a.weekStart || a.key) - new Date(b.week_start || b.weekStart || b.key))
      .forEach((entry) => series.push(entry.avg_sleep_minutes || 0));

    monthly
      .slice()
      .sort((a, b) => new Date(a.month_start || a.month || a.key) - new Date(b.month_start || b.month || b.key))
      .forEach((entry) => series.push(entry.avg_sleep_minutes || 0));

    yearly
      .slice()
      .sort((a, b) => new Date(a.month_start || a.month || a.key) - new Date(b.month_start || b.month || b.key))
      .forEach((entry) => series.push(entry.avg_sleep_minutes || 0));

    return series;
  }

  _getWeekEnd(weekStartStr) {
    const date = new Date(weekStartStr);
    date.setDate(date.getDate() + 6);
    return date.toISOString().split("T")[0];
  }

  _getMonthRange(monthStartStr) {
    const start = new Date(monthStartStr.length === 7 ? `${monthStartStr}-01` : monthStartStr);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return { start, end };
  }

  _daysInMonth(monthStartStr) {
    const range = this._getMonthRange(monthStartStr);
    return this._daysBetween(range.start, range.end) + 1;
  }

  _daysBetween(start, end) {
    const ms = end.getTime() - start.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  _isNoDataAggregate(aggregate) {
    const sleep = aggregate.sleep || {};
    const wellness = aggregate.wellness || {};
    const activity = aggregate.activity || {};
    return (
      (sleep.days_with_data || 0) === 0 &&
      (wellness.total_entries || 0) === 0 &&
      (activity.days_with_data || 0) === 0
    );
  }

  _buildSleepAggregate(sleepSummaries, daysSpan, startDate, endDate) {
    if (!sleepSummaries || sleepSummaries.length === 0) {
      return {
        period_days: daysSpan,
        date_range: { start: startDate, end: endDate },
        avg_sleep_hours: 0,
        consistency_score: 0,
        sleep_debt_minutes: 0,
        trend: "insufficient_data",
        days_with_data: 0,
        data_completeness: 0,
        daily_breakdown: [],
      };
    }

    return {
      period_days: daysSpan,
      date_range: { start: startDate, end: endDate },
      avg_sleep_hours: dataAggregationService._calculateAverage(sleepSummaries, "total_sleep_minutes") / 60,
      consistency_score: dataAggregationService._calculateConsistencyScore(sleepSummaries),
      sleep_debt_minutes: dataAggregationService._calculateSleepDebt(sleepSummaries, 480),
      trend: dataAggregationService._detectTrend(sleepSummaries.map((s) => s.total_sleep_minutes || 0)),
      days_with_data: sleepSummaries.filter((s) => s.total_sleep_minutes > 0).length,
      data_completeness: (sleepSummaries.filter((s) => s.total_sleep_minutes > 0).length / daysSpan) * 100,
      daily_breakdown: sleepSummaries.map((s) => ({
        date: s.date,
        sleep_minutes: s.total_sleep_minutes,
        efficiency: s.sleep_efficiency,
      })),
    };
  }

  _buildWellnessAggregate(journalEntries, daysSpan, startDate, endDate) {
    if (!journalEntries || journalEntries.length === 0) {
      return {
        period_days: daysSpan,
        date_range: { start: startDate, end: endDate },
        avg_mood_score: 0,
        avg_sentiment_score: 0,
        mood_consistency: 0,
        mood_trend: "insufficient_data",
        total_entries: 0,
        daily_breakdown: [],
      };
    }

    const moods = journalEntries.map((e) => e.mood_score || 0).filter((m) => m !== null);
    const sentiments = journalEntries.map((e) => e.sentiment_score || 0).filter((s) => s !== null);

    return {
      period_days: daysSpan,
      date_range: { start: startDate, end: endDate },
      avg_mood_score: moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 0,
      avg_sentiment_score: sentiments.length > 0 ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 0,
      mood_consistency: dataAggregationService._calculateMoodConsistency(moods),
      mood_trend: dataAggregationService._detectTrend(moods),
      total_entries: journalEntries.length,
      daily_breakdown: journalEntries.map((e) => ({
        date: e.date,
        mood_score: e.mood_score,
        sentiment_score: e.sentiment_score,
        sentiment_label: e.sentiment_label,
        has_entry: !!e.text,
      })),
    };
  }

  _buildActivityAggregate(activityData, daysSpan, startDate, endDate) {
    if (!activityData || activityData.length === 0) {
      return {
        period_days: daysSpan,
        date_range: { start: startDate, end: endDate },
        avg_screen_time_minutes: 0,
        avg_night_screen_minutes: 0,
        screen_time_trend: "insufficient_data",
        days_with_data: 0,
        data_completeness: 0,
        daily_breakdown: [],
      };
    }

    const screenTimes = activityData.map((d) => d.screen_time_minutes || 0).filter((t) => t >= 0);
    return {
      period_days: daysSpan,
      date_range: { start: startDate, end: endDate },
      avg_screen_time_minutes: dataAggregationService._calculateAverage(activityData, "screen_time_minutes"),
      avg_night_screen_minutes: dataAggregationService._calculateAverage(activityData, "night_screen_minutes"),
      screen_time_trend: dataAggregationService._detectTrend(screenTimes),
      days_with_data: activityData.filter((d) => d.screen_time_minutes !== null).length,
      data_completeness: (activityData.filter((d) => d.screen_time_minutes !== null).length / daysSpan) * 100,
      daily_breakdown: activityData.map((d) => ({
        date: d.date,
        screen_time: d.screen_time_minutes,
        night_usage: d.night_screen_minutes,
      })),
    };
  }
}

export default new ReportGenerationService();
