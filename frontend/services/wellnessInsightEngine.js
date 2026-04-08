/**
 * Wellness Insight Engine
 * 
 * Deterministic, rule-based insight generation from daily wellness data
 * 
 * Flow:
 * Input Layer → Feature Layer → Pattern Detection → Scoring → Priority Filter → Output
 */

import localStorageService from './localStorageService';

class WellnessInsightEngine {
  constructor() {
    this.lastInsightTimestamps = {}; // Track last insight per type for cooldown
    this.INSIGHT_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours
    this.HIGH_SEVERITY_BYPASS = true; // High severity bypasses cooldown
  }

  // ========================================
  // 1️⃣ INPUT LAYER (Fetch Data)
  // ========================================

  /**
   * Gather all daily inputs needed for analysis
   */
  async gatherDailyInputs() {
    try {
      const [sleepData, wellnessData, usageData] = await Promise.all([
        this.getSleepInputs(),
        this.getWellnessInputs(),
        this.getUsageInputs(),
      ]);

      return {
        sleep: sleepData,
        wellness: wellnessData,
        usage: usageData,
      };
    } catch (error) {
      console.error('Error gathering daily inputs:', error);
      return null;
    }
  }

  async getSleepInputs() {
    const summaries = await localStorageService.getSleepSummaries(7);
    if (!summaries || summaries.length === 0) return null;

    const today = summaries[0];
    return {
      duration_minutes: today.total_sleep_minutes || 0,
      efficiency: today.sleep_efficiency || 0,
      deep_sleep: today.deep_sleep_minutes || 0,
      light_sleep: today.light_sleep_minutes || 0,
      wake_minutes: today.wake_minutes || 0,
      start_time: today.sleep_start_time,
      end_time: today.sleep_end_time,
      confidence_score: today.confidence_score || 0,
      nap_sessions: today.nap_sessions || [],
      nap_only: today.nap_only_day || false,
      source: today.sleep_source || 'unknown',
      history: summaries.slice(0, 7), // Last 7 days
    };
  }

  async getWellnessInputs() {
    const wellnessData = await localStorageService.getWellnessData(7);
    if (!wellnessData || wellnessData.length === 0) return null;

    const today = wellnessData[0];
    return {
      score: today.wellnessScore || 0,
      mood_label: today.moodLabel || 'neutral',
      sentiment_score: today.sentiment_score || 0,
      anomaly_flag: today.anomaly_flag || false,
      content: today.content || '',
      history: wellnessData.slice(0, 7), // Last 7 days
    };
  }

  async getUsageInputs() {
    // This would be fetched from behavioralTrackingService in a real app
    return {
      screen_time_minutes: 0, // Placeholder - integrate with behavioralTrackingService
      pickup_count: 0,
      night_screen_minutes: 0,
    };
  }

  // ========================================
  // 2️⃣ FEATURE LAYER (Compute Derived Metrics)
  // ========================================

  /**
   * Compute derived metrics from raw data
   */
  async computeFeatures(inputs) {
    if (!inputs || !inputs.sleep || !inputs.wellness) return null;

    const sleep = inputs.sleep;
    const wellness = inputs.wellness;

    // Calculate baselines
    const sleepHistory = sleep.history;
    const wellnessHistory = wellness.history;

    const baselineSleep = this.calculateAverage(
      sleepHistory.map(s => s.total_sleep_minutes)
    );

    const baselineEfficiency = this.calculateAverage(
      sleepHistory.map(s => s.sleep_efficiency || 0)
    );

    const baselineMood = this.calculateAverage(
      wellnessHistory.map(w => w.moodLabel === 'positive' ? 1 : (w.moodLabel === 'neutral' ? 0.5 : 0))
    );

    // Calculate consistency score
    const sleepConsistency = this.calculateConsistency(
      sleepHistory.map(s => s.total_sleep_minutes)
    );

    // Calculate circadian score
    const circadianScore = this.calculateCircadianScore(sleepHistory);

    // Calculate sleep debt
    const sleepDebt = Math.max(0, baselineSleep - sleep.duration_minutes);

    // Calculate trends (7-day)
    const sleepTrend = this.calculateTrend(
      sleepHistory.map(s => s.total_sleep_minutes)
    );

    const moodTrend = this.calculateTrend(
      wellnessHistory.map(w => w.moodLabel === 'positive' ? 1 : (w.moodLabel === 'neutral' ? 0.5 : 0))
    );

    return {
      today: {
        sleep_duration: sleep.duration_minutes,
        sleep_efficiency: sleep.efficiency,
        mood_score: wellness.score,
        mood_label: wellness.mood_label,
        sentiment: wellness.sentiment_score,
      },
      baselines: {
        sleep: baselineSleep,
        efficiency: baselineEfficiency,
        mood: baselineMood,
      },
      scores: {
        sleep_consistency: sleepConsistency,
        circadian: circadianScore,
        sleep_debt: sleepDebt,
      },
      trends: {
        sleep: sleepTrend, // 'increasing' | 'decreasing' | 'stable'
        mood: moodTrend,
      },
      history: { sleep: sleepHistory, wellness: wellnessHistory },
    };
  }

