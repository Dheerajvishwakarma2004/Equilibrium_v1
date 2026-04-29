// File: frontend/services/devModeService.js
// ============================================================
// DEV MODE SERVICE
// - Passphrase protected (SHA-256 hashed, never stored in plain)
// - Memory-only session (no persistence across app restarts)
// - Auto-expires after SESSION_DURATION_MS
// - All dev capabilities funneled through this singleton
// ============================================================

import CryptoJS from "crypto-js";

// ⚠️ CHANGE THIS: sha256 of your chosen passphrase
// To generate: CryptoJS.SHA256("yourpassphrase").toString()
// Current passphrase hashed below → "dev2026"
// Run in console: require('crypto-js').SHA256("dev2026").toString()
const DEV_PASSPHRASE_HASH = "7691a81c8ebd9e37886813fae57afd0bea83e1d218fb89b1ea8cc90326772322";
// ↑ Replace this with: CryptoJS.SHA256("your_actual_secret").toString()

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes auto-expire
const ACTIVATION_TAPS = 7; // Taps needed on the hidden zone

class DevModeService {
  constructor() {
    // Session state - memory only, never persisted
    this._isActive = false;
    this._sessionStartTime = null;
    this._sessionTimer = null;

    // Tap accumulator for activation gesture
    this._tapCount = 0;
    this._tapResetTimer = null;
    this._TAP_WINDOW_MS = 3000; // Taps must happen within 3s

    // Dev overrides - apply to runtime only
    this._overrides = {
      wellnessScore: null,     // null = use real score
      forceDate: null,         // null = use today
    };

    // Listeners for UI to react to mode changes
    this._listeners = new Set();
  }

  // ============================================================
  // ACTIVATION GESTURE — tap counter
  // Call this on each tap of your hidden zone (wellness score circle)
  // Returns: { shouldPrompt: boolean, tapsRemaining: number }
  // ============================================================
  registerTap() {
    this._tapCount += 1;

    // Reset tap counter after window expires
    clearTimeout(this._tapResetTimer);
    this._tapResetTimer = setTimeout(() => {
      this._tapCount = 0;
    }, this._TAP_WINDOW_MS);

    if (this._tapCount >= ACTIVATION_TAPS) {
      this._tapCount = 0;
      clearTimeout(this._tapResetTimer);
      return { shouldPrompt: true, tapsRemaining: 0 };
    }

    const remaining = ACTIVATION_TAPS - this._tapCount;
    // Only give feedback after 3rd tap to not reveal the mechanic too early
    return {
      shouldPrompt: false,
      tapsRemaining: this._tapCount >= 3 ? remaining : null,
    };
  }

