/**
 * Wellness Score Service - DYNAMIC & REAL-TIME
 * 
 * Architecture:
 * ├─ STATIC Component: Sleep (from previous night)
 * ├─ DYNAMIC Components: Mood, Behavior, Activity (update in real-time)
 * ├─ Real-time Score: Updates as data changes throughout the day
 * ├─ Locked Score: Finalized at reset time (midnight) for daily analysis
 * └─ No-State Fallback: Placeholder when transitioning between days
 * 
 * Flow:
 * Day N Evening:
 *   - Calculate wellness with today's data
 *   - Score updates in real-time as mood/behavior/activity change
 *   - At midnight: Lock current day, start day N+1
 * 
 * Day N+1 Early Morning:
 *   - Sleep = Day N's sleep data (static)
 *   - Mood, Behavior, Activity = Fresh (0 data = neutral 50)
 *   - At reset if no sleep data yet: Show placeholder (80)
 *   - As data flows in: Score updates dynamically
 */

import localStorageService from './localStorageService';
import sleepTrackingService from './sleepTrackingService';
import appUsageLifecycleService from './appUsageLifecycleService';
import behavioralTrackingService from './behavioralTrackingService';

const WELLNESS_STORAGE_KEYS = {
  WELLNESS_CURRENT_SCORE: 'wellness_current_score',          // Real-time updating
  WELLNESS_LOCKED_SCORES: 'wellness_locked_scores_history',  // Final daily scores
  WELLNESS_LAST_RESET_DATE: 'wellness_last_reset_date',
};

class WellnessScoreService {
  constructor() {
    this.initialized = false;
    this.resetCheckInterval = null;
    this.lastCalculationTime = null;
    this.cacheTimeout = 60000; // Cache for 60 seconds to avoid excessive recalculation
  }