  // ========================================
  // 3️⃣ PATTERN DETECTION (Rule-Based)
  // ========================================

  /**
   * Detect patterns and generate insights from features
   */
  async detectPatterns(features) {
    if (!features) return [];

    const insights = [];

    // Category 1: Sleep Duration Patterns
    insights.push(...this.detectSleepDurationPatterns(features));

    // Category 2: Sleep Efficiency Patterns
    insights.push(...this.detectSleepEfficiencyPatterns(features));

    // Category 3: Consistency Patterns
    insights.push(...this.detectConsistencyPatterns(features));

    // Category 4: Circadian Disruption
    insights.push(...this.detectCircadianPatterns(features));

    // Category 5: Sleep + Mood Correlation
    insights.push(...this.detectSleepMoodCorrelation(features));

    // Category 6: Trend-Based Insights
    insights.push(...this.detectTrendInsights(features));

    // Category 7: Anomalies
    insights.push(...this.detectAnomalies(features));

    return insights;
  }

  detectSleepDurationPatterns(features) {
    const insights = [];
    const today = features.today.sleep_duration;
    const baseline = features.baselines.sleep;

    // Rule: Sleep Deficit
    if (today < 6 * 60) {
      insights.push({
        type: 'sleep',
        category: 'sleep_deficit',
        severity: 'high',
        confidence: 0.85,
        observation: 'Your sleep has been below recommended levels.',
        cause: 'Less than 6 hours of sleep can impact cognitive performance and mood.',
        suggestion: 'Aim for at least 7 hours of sleep tonight to recover.',
      });
    }

    // Rule: Sleep Recovery
    if (today > baseline * 1.5) {
      insights.push({
        type: 'sleep',
        category: 'sleep_recovery',
        severity: 'medium',
        confidence: 0.75,
        observation: 'You seem to be catching up on sleep.',
        cause: 'Your body is recovering from previous sleep debt.',
        suggestion: 'Continue prioritizing sleep while your body recovers.',
      });
    }

    // Rule: Significantly Short Sleep
    if (today < baseline * 0.7) {
      insights.push({
        type: 'sleep',
        category: 'severe_sleep_deficit',
        severity: 'high',
        confidence: 0.9,
        observation: `Your sleep tonight was significantly shorter than your usual ${(baseline / 60).toFixed(1)}h.`,
        cause: `You got only ${(today / 60).toFixed(1)}h, which is 30% below your baseline.`,
        suggestion: 'This may affect your energy and mood tomorrow. Try to rest early tonight.',
      });
    }

    return insights;
  }

  detectSleepEfficiencyPatterns(features) {
    const insights = [];
    const efficiency = features.today.sleep_efficiency;

    // Rule: Poor Sleep Efficiency
    if (efficiency < 0.7) {
      insights.push({
        type: 'sleep',
        category: 'poor_efficiency',
        severity: 'medium',
        confidence: 0.8,
        observation: 'Your sleep efficiency was lower than ideal.',
        cause: `You were awake for ${(100 - efficiency * 100).toFixed(0)}% of your time in bed, suggesting restlessness.`,
        suggestion: 'Consider relaxation techniques before bed. Avoid screens 1 hour before sleep.',
      });
    }

    // Rule: Excellent Sleep Efficiency
    if (efficiency > 0.85) {
      insights.push({
        type: 'sleep',
        category: 'good_efficiency',
        severity: 'low',
        confidence: 0.7,
        observation: 'Your sleep quality was excellent.',
        cause: `${(efficiency * 100).toFixed(0)}% of your time in bed was quality sleep.`,
        suggestion: 'Keep up your current sleep habits.',
      });
    }

    return insights;
  }