  // ============================================================
  // AUTH — verify passphrase and start session
  // Returns: { success: boolean, error?: string }
  // ============================================================
  async authenticate(passphrase) {
    if (!passphrase || typeof passphrase !== "string") {
      return { success: false, error: "Invalid input" };
    }

    const inputHash = CryptoJS.SHA256(passphrase.trim()).toString();

    if (inputHash !== DEV_PASSPHRASE_HASH) {
      // Artificial delay to prevent brute force
      await new Promise((r) => setTimeout(r, 800));
      return { success: false, error: "Incorrect passphrase" };
    }

    this._startSession();
    return { success: true };
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================
  _startSession() {
    this._isActive = true;
    this._sessionStartTime = Date.now();

    // Auto-expire
    clearTimeout(this._sessionTimer);
    this._sessionTimer = setTimeout(() => {
      this.deactivate("Session expired after 30 minutes");
    }, SESSION_DURATION_MS);

    this._notifyListeners();
    console.log("[DEV MODE] Session started");
  }

  deactivate(reason = "Manual deactivation") {
    this._isActive = false;
    this._sessionStartTime = null;
    this._overrides = { wellnessScore: null, forceDate: null };
    clearTimeout(this._sessionTimer);
    this._notifyListeners();
    console.log(`[DEV MODE] Deactivated: ${reason}`);
  }

  get isActive() {
    if (!this._isActive) return false;
    // Guard: double-check expiry
    if (Date.now() - this._sessionStartTime > SESSION_DURATION_MS) {
      this.deactivate("Session expired (lazy check)");
      return false;
    }
    return true;
  }

  get sessionTimeRemainingMs() {
    if (!this._isActive) return 0;
    return Math.max(0, SESSION_DURATION_MS - (Date.now() - this._sessionStartTime));
  }

  get sessionTimeRemainingLabel() {
    const ms = this.sessionTimeRemainingMs;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // ============================================================
  // LISTENERS — for UI updates
  // ============================================================
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notifyListeners() {
    this._listeners.forEach((fn) => fn(this._isActive));
  }

  // ============================================================
  // DEV CAPABILITIES
  // All methods guard-check isActive first
  // ============================================================

  /**
   * Override the displayed wellness score (UI only, not persisted)
   * @param {number|null} score - 0-100, or null to reset
   */
  setWellnessScoreOverride(score) {
    this._requireActive();
    if (score !== null && (score < 0 || score > 100)) {
      throw new Error("Score must be 0-100");
    }
    this._overrides.wellnessScore = score;
  }

  get wellnessScoreOverride() {
    return this.isActive ? this._overrides.wellnessScore : null;
  }

  /**
   * Set a forced date for journal backdating
   * @param {string|null} dateStr - "YYYY-MM-DD" or null to reset
   */
  setForceDate(dateStr) {
    this._requireActive();
    if (dateStr !== null) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) throw new Error("Invalid date format");
      if (d > new Date()) throw new Error("Cannot force a future date");
    }
    this._overrides.forceDate = dateStr;
  }

  get forcedDate() {
    return this.isActive ? this._overrides.forceDate : null;
  }

  /**
   * Get effective "today" — respects forceDate override
   */
  getEffectiveDate() {
    return this.forcedDate || new Date().toISOString().split("T")[0];
  }

  /**
   * Generate synthetic wellness data for a past date (for UI testing)
   * Returns a mock wellness record — not persisted to storage
   */
  generateMockWellnessRecord(dateStr, overrides = {}) {
    this._requireActive();
    const base = {
      date: dateStr,
      wellnessScore: Math.floor(50 + Math.random() * 50),
      sleepHours: 5 + Math.random() * 4,
      moodLabel: ["positive", "neutral", "negative"][Math.floor(Math.random() * 3)],
      sentimentScore: parseFloat((Math.random()).toFixed(3)),
      anomalyFlag: Math.random() > 0.8,
      screenTimeMinutes: Math.floor(60 + Math.random() * 300),
      _devGenerated: true,
    };
    return { ...base, ...overrides };
  }

  /**
   * Returns debug info about the AI scoring for an entry
   */
  getAIDebugInfo(entry) {
    this._requireActive();
    if (!entry) return null;
    return {
      sentiment_score: entry.sentiment_score ?? "N/A",
      mood_label: entry.mood_label ?? "N/A",
      anomaly_flag: entry.anomaly_flag ?? false,
      wellness_contribution: entry.wellness_contribution ?? "N/A",
      word_count: entry.content?.split(" ").length ?? 0,
      char_count: entry.content?.length ?? 0,
      processed_at: entry.processed_at ?? entry.timestamp ?? "unknown",
      model_version: entry.model_version ?? "v1",
      _note: "Dev mode — raw AI output",
    };
  }

  // ========================================
  // ✅ NEW: SLEEP ANALYSIS (Dev Mode)
  // ========================================

