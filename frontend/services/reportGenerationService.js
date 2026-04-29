import dataAggregationService from "./dataAggregationService";
import localStorageService from "./localStorageService";

class ReportGenerationService {
  async generateReport(days = 7, type = "weekly") {
    try {
      await dataAggregationService.initialize();

      const aggregate = await dataAggregationService.generateRollingAggregate(days);
      if (!aggregate) {
        return { success: false, message: "No data available for report" };
      }

      const noData = this._isNoDataAggregate(aggregate);

      const compare = await dataAggregationService.comparePeriods(days, days * 2);
      const summary = this._buildSummary(aggregate);
      const insights = noData ? [] : this._buildInsights(summary, aggregate);
      const recommendations = noData ? [] : this._buildRecommendations(summary, aggregate);

      const report = {
        id: `${type}-${days}-${Date.now()}`,
        type,
        periodDays: days,
        periodLabel: type === "weekly" ? "Weekly Summary" : type === "monthly" ? "Monthly Trends" : `${days} Day Report`,
        generatedAt: new Date().toISOString(),
        status: noData ? "no_data" : "ready",
        message: noData ? "No tracked data found for this period." : null,
        summary,
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

      const sleepSummaries = await localStorageService.getSleepSummaries(365);
      const journalEntries = await localStorageService.getJournalEntries(365);
      const activityData = await localStorageService.getActivityData(365);

      const inRange = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      };

      const sleepRange = sleepSummaries.filter((s) => inRange(s.date));
      const journalRange = journalEntries.filter((j) => inRange(j.date));
      const activityRange = activityData.filter((a) => inRange(a.date));

      const sleep = this._buildSleepAggregate(sleepRange, daysSpan, startDate, endDate);
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

      const noData = this._isNoDataAggregate(aggregate);
      const summary = this._buildSummary(aggregate);

      const report = {
        id: `custom-${Date.now()}`,
        type: "custom",
        periodDays: daysSpan,
        periodLabel: "Custom Range",
        generatedAt: new Date().toISOString(),
        status: noData ? "no_data" : "ready",
        message: noData ? "No tracked data found for the selected range." : null,
        dateRange: { start: startDate, end: endDate },
        summary,
        changes: null,
        trendFlags: null,
        dataQuality: aggregate.data_quality,
        insights: noData ? [] : this._buildInsights(summary, aggregate),
        recommendations: noData ? [] : this._buildRecommendations(summary, aggregate),
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

  _buildInsights(summary, aggregate) {
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

  _buildRecommendations(summary, aggregate) {
    const recommendations = [];

    if (summary.avgSleepHours > 0 && summary.avgSleepHours < 7) {
      recommendations.push("Try a consistent bedtime and reduce late-night screen use");
    }

    if (summary.avgScreenTimeMinutes >= 360) {
      recommendations.push("Add two short screen breaks during the day");
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
