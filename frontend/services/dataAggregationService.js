/**
 * Data Aggregation Service - PHASE 1: On-Device Analytics
 * 
 * Master service for combining and analyzing all local wellness data.
 * 
 * Architecture:
 * ├─ Input Layer: Queries sleep + journal + activity data from local storage
 * ├─ Processing Layer: Aggregates into time windows (7/14/30/365 days)
 * ├─ Analysis Layer: Calculates metrics (trends, consistency, debt, quality)
 * ├─ Output Layer: Returns comprehensive wellness snapshots
 * └─ Cache Layer: Caches expensive calculations (1 hour TTL)
 * 
 * Data Flow:
 * localStorageService (encrypted data)
 *   ├─→ Sleep summaries → aggregateSleepData()
 *   ├─→ Journal entries → aggregateWellnessData()
 *   └─→ Activity data → aggregateActivityData()
 *       ↓
 *   dataAggregationService (calculates + caches)
 *       ↓
 *   Dashboard/Reports/Alerts (displays results)
 */

import localStorageService from './localStorageService';
import behavioralTrackingService from './behavioralTrackingService';
import onDeviceAIService from './onDeviceAIService';

class DataAggregationService {
  constructor() {
    this.initialized = false;
    this.cache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour cache
  }

  async initialize() {
    try {
      console.log('🔄 DataAggregationService initializing...');
      await localStorageService.initialize();
      this.initialized = true;
      console.log('✅ DataAggregationService initialized');
    } catch (error) {
      console.error('DataAggregationService initialization error:', error);
      throw error;
    }
  }

  // ========================================
  // CACHE MANAGEMENT
  // ========================================