  /**
   * ✅ REFACTORED: Get detailed analysis of all nightly sleep records (returns data, no console)
   * Returns structured object with individual records and statistics
   */
  async getSleepAnalysisData() {
    this._requireActive();
    try {
      const localStorageService = require('./localStorageService').default;

      // Get all nightly summaries
      const allSummaries = await localStorageService.getItem('sleep_nightly_summaries') || {};
      const sortedDates = Object.keys(allSummaries).sort().reverse();

      // Calculate statistics
      let totalSleep = 0, highestEfficiency = 0, lowestEfficiency = 100;
      const napOnlyCount = sortedDates.filter(date => allSummaries[date].nap_only_day).length;

      const records = sortedDates.map((date, index) => {
        const record = allSummaries[date];
        const source = record.sleep_source === 'manual' ? '📌 Manual' : '📱 Auto';
        
        totalSleep += record.total_sleep_minutes || 0;
        if (record.sleep_efficiency) {
          highestEfficiency = Math.max(highestEfficiency, record.sleep_efficiency);
          lowestEfficiency = Math.min(lowestEfficiency, record.sleep_efficiency);
        }

        return {
          index: index + 1,
          total: sortedDates.length,
          date,
          isNapOnly: record.nap_only_day || false,
          source,
          totalSleepMinutes: record.total_sleep_minutes || 0,
          totalSleepHours: ((record.total_sleep_minutes || 0) / 60).toFixed(1),
          deepSleep: record.deep_sleep_minutes || 0,
          lightSleep: record.light_sleep_minutes || 0,
          wake: record.wake_minutes || 0,
          efficiency: ((record.sleep_efficiency || 0) * 100).toFixed(1),
          confidence: ((record.confidence_score || 0) * 100).toFixed(1),
          napSessions: record.nap_sessions || [],
          sleepStart: record.sleep_start_time,
          sleepEnd: record.sleep_end_time,
        };
      });

      // Storage tiers
      const weeklyAggs = await localStorageService.getItem('sleep_weekly_aggregates') || {};
      const monthlyAggs = await localStorageService.getItem('sleep_monthly_aggregates') || {};
      const yearlyArchive = await localStorageService.getItem('sleep_yearly_archive') || {};

      return {
        totalRecords: sortedDates.length,
        dateRange: {
          oldest: sortedDates[sortedDates.length - 1],
          newest: sortedDates[0],
        },
        records,
        statistics: {
          averageSleepMinutes: (totalSleep / sortedDates.length).toFixed(1),
          averageSleepHours: (totalSleep / sortedDates.length / 60).toFixed(2),
          highestEfficiency: (highestEfficiency * 100).toFixed(1),
          lowestEfficiency: (lowestEfficiency * 100).toFixed(1),
          napOnlyDays: napOnlyCount,
        },
        storageTiers: {
          nightly: sortedDates.length,
          weeklyAggregates: Object.keys(weeklyAggs).length,
          monthlyAggregates: Object.keys(monthlyAggs).length,
          yearlyArchive: Object.keys(yearlyArchive).length,
        },
      };
    } catch (error) {
      console.error('Sleep analysis error:', error);
      throw error;
    }
  }