  detectConsistencyPatterns(features) {
    const insights = [];
    const consistency = features.scores.sleep_consistency;

    // Rule: Irregular Sleep
    if (consistency < 60) {
      insights.push({
        type: 'sleep',
        category: 'irregular_schedule',
        severity: 'medium',
        confidence: 0.85,
        observation: 'Your sleep schedule has been inconsistent this week.',
        cause:
          'Variable sleep times disrupt your body\'s circadian rhythm, affecting mood and alertness.',
        suggestion:
          'Try maintaining the same bedtime and wake time for 5 consecutive days.',
      });
    }

    return insights;
  }

  detectCircadianPatterns(features) {
    const insights = [];
    const circadianScore = features.scores.circadian;

    // Rule: Circadian Disruption
    if (circadianScore < 50) {
      const startTime = features.history.sleep[0]?.sleep_start_time;
      const hour = startTime
        ? new Date(startTime).getHours()
        : 0;

      if (hour > 1 || hour < 22) {
        insights.push({
          type: 'sleep',
          category: 'circadian_disruption',
          severity: 'medium',
          confidence: 0.8,
          observation: `Your sleep timing has shifted to ${hour}:00, later than your usual pattern.`,
          cause:
            'Late sleep times can disrupt your daily energy levels and affect daytime alertness.',
          suggestion: 'Try sleeping 15 minutes earlier each day to reset your rhythm.',
        });
      }
    }

    return insights;
  }

  detectSleepMoodCorrelation(features) {
    const insights = [];
    const sleepEfficiency = features.today.sleep_efficiency;
    const moodLabel = features.today.mood_label;
    const sentiment = features.today.sentiment;

    // Rule: Poor Sleep Affecting Mood
    if (
      moodLabel === 'negative' &&
      sleepEfficiency < 0.7
    ) {
      insights.push({
        type: 'correlation',
        category: 'sleep_mood_link',
        severity: 'high',
        confidence: 0.85,
        observation: `You're feeling ${moodLabel}, and your sleep quality was poor.`,
        cause:
          'Poor sleep reduces emotional resilience and makes negative feelings more intense.',
        suggestion:
          'Prioritize good sleep tonight. Physical activity during the day can also help.',
      });
    }

    // Rule: Sleep Drop Causing Mood Drop
    const sleepTrend = features.trends.sleep;
    const moodTrend = features.trends.mood;

    if (sleepTrend === 'decreasing' && moodTrend === 'decreasing') {
      insights.push({
        type: 'correlation',
        category: 'trend_correlation',
        severity: 'high',
        confidence: 0.8,
        observation:
          'Both your sleep duration and mood have been declining over the past week.',
        cause:
          'Cumulative sleep loss compounds mood deterioration. This creates a downward spiral.',
        suggestion:
          'Break this pattern by improving sleep for 3 consecutive nights. This should lift your mood.',
      });
    }

    return insights;
  }

  detectTrendInsights(features) {
    const insights = [];
    const sleepTrend = features.trends.sleep;
    const baselineSleep = features.baselines.sleep;
    const todaySleep = features.today.sleep_duration;

    // Rule: Decreasing Sleep Trend
    if (sleepTrend === 'decreasing') {
      insights.push({
        type: 'trend',
        category: 'sleep_declining',
        severity: 'medium',
        confidence: 0.8,
        observation: 'Your sleep duration has been gradually declining this week.',
        cause: 'Progressive sleep reduction suggests increasing stress or lifestyle changes.',
        suggestion:
          'Identify what\'s causing less sleep (stress, caffeine, screen time) and address it.',
      });
    }

    // Rule: Increasing Sleep Trend
    if (sleepTrend === 'increasing' && todaySleep > baselineSleep) {
      insights.push({
        type: 'trend',
        category: 'sleep_improving',
        severity: 'low',
        confidence: 0.75,
        observation: 'Your sleep duration has been improving this week.',
        cause: 'Increased sleep suggests your body is prioritizing recovery.',
        suggestion: 'Maintain these improvements by protecting your sleep schedule.',
      });
    }

    return insights;
  }