  _getCacheKey(type, params) {
    return `${type}:${JSON.stringify(params)}`;
  }

  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }

  // ========================================
  // MAIN AGGREGATION METHODS
  // ========================================

  /**
   * Aggregate sleep data for a given time window
   * Returns comprehensive sleep metrics
   */
  async aggregateSleepData(days = 7) {
    const cacheKey = this._getCacheKey('sleep', { days });
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const summaries = await localStorageService.getSleepSummaries(days);
      
      if (!summaries || summaries.length === 0) {
        return this._getEmptySleepAggregate();
      }

      // Calculate all sleep metrics
      const result = {
        period_days: days,
        date_range: {
          start: summaries[summaries.length - 1].date,
          end: summaries[0].date,
        },
        
        // Basic metrics
        avg_sleep_hours: this._calculateAverage(summaries, 'total_sleep_minutes') / 60,
        avg_sleep_minutes: this._calculateAverage(summaries, 'total_sleep_minutes'),
        total_sleep_hours: summaries.reduce((sum, s) => sum + (s.total_sleep_minutes || 0), 0) / 60,
        min_sleep_night: Math.min(...summaries.map(s => s.total_sleep_minutes || 0)),
        max_sleep_night: Math.max(...summaries.map(s => s.total_sleep_minutes || 0)),
        
        // Sleep quality
        avg_sleep_efficiency: this._calculateAverage(summaries, 'sleep_efficiency'),
        avg_deep_sleep_minutes: this._calculateAverage(summaries, 'deep_sleep_minutes'),
        avg_light_sleep_minutes: this._calculateAverage(summaries, 'light_sleep_minutes'),
        avg_fragmentation_count: this._calculateAverage(summaries, 'fragmentation_count'),
        avg_wake_minutes: this._calculateAverage(summaries, 'wake_minutes'),
        avg_confidence_score: this._calculateAverage(summaries, 'confidence_score'),
        
        // Consistency & patterns
        consistency_score: this._calculateConsistencyScore(summaries),
        sleep_onset_variability: this._calculateOnsetVariability(summaries),
        wake_time_variability: this._calculateWakeTimeVariability(summaries),
        
        // Debt & trends
        sleep_debt_minutes: this._calculateSleepDebt(summaries, 480), // 8 hours target
        trend: this._detectTrend(summaries.map(s => s.total_sleep_minutes)),
        
        // Nap data
        total_nap_sessions: summaries.reduce((sum, s) => sum + (s.nap_sessions?.length || 0), 0),
        total_nap_minutes: summaries.reduce((sum, s) => 
          sum + (s.nap_sessions?.reduce((nsum, n) => nsum + (n.duration_minutes || 0), 0) || 0), 0),
        nap_only_days_count: summaries.filter(s => s.nap_only_day).length,
        
        // Data quality
        days_with_data: summaries.filter(s => s.total_sleep_minutes > 0).length,
        missing_days: summaries.filter(s => s.total_sleep_minutes === 0).length,
        data_completeness: (summaries.filter(s => s.total_sleep_minutes > 0).length / summaries.length) * 100,
        
        // Raw data for detailed analysis
        daily_breakdown: summaries.map(s => ({
          date: s.date,
          sleep_minutes: s.total_sleep_minutes,
          efficiency: s.sleep_efficiency,
          deep_sleep: s.deep_sleep_minutes,
          fragmentation: s.fragmentation_count,
        })),
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error aggregating sleep data:', error);
      return this._getEmptySleepAggregate();
    }
  }

  /**
   * Aggregate wellness data (mood + journal sentiment)
   */
  async aggregateWellnessData(days = 7) {
    const cacheKey = this._getCacheKey('wellness', { days });
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const journalEntries = await localStorageService.getJournalEntries(days);
      
      if (!journalEntries || journalEntries.length === 0) {
        return this._getEmptyWellnessAggregate();
      }

      const normalizedEntries = journalEntries.map((entry) => {
        const moodScore = typeof entry.mood_score === 'number'
          ? entry.mood_score
          : typeof entry.currentScore === 'number'
            ? entry.currentScore
            : typeof entry.finalScore === 'number'
              ? entry.finalScore
              : 0;

        const sentimentScore = typeof entry.sentiment_score === 'number'
          ? entry.sentiment_score
          : typeof entry.sentimentScore === 'number'
            ? entry.sentimentScore
            : 0;

        const sentimentLabel = entry.sentiment_label
          || entry.currentSentiment
          || entry.finalSentiment
          || 'neutral';

        const hasEntryText = !!entry.text
          || !!entry.content
          || (Array.isArray(entry.logs) && entry.logs.some((log) => !log?.deleted && !!log?.text));

        return {
          ...entry,
          mood_score: moodScore,
          sentiment_score: sentimentScore,
          sentiment_label: sentimentLabel,
          _has_entry_text: hasEntryText,
        };
      });

      // Calculate sentiment distribution
      const sentiments = normalizedEntries
        .map(e => e.sentiment_score || 0)
        .filter(s => s !== null);
      
      const moods = normalizedEntries
        .map(e => e.mood_score || 0)
        .filter(m => m !== null);

      // Count sentiment labels
      const sentimentLabels = normalizedEntries
        .map(e => e.sentiment_label || 'neutral')
        .reduce((acc, label) => {
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        }, {});

      // Identify best/worst days
      const sortedByMood = [...normalizedEntries].sort((a, b) => 
        (b.mood_score || 0) - (a.mood_score || 0)
      );

      const result = {
        period_days: days,
        date_range: {
          start: normalizedEntries[normalizedEntries.length - 1].date,
          end: normalizedEntries[0].date,
        },
        
        // Mood metrics
        avg_mood_score: moods.length > 0 ? moods.reduce((a, b) => a + b) / moods.length : 0,
        highest_mood_score: Math.max(...moods, 0),
        lowest_mood_score: Math.min(...moods, 10),
        mood_consistency: this._calculateMoodConsistency(moods),
        
        // Sentiment analysis
        avg_sentiment_score: sentiments.length > 0 ? sentiments.reduce((a, b) => a + b) / sentiments.length : 0,
        sentiment_distribution: sentimentLabels,
        dominant_sentiment: Object.keys(sentimentLabels).sort((a, b) => 
          sentimentLabels[b] - sentimentLabels[a]
        )[0] || 'neutral',
        
        // Trends
        mood_trend: this._detectTrend(moods),
        sentiment_trend: this._detectTrend(sentiments),
        
        // Patterns
        positive_days: normalizedEntries.filter(e => (e.sentiment_label === 'positive')).length,
        neutral_days: Object.entries(sentimentLabels).find(([k]) => k === 'neutral')?.[1] || 0,
        negative_days: Object.entries(sentimentLabels).find(([k]) => k === 'negative')?.[1] || 0,
        
        // Entry tracking
        total_entries: normalizedEntries.length,
        entries_per_day: normalizedEntries.length / days,
        best_mood_day: sortedByMood[0]?.date || null,
        worst_mood_day: sortedByMood[sortedByMood.length - 1]?.date || null,
        
        // Daily breakdown
        daily_breakdown: normalizedEntries.map(e => ({
          date: e.date,
          mood_score: e.mood_score,
          sentiment_score: e.sentiment_score,
          sentiment_label: e.sentiment_label,
          has_entry: e._has_entry_text,
        })),
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error aggregating wellness data:', error);
      return this._getEmptyWellnessAggregate();
    }
  }

  /**
   * Aggregate activity data (screen time, usage)
   */
  async aggregateActivityData(days = 7) {
    const cacheKey = this._getCacheKey('activity', { days });
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      let activityData = [];
      
      const hasConsent = typeof behavioralTrackingService.hasConsent === 'function'
        ? behavioralTrackingService.hasConsent()
        : !!behavioralTrackingService.consentGiven;

      if (hasConsent || !behavioralTrackingService) {
        // Use local activity cache when consent is granted (or service is unavailable)
        activityData = await localStorageService.getActivityData(days) || [];
      }

      if (!activityData || activityData.length === 0) {
        return this._getEmptyActivityAggregate();
      }

      // Calculate screen time metrics
      const screenTimes = activityData
        .map(d => d.screen_time_minutes || 0)
        .filter(t => t >= 0);

      const nightScreenTimes = activityData
        .map(d => d.night_screen_minutes || 0)
        .filter(t => t >= 0);

      const result = {
        period_days: days,
        date_range: {
          start: activityData[activityData.length - 1].date,
          end: activityData[0].date,
        },
        
        // Screen time metrics
        avg_screen_time_minutes: this._calculateAverage(activityData, 'screen_time_minutes'),
        avg_night_screen_minutes: this._calculateAverage(activityData, 'night_screen_minutes'),
        total_screen_time_hours: screenTimes.reduce((a, b) => a + b, 0) / 60,
        max_screen_time_day: Math.max(...screenTimes, 0),
        min_screen_time_day: Math.min(...screenTimes.filter(t => t > 0), 0),
        
        // Night usage (impacts sleep)
        avg_night_usage_percent: this._calculateNightUsagePercent(activityData),
        high_night_usage_days: activityData.filter(d => (d.night_screen_minutes || 0) > 120).length,
        
        // Activity tracking
        avg_steps: this._calculateAverage(activityData, 'steps'),
        active_minutes: this._calculateAverage(activityData, 'active_minutes'),
        
        // Trends
        screen_time_trend: this._detectTrend(screenTimes),
        night_usage_trend: this._detectTrend(nightScreenTimes),
        
        // Data quality
        days_with_data: activityData.filter(d => d.screen_time_minutes !== null).length,
        data_completeness: (activityData.filter(d => d.screen_time_minutes !== null).length / activityData.length) * 100,
        
        // Daily breakdown
        daily_breakdown: activityData.map(d => ({
          date: d.date,
          screen_time: d.screen_time_minutes,
          night_usage: d.night_screen_minutes,
          steps: d.steps,
        })),
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error aggregating activity data:', error);
      return this._getEmptyActivityAggregate();
    }
  }

  /**
   * Generate comprehensive daily aggregate (all metrics for one day)
   */
  async generateDailyAggregate(date) {
    try {
      const cacheKey = this._getCacheKey('daily', { date });
      const cached = this._getFromCache(cacheKey);
      if (cached) return cached;

      const sleep = await localStorageService.getSleepSummary(date);
      const journalEntries = await localStorageService.getJournalEntries(1, date);
      const activity = await localStorageService.getActivityData(1, date);

      const result = {
        date,
        sleep: sleep || this._getEmptySleepDay(),
        wellness: journalEntries[0] || this._getEmptyWellnessDay(),
        activity: activity?.[0] || this._getEmptyActivityDay(),
        timestamp: new Date().toISOString(),
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error generating daily aggregate:', error);
      return null;
    }
  }

  /**
   * Generate rolling window aggregate (multi-day rolling stats)
   */
  async generateRollingAggregate(days = 7) {
    try {
      const sleep = await this.aggregateSleepData(days);
      const wellness = await this.aggregateWellnessData(days);
      const activity = await this.aggregateActivityData(days);

      return {
        period: `${days} days`,
        generated_at: new Date().toISOString(),
        sleep,
        wellness,
        activity,
        
        // Composite metrics
        overall_trend: this._calculateOverallTrend(sleep, wellness, activity),
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
      };
    } catch (error) {
      console.error('Error generating rolling aggregate:', error);
      return null;
    }
  }

  /**
   * Generate comparison between two periods
   */
  async comparePeriods(days1 = 7, days2 = 14) {
    try {
      const period1 = await this.generateRollingAggregate(days1);
      const period2 = await this.generateRollingAggregate(days2);

      if (!period1 || !period2) return null;

      return {
        period_1: { label: `Last ${days1} days`, data: period1 },
        period_2: { label: `Last ${days2} days`, data: period2 },
        changes: {
          sleep_hours_change: period1.sleep.avg_sleep_hours - period2.sleep.avg_sleep_hours,
          mood_score_change: period1.wellness.avg_mood_score - period2.wellness.avg_mood_score,
          screen_time_change: period1.activity.avg_screen_time_minutes - period2.activity.avg_screen_time_minutes,
        },
        trends: {
          sleep_improving: period1.sleep.trend === 'improving',
          mood_improving: period1.wellness.mood_trend === 'improving',
          activity_improving: period1.activity.screen_time_trend === 'declining', // Less screen = better
        },
      };
    } catch (error) {
      console.error('Error comparing periods:', error);
      return null;
    }
  }

  // ========================================
  // STATISTICAL HELPER FUNCTIONS
  // ========================================

  _calculateAverage(items, field) {
    const values = items
      .map(item => item[field] || 0)
      .filter(v => v !== null && v !== undefined);
    
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  _calculateConsistencyScore(sleepData) {
    if (!sleepData || sleepData.length < 2) return 0;

    // Calculate variance in sleep duration
    const sleepHours = sleepData.map(s => (s.total_sleep_minutes || 0) / 60);
    const mean = sleepHours.reduce((a, b) => a + b) / sleepHours.length;
    const variance = sleepHours.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sleepHours.length;
    const stdDev = Math.sqrt(variance);

    // Convert to 0-100 score (lower variance = higher consistency)
    // Standard deviation > 3 hours = very inconsistent (0 score)
    // Standard deviation < 0.5 hours = very consistent (100 score)
    const consistency = Math.max(0, Math.min(100, 100 - (stdDev * 20)));
    return Math.round(consistency);
  }

  _calculateOnsetVariability(sleepData) {
    if (!sleepData || sleepData.length < 2) return 0;

    const onsetTimes = sleepData
      .filter(s => s.sleep_start_time)
      .map(s => {
        const date = new Date(s.sleep_start_time);
        return date.getHours() + date.getMinutes() / 60;
      });

    if (onsetTimes.length < 2) return 0;

    const mean = onsetTimes.reduce((a, b) => a + b) / onsetTimes.length;
    const variance = onsetTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / onsetTimes.length;
    const stdDev = Math.sqrt(variance);

    return Math.round(stdDev * 100) / 100;
  }

  _calculateWakeTimeVariability(sleepData) {
    if (!sleepData || sleepData.length < 2) return 0;

    const wakeTimes = sleepData
      .filter(s => s.sleep_end_time)
      .map(s => {
        const date = new Date(s.sleep_end_time);
        return date.getHours() + date.getMinutes() / 60;
      });

    if (wakeTimes.length < 2) return 0;

    const mean = wakeTimes.reduce((a, b) => a + b) / wakeTimes.length;
    const variance = wakeTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / wakeTimes.length;
    const stdDev = Math.sqrt(variance);

    return Math.round(stdDev * 100) / 100;
  }

  _calculateSleepDebt(sleepData, targetMinutes = 480) {
    if (!sleepData || sleepData.length === 0) return 0;

    const actualTotal = sleepData.reduce((sum, s) => sum + (s.total_sleep_minutes || 0), 0);
    const expectedTotal = targetMinutes * sleepData.length;
    const debt = Math.max(0, expectedTotal - actualTotal);

    return Math.round(debt);
  }

  _calculateMoodConsistency(moods) {
    if (!moods || moods.length < 2) return 0;

    const mean = moods.reduce((a, b) => a + b) / moods.length;
    const variance = moods.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / moods.length;
    const stdDev = Math.sqrt(variance);

    // Convert to 0-100 score
    const consistency = Math.max(0, Math.min(100, 100 - (stdDev * 10)));
    return Math.round(consistency);
  }

  _calculateNightUsagePercent(activityData) {
    if (!activityData || activityData.length === 0) return 0;

    const nightUsageTotal = activityData.reduce((sum, d) => sum + (d.night_screen_minutes || 0), 0);
    const totalUsage = activityData.reduce((sum, d) => sum + (d.screen_time_minutes || 0), 0);

    if (totalUsage === 0) return 0;
    return Math.round((nightUsageTotal / totalUsage) * 100);
  }

  _detectTrend(dataPoints) {
    if (!dataPoints || dataPoints.length < 7) return 'insufficient_data';

    // Split into two halves
    const mid = Math.floor(dataPoints.length / 2);
    const firstHalf = dataPoints.slice(0, mid);
    const secondHalf = dataPoints.slice(mid);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = secondAvg - firstAvg;
    const percentChange = (change / firstAvg) * 100;

    if (Math.abs(percentChange) < 5) return 'stable';
    return change > 0 ? 'improving' : 'declining';
  }

  _calculateOverallTrend(sleep, wellness, activity) {
    const trends = [
      sleep.trend,
      wellness.mood_trend,
      activity.screen_time_trend === 'declining' ? 'improving' : activity.screen_time_trend,
    ];

    const improving = trends.filter(t => t === 'improving').length;
    const declining = trends.filter(t => t === 'declining').length;

    if (improving > declining) return 'improving';
    if (declining > improving) return 'declining';
    return 'stable';
  }

  // ========================================
  // EMPTY AGGREGATE TEMPLATES
  // ========================================

  _getEmptySleepAggregate() {
    return {
      period_days: 0,
      avg_sleep_hours: 0,
      avg_sleep_efficiency: 0,
      consistency_score: 0,
      sleep_debt_minutes: 0,
      trend: 'insufficient_data',
      data_completeness: 0,
      daily_breakdown: [],
    };
  }

  _getEmptyWellnessAggregate() {
    return {
      period_days: 0,
      avg_mood_score: 0,
      avg_sentiment_score: 0,
      mood_consistency: 0,
      mood_trend: 'insufficient_data',
      total_entries: 0,
      daily_breakdown: [],
    };
  }

  _getEmptyActivityAggregate() {
    return {
      period_days: 0,
      avg_screen_time_minutes: 0,
      avg_night_screen_minutes: 0,
      screen_time_trend: 'insufficient_data',
      data_completeness: 0,
      daily_breakdown: [],
    };
  }

  _getEmptySleepDay() {
    return {
      date: null,
      total_sleep_minutes: 0,
      sleep_efficiency: 0,
      deep_sleep_minutes: 0,
      fragmentation_count: 0,
    };
  }

  _getEmptyWellnessDay() {
    return {
      date: null,
      mood_score: 0,
      sentiment_score: 0,
      sentiment_label: 'neutral',
    };
  }

  _getEmptyActivityDay() {
    return {
      date: null,
      screen_time_minutes: 0,
      night_screen_minutes: 0,
      steps: 0,
    };
  }
}

export default new DataAggregationService();