  /**
   * ✅ REFACTORED: Get storage breakdown with size estimates (returns data, no console)
   */
  async getStorageBreakdownData() {
    this._requireActive();
    try {
      const localStorageService = require('./localStorageService').default;

      const nightly = await localStorageService.getItem('sleep_nightly_summaries') || {};
      const weekly = await localStorageService.getItem('sleep_weekly_aggregates') || {};
      const monthly = await localStorageService.getItem('sleep_monthly_aggregates') || {};
      const yearly = await localStorageService.getItem('sleep_yearly_archive') || {};
      const journal = await localStorageService.getItem('journal_entries') || {};
      const wellness = await localStorageService.getItem('wellness_data') || {};
      const activity = await localStorageService.getItem('activity_data') || {};

      // Rough size estimation (in KB)
      const estimateSize = (obj) => {
        const json = JSON.stringify(obj);
        return (json.length / 1024).toFixed(2);
      };

      const nightlySize = estimateSize(nightly);
      const weeklySize = estimateSize(weekly);
      const monthlySize = estimateSize(monthly);
      const yearlySize = estimateSize(yearly);
      const totalSleepSize = (parseFloat(nightlySize) + parseFloat(weeklySize) + parseFloat(monthlySize) + parseFloat(yearlySize)).toFixed(2);

      return {
        sleepData: {
          nightly: {
            records: Object.keys(nightly).length,
            sizeKB: nightlySize,
          },
          weekly: {
            records: Object.keys(weekly).length,
            sizeKB: weeklySize,
          },
          monthly: {
            records: Object.keys(monthly).length,
            sizeKB: monthlySize,
          },
          yearly: {
            records: Object.keys(yearly).length,
            sizeKB: yearlySize,
          },
          totalSizeKB: totalSleepSize,
        },
        otherData: {
          journal: {
            sizeKB: estimateSize(journal),
          },
          wellness: {
            sizeKB: estimateSize(wellness),
          },
          activity: {
            sizeKB: estimateSize(activity),
          },
        },
      };
    } catch (error) {
      console.error('Storage breakdown error:', error);
      throw error;
    }
  }

  /**
   * Print detailed analysis of all nightly sleep records to console
   * Shows individual record data + statistics
   */
  async printSleepAnalysisData() {
    this._requireActive();
    try {
      const data = await this.getSleepAnalysisData();
      
      console.log('\n🔍 ═══════════════════════════════════════════════════════════');
      console.log('   SLEEP ANALYSIS - DEV MODE');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log(`📊 Total Nightly Records: ${data.totalRecords}`);
      console.log(`📅 Date Range: ${data.dateRange.oldest} to ${data.dateRange.newest}\n`);

      console.log('📝 DETAILED RECORDS:');
      console.log('─────────────────────────────────────────────────────────────');
      
      data.records.forEach((record) => {
        const isNapOnly = record.isNapOnly ? ' (NAP ONLY)' : '';
        console.log(`\n[${record.index}/${record.total}] ${record.date}${isNapOnly}`);
        console.log(`    Source: ${record.source}`);
        console.log(`    Sleep: ${record.totalSleepMinutes} min (${record.totalSleepHours}h)`);
        console.log(`    Deep: ${record.deepSleep}m | Light: ${record.lightSleep}m | Wake: ${record.wake}m`);
        console.log(`    Efficiency: ${record.efficiency}% | Confidence: ${record.confidence}%`);
        
        if (record.napSessions && record.napSessions.length > 0) {
          console.log(`    Naps: ${record.napSessions.length} session(s)`);
          record.napSessions.forEach((nap, napIdx) => {
            console.log(`      └─ Nap ${napIdx + 1}: ${nap.duration_minutes}m`);
          });
        }
        
        console.log(`    Timestamps: ${record.sleepStart} → ${record.sleepEnd}`);
      });

      console.log('\n─────────────────────────────────────────────────────────────');
      console.log('📈 STATISTICS:');
      console.log(`    Average Sleep: ${data.statistics.averageSleepMinutes} min (${data.statistics.averageSleepHours}h)`);
      console.log(`    Highest Efficiency: ${data.statistics.highestEfficiency}%`);
      console.log(`    Lowest Efficiency: ${data.statistics.lowestEfficiency}%`);
      console.log(`    Nap-Only Days: ${data.statistics.napOnlyDays}`);
      
      console.log('\n📦 STORAGE TIERS:');
      console.log(`    Nightly: ${data.storageTiers.nightly} records`);
      console.log(`    Weekly Aggregates: ${data.storageTiers.weeklyAggregates} records`);
      console.log(`    Monthly Aggregates: ${data.storageTiers.monthlyAggregates} records`);
      console.log(`    Yearly Archive: ${data.storageTiers.yearlyArchive} records`);

      console.log('═══════════════════════════════════════════════════════════\n');
    } catch (error) {
      console.error('Sleep analysis error:', error);
    }
  }