  detectAnomalies(features) {
    const insights = [];
    const todaySleep = features.today.sleep_duration;
    const baselineSleep = features.baselines.sleep;

    // Rule: Major deviation (>30%)
    const deviation = Math.abs(todaySleep - baselineSleep) / baselineSleep;

    if (deviation > 0.3) {
      const direction = todaySleep > baselineSleep ? 'more' : 'less';
      const percentage = (deviation * 100).toFixed(0);

      insights.push({
        type: 'warning',
        category: 'anomaly',
        severity: todaySleep < baselineSleep ? 'high' : 'low',
        confidence: 0.9,
        observation: `You slept ${percentage}% ${direction} than your typical ${(baselineSleep / 60).toFixed(1)}h.`,
        cause: `Unusual sleep patterns often indicate stress, illness, or significant lifestyle changes.`,
        suggestion: todaySleep < baselineSleep
          ? 'If this continues, consider what might be causing the disruption.'
          : 'Monitor if this is a one-time event or a pattern shift.',
      });
    }

    return insights;
  }

  // ========================================
  // 4️⃣ SCORING SYSTEM
  // ========================================

  /**
   * Score and rank insights by impact
   */
  scoreInsights(insights) {
    const severityMap = { low: 0.3, medium: 0.7, high: 1.0 };

    return insights
      .map(insight => ({
        ...insight,
        impact_score: severityMap[insight.severity] * insight.confidence,
      }))
      .sort((a, b) => b.impact_score - a.impact_score);
  }

  // ========================================
  // 5️⃣ PRIORITY FILTER & COOLDOWN
  // ========================================

  /**
   * Filter insights by priority and apply cooldown
   */
  filterByPriority(scoredInsights) {
    const filtered = [];
    const now = Date.now();

    for (const insight of scoredInsights) {
      const key = `${insight.type}_${insight.category}`;
      const lastTime = this.lastInsightTimestamps[key] || 0;
      const timeSinceLastInsight = now - lastTime;

      // High severity insights bypass cooldown
      const shouldShow =
        insight.severity === 'high'
          ? true
          : timeSinceLastInsight > this.INSIGHT_COOLDOWN_MS;

      if (shouldShow) {
        filtered.push(insight);
        this.lastInsightTimestamps[key] = now;

        // Limit to 2 insights per generation
        if (filtered.length >= 2) break;
      }
    }

    return filtered;
  }

  // ========================================
  // 6️⃣ MAIN GENERATION PIPELINE
  // ========================================

  /**
   * Generate wellness insights (main entry point)
   */
  async generateInsights() {
    try {
      // Step 1: Gather inputs
      const inputs = await this.gatherDailyInputs();
      if (!inputs) return [];

      // Step 2: Compute features
      const features = await this.computeFeatures(inputs);
      if (!features) return [];

      // Step 3: Detect patterns
      const insights = await this.detectPatterns(features);

      // Step 4: Score insights
      const scoredInsights = this.scoreInsights(insights);

      // Step 5: Apply priority filter & cooldown
      const filteredInsights = this.filterByPriority(scoredInsights);

      return filteredInsights;
    } catch (error) {
      console.error('Insight generation error:', error);
      return [];
    }
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  calculateAverage(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  calculateConsistency(values) {
    if (!values || values.length < 2) return 100;

    const mean = this.calculateAverage(values);
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / mean) * 100;

    // Return consistency score (100 = perfect consistency, 0 = high variability)
    return Math.max(0, 100 - coefficientOfVariation);
  }

  calculateCircadianScore(sleepHistory) {
    if (!sleepHistory || sleepHistory.length === 0) return 50;

    let score = 100;

    // Check sleep start times consistency
    const startTimes = sleepHistory
      .filter(s => s.sleep_start_time)
      .map(s => new Date(s.sleep_start_time).getHours());

    if (startTimes.length > 0) {
      const variance = this.calculateConsistency(startTimes);
      score -= 50 * (1 - variance / 100); // Penalize inconsistent start times
    }

    // Check for late sleeps (after 1:30 AM)
    const lateSleePs = sleepHistory.filter(s => {
      const hour = new Date(s.sleep_start_time).getHours();
      return hour > 1 && hour < 6;
    }).length;

    score -= lateSleePs * 10; // Penalize late sleeps

    return Math.max(0, Math.min(100, score));
  }

  calculateTrend(values) {
    if (!values || values.length < 3) return 'stable';

    const recent = values.slice(0, 3);
    const older = values.slice(3, 6);

    const recentAvg = this.calculateAverage(recent);
    const olderAvg = this.calculateAverage(older);

    const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (changePercent > 5) return 'increasing';
    if (changePercent < -5) return 'decreasing';
    return 'stable';
  }
}

// Singleton export
const wellnessInsightEngine = new WellnessInsightEngine();
export default wellnessInsightEngine;