  async initialize() {
    try {
      console.log('🌟 WellnessScoreService: Initializing...');
      
      // Start automatic reset check at midnight
      this.startResetCheck();
      
      const today = new Date().toISOString().split('T')[0];
      const lastResetDate = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LAST_RESET_DATE,
        false
      );
      
      // If date changed, finalize yesterday's score and initialize today
      if (lastResetDate !== today) {
        await this.handleDailyReset(today);
      }
      
      this.initialized = true;
      console.log('✅ WellnessScoreService initialized');
    } catch (error) {
      console.error('WellnessScoreService initialization error:', error);
    }
  }

  /**
   * Handle daily reset at midnight:
   * 1. Finalize yesterday's score
   * 2. Clear current score
   * 3. Initialize today with fresh state
   */
  async handleDailyReset(today) {
    try {
      console.log(`\n🔄 Daily Reset at ${today}...`);
      
      // Get yesterday's date
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Get current (yesterday's) score and lock it
      const yesterdayScore = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_CURRENT_SCORE,
        false
      );
      
      if (yesterdayScore) {
        // Store yesterday's final score
        let lockedScores = await localStorageService.getItem(
          WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
          false
        ) || [];
        
        lockedScores = lockedScores.filter(s => s.date !== yesterdayStr);
        lockedScores.push({
          ...yesterdayScore,
          date: yesterdayStr,
          locked_at: new Date().toISOString(),
          is_final: true,
        });
        
        // Keep only last 90 days
        lockedScores = lockedScores.slice(-90);
        
        await localStorageService.setItem(
          WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
          lockedScores,
          false
        );
        
        console.log(`📌 Locked yesterday's score: ${yesterdayScore.final_score} for ${yesterdayStr}`);
      }
      
      // Clear current score to start fresh
      await localStorageService.removeItem(WELLNESS_STORAGE_KEYS.WELLNESS_CURRENT_SCORE);
      
      // Update reset marker
      await localStorageService.setItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LAST_RESET_DATE,
        today,
        false
      );
      
      console.log(`✅ Reset complete. Today: ${today}\n`);
    } catch (error) {
      console.error('Error handling daily reset:', error);
    }
  }

  /**
   * Start interval to check for midnight reset
   */
  startResetCheck() {
    if (this.resetCheckInterval) clearInterval(this.resetCheckInterval);
    
    this.resetCheckInterval = setInterval(async () => {
      const today = new Date().toISOString().split('T')[0];
      const lastReset = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LAST_RESET_DATE,
        false
      );
      
      if (lastReset !== today) {
        await this.handleDailyReset(today);
      }
    }, 60000); // Check every minute
  }

  cleanup() {
    if (this.resetCheckInterval) {
      clearInterval(this.resetCheckInterval);
      this.resetCheckInterval = null;
    }
  }

  // ========================================
  // REAL-TIME SCORE CALCULATION
  // (Updates dynamically as data changes)
  // ========================================

  /**
   * Get real-time wellness score for today
   * Called frequently from UI to show live updates
   * Does NOT store - only displays current state
   */
  async getRealTimeScore(dateStr = null) {
    try {
      const today = (dateStr || new Date().toISOString().split('T')[0]);
      
      // Avoid redundant calculations (cache for 60s)
      if (this.lastCalculationTime && 
          Date.now() - this.lastCalculationTime < this.cacheTimeout) {
        const cached = await localStorageService.getItem(
          WELLNESS_STORAGE_KEYS.WELLNESS_CURRENT_SCORE,
          false
        );
        if (cached) return cached;
      }
      
      console.log(`\n📊 Calculating REAL-TIME wellness for ${today}...`);
      
      // 1. Calculate all component scores in parallel
      const [sleepScore, moodScore, behaviorScore, activityScore] = await Promise.all([
        this.calculateSleepScore(today),              // Static (prev night)
        this.calculateMoodScore(today),               // Dynamic
        this.calculateBehaviorScore(today),           // Dynamic
        this.calculateActivityScore(today),           // Dynamic
      ]);
      
      console.log(`  🌙 Sleep: ${sleepScore}`);
      console.log(`  😊 Mood: ${moodScore}`);
      console.log(`  📱 Behavior: ${behaviorScore}`);
      console.log(`  🚶 Activity: ${activityScore}`);
      
      // 2. Calculate weighted composite
      const rawScore = Math.round(
        0.40 * sleepScore +
        0.35 * moodScore +
        0.20 * behaviorScore +
        0.05 * activityScore
      );
      
      // 3. Apply smoothing ONLY if previous score exists
      let finalScore = rawScore;
      let previousScore = null;
      
      try {
        // Get yesterday's LOCKED score (not current)
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const lockedScores = await localStorageService.getItem(
          WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
          false
        ) || [];
        const prevRecord = lockedScores.find(s => s.date === yesterdayStr);
        
        if (prevRecord) {
          previousScore = prevRecord.final_score;
          finalScore = this.applySmoothing(rawScore, previousScore);
          console.log(`  🔄 Applied smoothing: ${rawScore} + ${previousScore} = ${finalScore}`);
        } else {
          console.log(`  ⚠️  No previous score found, using raw score (no smoothing)`);
        }
      } catch (e) {
        console.log(`  ℹ️  Could not fetch previous score, skipping smoothing`);
      }
      
      // 4. Calculate trend
      const trend = await this.calculateTrend(today, finalScore);
      
      // 5. Detect anomalies
      const alerts = await this.detectAnomalies(today, finalScore, previousScore);
      
      // 6. Build response object
      const scoreRecord = {
        date: today,
        raw_score: rawScore,
        final_score: finalScore,
        previous_score: previousScore,
        is_locked: false, // Real-time score is never locked
        components: {
          sleep: { score: sleepScore },
          mood: { score: moodScore },
          behavior: { score: behaviorScore },
          activity: { score: activityScore },
        },
        trend,
        alerts,
        calculated_at: new Date().toISOString(),
        is_realtime: true,
      };
      
      // Cache current score
      await localStorageService.setItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_CURRENT_SCORE,
        scoreRecord,
        false
      );
      this.lastCalculationTime = Date.now();
      
      console.log(`✅ Real-time score: ${finalScore} (${this.getScoreLabel(finalScore)})\n`);
      return scoreRecord;
      
    } catch (error) {
      console.error('Real-time score calculation error:', error);
      return this.getPlaceholderScore();
    }
  }

  /**
   * Get placeholder score for no-state scenarios
   * Used when loading during sleep window before data arrives
   */
  getPlaceholderScore(dateStr = null) {
    const today = (dateStr || new Date().toISOString().split('T')[0]);
    
    return {
      date: today,
      final_score: 80, // Neutral placeholder
      is_placeholder: true,
      components: {
        sleep: { score: 50 },
        mood: { score: 50 },
        behavior: { score: 50 },
        activity: { score: 50 },
      },
      trend: { direction: 'stable', strength: 0 },
      alerts: [],
      message: 'Wellness score is loading...',
    };
  }

  /**
   * Get locked final score for a specific past date
   */
  async getLockedScore(dateStr) {
    try {
      const lockedScores = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
        false
      ) || [];
      
      const record = lockedScores.find(s => s.date === dateStr);
      if (record) {
        return {
          ...record,
          is_locked: true,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting locked score:', error);
      return null;
    }
  }

  /**
   * Get score for today (real-time if not locked, locked if past reset)
   */
  async getTodayScore() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if today's score is already locked (shouldn't happen on same day)
      const locked = await this.getLockedScore(today);
      if (locked) {
        return locked;
      }
      
      // Return real-time score
      return await this.getRealTimeScore(today);
    } catch (error) {
      console.error('Error getting today score:', error);
      return this.getPlaceholderScore();
    }
  }

  // ========================================
  // COMPONENT SCORING - DYNAMIC & STATIC
  // ========================================

  /**
   * SLEEP SCORE - STATIC
   * Uses previous night's sleep data (sleep is recorded after waking)
   */
  async calculateSleepScore(dateStr) {
    try {
      const sleepData = await sleepTrackingService.getSleepSummaries(1, new Date(dateStr));
      
      if (!sleepData || sleepData.length === 0) {
        console.log('    ⚠️  No sleep data');
        return 50;
      }

      const sleep = sleepData[0];
      const durationHours = (sleep.total_sleep_minutes || 0) / 60;
      const efficiency = sleep.sleep_efficiency * 100 || 0;

      const durationScore = this.calculateDurationScore(durationHours);
      const efficiencyScore = this.calculateEfficiencyScore(efficiency);
      const consistencyScore = sleep.consistency_score || 70;
      const circadianScore = sleep.circadian_score || 75;

      const sleepScore = Math.round(
        0.35 * durationScore +
        0.25 * efficiencyScore +
        0.20 * consistencyScore +
        0.20 * circadianScore
      );

      return Math.min(100, Math.max(0, sleepScore));
    } catch (error) {
      console.error('Sleep score calculation error:', error);
      return 50;
    }
  }

  /**
   * MOOD SCORE - DYNAMIC
   * Updates as user adds journal entries throughout the day
   */
  async calculateMoodScore(dateStr) {
    try {
      let journalEntries = [];
      try {
        journalEntries = await localStorageService.getJournalEntries();
      } catch (e) {
        console.log('    ⚠️  Could not read journal entries');
        journalEntries = [];
      }
      
      // Filter entries for today
      const dateEntries = (journalEntries || []).filter(entry => {
        try {
          if (!entry || !entry.date) return false;
          const entryDate = new Date(entry.date);
          if (isNaN(entryDate.getTime())) return false;
          const entryDateStr = entryDate.toISOString().split('T')[0];
          return entryDateStr === dateStr;
        } catch (e) {
          return false;
        }
      });

      if (dateEntries.length === 0) {
        console.log('    ℹ️  No journal entries yet (neutral)');
        return 50; // Neutral when no data
      }

      // Calculate mood from entries
      let totalSentiment = 0;
      let totalRating = 0;

      dateEntries.forEach(entry => {
        totalSentiment += (entry.sentiment || 0);
        totalRating += (entry.mood_rating || entry.moodRating || 5);
      });

      const avgSentiment = totalSentiment / dateEntries.length;
      const avgRating = totalRating / dateEntries.length;

      const sentimentScore = Math.round(((avgSentiment + 1) / 2) * 100);
      const ratingScore = Math.round((avgRating / 10) * 100);
      const moodScore = Math.round(0.60 * sentimentScore + 0.40 * ratingScore);

      console.log(`    📝 ${dateEntries.length} entries, sentiment: ${avgSentiment.toFixed(2)}`);
      return Math.min(100, Math.max(0, moodScore));
    } catch (error) {
      console.error('Mood score calculation error:', error);
      return 50;
    }
  }

  /**
   * BEHAVIOR SCORE - DYNAMIC
   * Updates in real-time as screen usage data is collected
   * Uses same data structure as Tracker.js
   */
  async calculateBehaviorScore(dateStr) {
    try {
      // ✅ Use same data source as Tracker.js
      const usageStats = await behavioralTrackingService.getDailyUsageStats();
      
      if (!usageStats) {
        console.log('    ℹ️  No usage data yet (neutral)');
        return 50;
      }

      // Calculate total screen time from app usage
      const appUsage = usageStats.appUsage || [];
      const screenTimeMinutes = appUsage.reduce(
        (sum, app) => sum + (app.durationMinutes || 0),
        0
      );

      if (screenTimeMinutes === undefined || screenTimeMinutes === null || screenTimeMinutes === 0) {
        console.log('    ℹ️  Screen time not tracked yet (neutral)');
        return 50;
      }

      const screenTimeHours = screenTimeMinutes / 60;
      const screenScore = this.calculateScreenTimeScore(screenTimeHours);

      // Penalties
      let penalties = 0;
      
      // Night usage penalty
      const nightUsageMinutes = usageStats.night_usage_minutes || 0;
      if (nightUsageMinutes > 90) {
        penalties -= 15;
      } else if (nightUsageMinutes > 60) {
        penalties -= 8;
      }
      
      // Pickup frequency penalty
      const pickupCount = usageStats.pickupCount || 0;
      const baselinePickups = 40;
      if (pickupCount > baselinePickups * 1.5) {
        penalties -= 15;
      } else if (pickupCount > baselinePickups * 1.3) {
        penalties -= 8;
      }

      const behaviorScore = Math.max(0, Math.min(100, screenScore + penalties));
      
      console.log(`    ⏱️  ${screenTimeHours.toFixed(1)}h usage, ${pickupCount} pickups`);
      return behaviorScore;
    } catch (error) {
      console.error('Behavior score calculation error:', error);
      return 50;
    }
  }

  /**
   * ACTIVITY SCORE - DYNAMIC
   * Updates as step count changes throughout the day
   */
  async calculateActivityScore(dateStr) {
    try {
      const activityData = await this.getActivityData(dateStr);

      if (!activityData || activityData.steps === undefined) {
        console.log('    ℹ️  No activity data yet (neutral)');
        return 50; // Neutral, not penalizing
      }

      const dailyGoal = activityData.goal || 10000;
      const stepsAchieved = activityData.steps || 0;
      const achievement = (stepsAchieved / dailyGoal) * 100;

      let activityScore = 50;
      if (achievement >= 100) activityScore = 100;
      else if (achievement >= 80) activityScore = 80;
      else if (achievement >= 60) activityScore = 60;
      else activityScore = 40;

      console.log(`    🚶 ${stepsAchieved}/${dailyGoal} steps (${achievement.toFixed(0)}%)`);
      return activityScore;
    } catch (error) {
      console.error('Activity score calculation error:', error);
      return 50;
    }
  }

  async getActivityData(dateStr) {
    try {
      return await localStorageService.getActivityData(dateStr);
    } catch (error) {
      return null;
    }
  }

  // ========================================
  // UTILITY CALCULATIONS
  // ========================================

  calculateDurationScore(hours) {
    if (hours >= 7 && hours <= 9) return 100;
    if ((hours >= 6 && hours < 7) || (hours > 9 && hours <= 10)) return 80;
    if ((hours >= 5 && hours < 6) || (hours > 10 && hours <= 11)) return 60;
    if (hours < 5 || hours > 11) return 30;
    return 80;
  }

  calculateEfficiencyScore(efficiency) {
    if (efficiency > 90) return 100;
    if (efficiency >= 80) return 80;
    if (efficiency >= 70) return 60;
    return 40;
  }

  calculateScreenTimeScore(hours) {
    if (hours < 6) return 100;
    if (hours < 8) return 80;
    if (hours < 10) return 60;
    return 40;
  }

  applySmoothing(todayScore, yesterdayScore) {
    if (!yesterdayScore) return todayScore;
    // 70% today + 30% yesterday
    return Math.round(0.7 * todayScore + 0.3 * yesterdayScore);
  }

  // ========================================
  // TREND & ANOMALY ANALYSIS
  // ========================================

  async calculateTrend(dateStr, currentScore) {
    try {
      const lockedScores = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
        false
      ) || [];

      if (lockedScores.length < 3) {
        return { direction: 'insufficient_data', strength: 0 };
      }

      const scores = lockedScores
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(s => s.final_score);

      const recentDays = scores.slice(-10);
      const previousDays = scores.slice(-20, -10);

      if (previousDays.length === 0) {
        return { direction: 'stable', strength: 0 };
      }

      const recentAvg = recentDays.reduce((a, b) => a + b, 0) / recentDays.length;
      const previousAvg = previousDays.reduce((a, b) => a + b, 0) / previousDays.length;
      const difference = recentAvg - previousAvg;

      let direction = 'stable';
      if (difference > 5) direction = 'improving';
      else if (difference < -5) direction = 'declining';

      return {
        direction,
        strength: Math.abs(Math.round(difference)),
      };
    } catch (error) {
      console.error('Trend analysis error:', error);
      return { direction: 'stable', strength: 0 };
    }
  }

  async detectAnomalies(dateStr, currentScore, previousScore) {
    const alerts = [];

    if (currentScore < 40) {
      alerts.push({
        type: 'critical',
        severity: 'high',
        message: 'Wellness score is critical. Please prioritize rest.',
      });
    }

    if (previousScore && (previousScore - currentScore) > 15) {
      alerts.push({
        type: 'sharp_drop',
        severity: 'medium',
        message: `Significant wellness drop detected (${previousScore} → ${currentScore}).`,
      });
    }

    return alerts;
  }

  getScoreLabel(score) {
    if (score >= 85) return '🟢 Excellent';
    if (score >= 70) return '🟡 Good';
    if (score >= 55) return '🟠 Moderate';
    if (score >= 40) return '🔴 Low';
    return '🚨 Critical';
  }

  // ========================================
  // LEGACY COMPATIBILITY METHODS
  // ========================================

  async getWeeklyScores() {
    try {
      const lockedScores = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
        false
      ) || [];

      return lockedScores
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-7)
        .map(record => ({
          date: record.date,
          score: record.final_score,
        }));
    } catch (error) {
      console.error('Error getting weekly scores:', error);
      return [];
    }
  }

  async getScoreHistory(days = 30) {
    try {
      const lockedScores = await localStorageService.getItem(
        WELLNESS_STORAGE_KEYS.WELLNESS_LOCKED_SCORES,
        false
      ) || [];

      return lockedScores
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-days)
        .map(record => ({
          date: record.date,
          score: record.final_score,
        }));
    } catch (error) {
      console.error('Error getting score history:', error);
      return [];
    }
  }
}

export default new WellnessScoreService();