  /**
   * Print storage breakdown with size estimates to console
   */
  async printStorageBreakdown() {
    this._requireActive();
    try {
      const data = await this.getStorageBreakdownData();
      
      console.log('\n📊 ═══════════════════════════════════════════════════════════');
      console.log('   STORAGE BREAKDOWN - DEV MODE');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('💾 SLEEP DATA SIZE ESTIMATES:');
      console.log(`    Nightly: ${data.sleepData.nightly.records} records | ${data.sleepData.nightly.sizeKB} KB`);
      console.log(`    Weekly: ${data.sleepData.weekly.records} records | ${data.sleepData.weekly.sizeKB} KB`);
      console.log(`    Monthly: ${data.sleepData.monthly.records} records | ${data.sleepData.monthly.sizeKB} KB`);
      console.log(`    Yearly: ${data.sleepData.yearly.records} records | ${data.sleepData.yearly.sizeKB} KB`);
      console.log(`    ─────────────────────────`);
      console.log(`    TOTAL: ${data.sleepData.totalSizeKB} KB`);

      console.log('\n💾 OTHER DATA SIZE ESTIMATES:');
      console.log(`    Journal Entries: ${data.otherData.journal.sizeKB} KB`);
      console.log(`    Wellness Data: ${data.otherData.wellness.sizeKB} KB`);
      console.log(`    Activity Data: ${data.otherData.activity.sizeKB} KB`);

      console.log('═══════════════════════════════════════════════════════════\n');
    } catch (error) {
      console.error('Storage breakdown error:', error);
    }
  }

  // ========================================
  // ✅ PHASE 1 TESTING - Aggregation Service
  // ========================================

  /**
   * Generate 30 days of realistic sample data for Phase 1 testing
   * Creates natural gaps in data (some days missing sleep/journal/activity)
   * Data structures match localStorageService conventions
   */
  async generatePhase1TestData() {
    this._requireActive();
    try {
      const localStorageService = require('./localStorageService').default;
      const now = new Date();
      
      // Helper: Get date string YYYY-MM-DD
      const getDateStr = (daysAgo) => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
      };

      // Helper: Generate realistic sleep data (simulate some missing days)
      const generateSleepData = (daysAgo) => {
        // 80% chance of having sleep data (20% missing)
        if (Math.random() > 0.8) return null;

        const baseHours = 6 + Math.random() * 2; // 6-8 hours
        const totalMinutes = Math.floor(baseHours * 60);
        const deepPercent = 0.15 + Math.random() * 0.15; // 15-30%
        const lightPercent = 0.6 + Math.random() * 0.2; // 60-80%
        
        return {
          total_sleep_minutes: totalMinutes,
          deep_sleep_minutes: Math.floor(totalMinutes * deepPercent),
          light_sleep_minutes: Math.floor(totalMinutes * lightPercent),
          wake_minutes: Math.floor(totalMinutes * (1 - deepPercent - lightPercent)),
          sleep_efficiency: 0.75 + Math.random() * 0.2, // 0.75-0.95
          confidence_score: 0.8 + Math.random() * 0.2, // 0.8-1.0
          nap_only_day: false,
          nap_sessions: [],
          sleep_source: Math.random() > 0.7 ? 'manual' : 'auto',
          sleep_start_time: `${getDateStr(daysAgo)}T22:30:00`,
          sleep_end_time: `${getDateStr(daysAgo - 1)}T06:45:00`,
        };
      };

      // Helper: Generate realistic journal entries (simulate 3-5 per day, 70% days have journal)
      const generateJournalEntries = (daysAgo) => {
        // 30% chance of no journal entry that day
        if (Math.random() > 0.7) return [];

        const date = getDateStr(daysAgo);
        const entryCount = 1 + Math.floor(Math.random() * 3); // 1-4 entries
        const entries = [];
        
        for (let i = 0; i < entryCount; i++) {
          const moodLabels = ['positive', 'neutral', 'negative', 'anxious', 'calm', 'energized'];
          const sentiments = ['happy', 'content', 'neutral', 'stressed', 'sad', 'focused'];
          
          entries.push({
            date,
            timestamp: `${date}T${10 + i * 6}:${Math.floor(Math.random() * 60)}:00`,
            mood_label: moodLabels[Math.floor(Math.random() * moodLabels.length)],
            mood_score: Math.floor(30 + Math.random() * 70), // 30-100
            sentiment_score: (Math.random()).toFixed(2),
            sentiment_label: sentiments[Math.floor(Math.random() * sentiments.length)],
            content: `Sample journal entry for ${date}. Entry ${i + 1}. This is test data generated for Phase 1 verification.`,
            text: `Sample journal entry for ${date}. Entry ${i + 1}. This is test data generated for Phase 1 verification.`,
            wellness_contribution: Math.floor(10 + Math.random() * 40), // 10-50
            anomaly_flag: Math.random() > 0.95, // 5% anomaly rate
            processed_at: new Date().toISOString(),
            model_version: 'v1',
          });
        }
        return entries;
      };

      // Helper: Generate activity data (simulate 60% days have activity)
      const generateActivityData = (daysAgo) => {
        if (Math.random() > 0.6) return null;

        return {
          date: getDateStr(daysAgo),
          timestamp: `${getDateStr(daysAgo)}T20:00:00`,
          screen_time_minutes: 60 + Math.floor(Math.random() * 300), // 60-360 mins
          night_screen_minutes: Math.floor(Math.random() * 60), // 0-60 mins
          steps: 2000 + Math.floor(Math.random() * 13000), // 2000-15000 steps
          active_minutes: Math.floor(Math.random() * 60), // 0-60 mins
        };
      };

      // Build 30 days of data
      const sleepData = {};
      const journalData = {};
      const activityData = {};

      for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
        const dateStr = getDateStr(daysAgo);
        
        const sleepEntry = generateSleepData(daysAgo);
        if (sleepEntry) {
          sleepData[dateStr] = sleepEntry;
        }

        const journalEntries = generateJournalEntries(daysAgo);
        if (journalEntries.length > 0) {
          journalData[dateStr] = journalEntries;
        }

        const activityEntry = generateActivityData(daysAgo);
        if (activityEntry) {
          activityData[dateStr] = activityEntry;
        }
      }

      // Store test data in temporary keys so we can reset easily
      await localStorageService.setItem('_test_sleep_nightly_summaries', sleepData);
      await localStorageService.setItem('_test_daily_journals', journalData);
      await localStorageService.setItem('_test_activity_data', activityData);

      this._phase1TestData = { sleepData, journalData, activityData };
      this._phase1TestResults = null;

      return {
        success: true,
        message: 'Generated 30 days of test data',
        stats: {
          sleepDays: Object.keys(sleepData).length,
          journalDays: Object.keys(journalData).length,
          activityDays: Object.keys(activityData).length,
          totalDays: 30,
          completeness: {
            sleep: ((Object.keys(sleepData).length / 30) * 100).toFixed(0),
            journal: ((Object.keys(journalData).length / 30) * 100).toFixed(0),
            activity: ((Object.keys(activityData).length / 30) * 100).toFixed(0),
          },
        },
      };
    } catch (error) {
      console.error('Phase 1 test data generation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run Phase 1 aggregation tests using generated test data
   * Tests the dataAggregationService against 7/14/30-day windows
   */
  async runPhase1Tests() {
    this._requireActive();
    try {
      if (!this._phase1TestData) {
        throw new Error('No test data generated. Run generatePhase1TestData() first.');
      }

      const dataAggregationService = require('./dataAggregationService').default;
      const localStorageService = require('./localStorageService').default;
      const behavioralTrackingService = require('./behavioralTrackingService').default;

      // Build sleep summaries array from test data
      const sleepSummaries = [];
      Object.entries(this._phase1TestData.sleepData).forEach(([date, data]) => {
        sleepSummaries.push({ date, ...data });
      });
      sleepSummaries.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Build journal entries array from test data
      const journalEntries = [];
      Object.entries(this._phase1TestData.journalData).forEach(([date, entries]) => {
        journalEntries.push(...entries);
      });

      // Build activity data array from test data
      const activityData = [];
      Object.entries(this._phase1TestData.activityData).forEach(([date, data]) => {
        activityData.push({ date, ...data });
      });

      // Save original methods/state
      const originalGetSleepSummaries = localStorageService.getSleepSummaries;
      const originalGetSleepSummary = localStorageService.getSleepSummary;
      const originalGetJournalEntries = localStorageService.getJournalEntries;
      const originalGetActivityData = localStorageService.getActivityData;
      const originalConsentGiven = behavioralTrackingService.consentGiven;

      // Mock localStorageService methods to use test data
      localStorageService.getSleepSummaries = async (days) => {
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        return sleepSummaries.filter(s => new Date(s.date) >= cutoff).reverse();
      };

      localStorageService.getSleepSummary = async (specificDate) => {
        if (!specificDate) return null;
        return sleepSummaries.find(s => s.date === specificDate) || null;
      };

      localStorageService.getJournalEntries = async (days = 7, specificDate = null) => {
        if (specificDate) {
          const entriesForDate = journalEntries.filter(j => j.date === specificDate);
          return entriesForDate.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        return journalEntries
          .filter(j => new Date(j.date) >= cutoff)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      };

      localStorageService.getActivityData = async (days = 7, specificDate = null) => {
        if (specificDate) {
          const entry = activityData.find(a => a.date === specificDate);
          return entry ? [entry] : [];
        }
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        return activityData.filter(a => new Date(a.date) >= cutoff);
      };

      // Enable consent to allow activity aggregation
      behavioralTrackingService.consentGiven = true;

      const results = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: { passed: 0, failed: 0, total: 0 },
      };

      // Test 1: 7-day aggregation
      try {
        const agg7 = await dataAggregationService.generateRollingAggregate(7);
        const test1Pass = agg7 &&
          typeof agg7.sleep?.avg_sleep_hours === 'number' &&
          typeof agg7.wellness?.avg_mood_score === 'number';
        
        results.tests.push({
          name: '7-Day Aggregation',
          passed: test1Pass,
          metrics: {
            sleep_hours: agg7?.sleep?.avg_sleep_hours?.toFixed(1),
            mood_score: agg7?.wellness?.avg_mood_score?.toFixed(1),
            consistency: agg7?.sleep?.consistency_score?.toFixed(2),
            sleep_days: agg7?.sleep?.days_with_data,
            entries: agg7?.wellness?.total_entries,
            trend: agg7?.overall_trend,
          },
          errors: test1Pass ? [] : ['Failed to generate valid 7-day aggregation'],
        });
        if (test1Pass) results.summary.passed++; else results.summary.failed++;
      } catch (e) {
        results.tests.push({ name: '7-Day Aggregation', passed: false, errors: [e.message] });
        results.summary.failed++;
      }
      results.summary.total++;

      // Test 2: 14-day aggregation
      try {
        const agg14 = await dataAggregationService.generateRollingAggregate(14);
        const test2Pass = agg14 && typeof agg14.sleep?.avg_sleep_hours === 'number';
        results.tests.push({
          name: '14-Day Aggregation',
          passed: test2Pass,
          metrics: {
            sleep_hours: agg14?.sleep?.avg_sleep_hours?.toFixed(1),
            mood_score: agg14?.wellness?.avg_mood_score?.toFixed(1),
            consistency: agg14?.sleep?.consistency_score?.toFixed(2),
          },
          errors: test2Pass ? [] : ['Failed to generate valid 14-day aggregation'],
        });
        if (test2Pass) results.summary.passed++; else results.summary.failed++;
      } catch (e) {
        results.tests.push({ name: '14-Day Aggregation', passed: false, errors: [e.message] });
        results.summary.failed++;
      }
      results.summary.total++;

      // Test 3: 30-day aggregation
      try {
        const agg30 = await dataAggregationService.generateRollingAggregate(30);
        const test3Pass = agg30 && typeof agg30.sleep?.avg_sleep_hours === 'number';
        results.tests.push({
          name: '30-Day Aggregation',
          passed: test3Pass,
          metrics: {
            sleep_hours: agg30?.sleep?.avg_sleep_hours?.toFixed(1),
            mood_score: agg30?.wellness?.avg_mood_score?.toFixed(1),
            consistency: agg30?.sleep?.consistency_score?.toFixed(2),
          },
          errors: test3Pass ? [] : ['Failed to generate valid 30-day aggregation'],
        });
        if (test3Pass) results.summary.passed++; else results.summary.failed++;
      } catch (e) {
        results.tests.push({ name: '30-Day Aggregation', passed: false, errors: [e.message] });
        results.summary.failed++;
      }
      results.summary.total++;

      // Test 4: Daily aggregation
      try {
        const today = new Date().toISOString().split('T')[0];
        const dayAgg = await dataAggregationService.generateDailyAggregate(today);
        const test4Pass = dayAgg && dayAgg.date === today;
        results.tests.push({
          name: 'Daily Aggregation',
          passed: test4Pass,
          metrics: {
            date: dayAgg?.date,
            has_sleep: !!dayAgg?.sleep?.total_sleep_minutes,
            has_mood: !!dayAgg?.wellness?.mood_score,
          },
          errors: test4Pass ? [] : ['Failed to generate valid daily aggregation'],
        });
        if (test4Pass) results.summary.passed++; else results.summary.failed++;
      } catch (e) {
        results.tests.push({ name: 'Daily Aggregation', passed: false, errors: [e.message] });
        results.summary.failed++;
      }
      results.summary.total++;

      // Test 5: Caching
      try {
        const beforeSize = dataAggregationService.cache?.size || 0;
        await dataAggregationService.generateRollingAggregate(7);
        const afterSize = dataAggregationService.cache?.size || 0;
        const sleepKey = dataAggregationService._getCacheKey('sleep', { days: 7 });
        const isCached = dataAggregationService.cache?.has(sleepKey) || afterSize > beforeSize;
        results.tests.push({
          name: 'Caching Mechanism',
          passed: !!isCached,
          metrics: { cached: isCached },
          errors: isCached ? [] : ['No cache entry detected for sleep aggregation'],
        });
        if (isCached) results.summary.passed++; else results.summary.failed++;
      } catch (e) {
        results.tests.push({ name: 'Caching Mechanism', passed: false, errors: [e.message] });
        results.summary.failed++;
      }
      results.summary.total++;

      // Restore original methods/state
      localStorageService.getSleepSummaries = originalGetSleepSummaries;
      localStorageService.getSleepSummary = originalGetSleepSummary;
      localStorageService.getJournalEntries = originalGetJournalEntries;
      localStorageService.getActivityData = originalGetActivityData;
      behavioralTrackingService.consentGiven = originalConsentGiven;

      this._phase1TestResults = results;
      return results;
    } catch (error) {
      console.error('Phase 1 test execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the last Phase 1 test results
   */
  getPhase1TestResults() {
    this._requireActive();
    return this._phase1TestResults || null;
  }

  /**
   * Reset Phase 1 test data and results
   */
  resetPhase1Tests() {
    this._requireActive();
    this._phase1TestData = null;
    this._phase1TestResults = null;
    return { success: true, message: 'Phase 1 tests reset' };
  }

  _requireActive() {
    if (!this.isActive) {
      throw new Error("Dev mode is not active");
    }
  }
}

// Singleton export
const devModeService = new DevModeService();
export default devModeService;