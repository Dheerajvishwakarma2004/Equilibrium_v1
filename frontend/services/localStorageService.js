// File: frontend/services/localStorageService.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import CryptoJS from "crypto-js";

const STORAGE_KEYS = {
  ENCRYPTION_KEY: "device_encryption_key",
  JOURNAL_ENTRIES: "journal_entries",
  DAILY_JOURNALS: "daily_journals",          // NEW: Daily journal structure
  JOURNAL_SETTINGS: "journal_settings",      // NEW: Journal display settings
  WELLNESS_DATA: "wellness_data",
  APP_USAGE: "app_usage",
  USER_PREFERENCES: "user_preferences",
  CONSENT_DATA: "consent_data",
  SLEEP_WINDOW: "sleep_window",
  SLEEP_PREFERENCES: "sleep_preferences",
  FITNESS_SLEEP_DATA: "fitness_sleep_data",
  SCREEN_SLEEP_DATA: "screen_sleep_data",
  ACTIVITY_DATA: "activity_data",

  ACTIVITY_GOALS: "activity_goals",
  USER_PROFILE: "user_profile",
  ACTIVITY_CACHE: "activity_cache",
  WEEKLY_ACTIVITY: "weekly_activity",
  // NEW: Sleep tracking sessions
  SLEEP_SESSIONS: "sleep_sessions",
  SLEEP_NIGHTLY_SUMMARIES: "sleep_nightly_summaries",
  SLEEP_TRACKING_STATE: "sleep_tracking_state",
  SLEEP_BOOTSTRAP_SHOWN: "sleep_bootstrap_shown",
  SLEEP_MISSING_PROMPTS: "sleep_missing_prompts",
  // ✅ NEW: Sleep data aggregates (lifecycle management)
  SLEEP_WEEKLY_AGGREGATES: "sleep_weekly_aggregates",
  SLEEP_MONTHLY_AGGREGATES: "sleep_monthly_aggregates",
  SLEEP_YEARLY_ARCHIVE: "sleep_yearly_archive",
  // ✅ NEW: App usage data aggregates (lifecycle management)
  APP_USAGE_DAILY: "app_usage_daily",
  APP_USAGE_WEEKLY: "app_usage_weekly",
  APP_USAGE_MONTHLY: "app_usage_monthly",
  // ✅ NEW: Unified wellness score (sleep + mood + behavior + activity)
  WELLNESS_SCORES: "wellness_scores",
  WELLNESS_SCORES_HISTORY: "wellness_scores_history",
  WELLNESS_LAST_CALCULATED_DATE: "wellness_last_calculated_date",
};

class LocalStorageService {
  constructor() {
    this.initialized = false;
    this.encryptionKey = null;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.encryptionKey = await this.getOrCreateDeviceKey();
      this.initialized = true;
      console.log("LocalStorageService initialized with secure key");
    } catch (error) {
      console.error("LocalStorageService initialization error:", error);
      throw error;
    }
  }

  // 🔐 Generate or fetch stored per-device key (stored in SecureStore)
  async getOrCreateDeviceKey() {
    try {
      let key = await SecureStore.getItemAsync(STORAGE_KEYS.ENCRYPTION_KEY);
      if (key) return key;

      // CryptoJS.lib.WordArray.random() uses crypto.getRandomValues() under the hood
      // via the react-native-get-random-values polyfill already imported in App.js.
      // Cryptographically secure, no native module required.
      const hashedKey = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);

      // Save securely in SecureStore
      await SecureStore.setItemAsync(STORAGE_KEYS.ENCRYPTION_KEY, hashedKey, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });

      return hashedKey;
    } catch (error) {
      console.error("Encryption key error:", error);
      throw error;
    }
  }

  // Encryption helpers
  // Format: "ivHex:ciphertextBase64" - random IV generated per encrypt call.
  // Legacy format (no colon prefix) still decryptable for backward compatibility.
  encrypt(data) {
    try {
      const key = CryptoJS.enc.Hex.parse(this.encryptionKey);
      // Generate a fresh cryptographically-random 16-byte IV for every encrypt call.
      // This ensures identical plaintexts produce different ciphertexts (CBC semantic security).
      const ivWords = CryptoJS.lib.WordArray.random(16);
      const ivHex = ivWords.toString(CryptoJS.enc.Hex);
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key, {
        iv: ivWords,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      // Store as "ivHex:ciphertext" so decrypt can recover the IV
      return ivHex + ":" + encrypted.toString();
    } catch (error) {
      console.error("Encryption error:", error);
      return null;
    }
  }

  decrypt(encryptedData) {
    try {
      const key = CryptoJS.enc.Hex.parse(this.encryptionKey);
      let iv, ciphertext;

      if (encryptedData.includes(":")) {
        // New format: "ivHex:ciphertextBase64"
        const separatorIndex = encryptedData.indexOf(":");
        const ivHex = encryptedData.substring(0, separatorIndex);
        ciphertext = encryptedData.substring(separatorIndex + 1);
        iv = CryptoJS.enc.Hex.parse(ivHex);
      } else {
        // Legacy format: static IV derived from key (backward compat for existing stored data)
        iv = CryptoJS.enc.Hex.parse(this.encryptionKey.substring(0, 32));
        ciphertext = encryptedData;
      }

      const bytes = CryptoJS.AES.decrypt(ciphertext, key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
      console.error("Decryption error:", error);
      return null;
    }
  }

  // 📦 Generic storage methods
  async setItem(key, value, encrypt = true) {
    try {
      if (value === null || value === undefined) {
        await AsyncStorage.removeItem(key);
        return true;
      }

      const dataToStore = encrypt
        ? this.encrypt(value)
        : JSON.stringify(value);
      await AsyncStorage.setItem(key, dataToStore);
      return true;
    } catch (error) {
      console.error("Storage setItem error:", error);
      return false;
    }
  }

  async getItem(key, decrypt = true) {
    try {
      const data = await AsyncStorage.getItem(key);
      if (!data) return null;
      return decrypt ? this.decrypt(data) : JSON.parse(data);
    } catch (error) {
      console.error("Storage getItem error:", error);
      return null;
    }
  }

  async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Storage removeItem error:", error);
      return false;
    }
  }

  // ========================================
  // 🛌 NEW: SLEEP TRACKING METHODS
  // ========================================

  /**
   * Save active sleep session (temporary during tracking)
   */
  async saveSleepSession(date, sessionData) {
    try {
      const sessions = (await this.getItem(STORAGE_KEYS.SLEEP_SESSIONS)) || {};
      sessions[date] = {
        ...sessionData,
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.SLEEP_SESSIONS, sessions);
      return true;
    } catch (error) {
      console.error("Save sleep session error:", error);
      return false;
    }
  }

  /**
   * Get sleep session for a date
   */
  async getSleepSession(date) {
    try {
      const sessions = (await this.getItem(STORAGE_KEYS.SLEEP_SESSIONS)) || {};
      return sessions[date] || null;
    } catch (error) {
      console.error("Get sleep session error:", error);
      return null;
    }
  }

  /**
   * Delete sleep session (called after processing)
   */
  async deleteSleepSession(date) {
    try {
      const sessions = (await this.getItem(STORAGE_KEYS.SLEEP_SESSIONS)) || {};
      delete sessions[date];
      await this.setItem(STORAGE_KEYS.SLEEP_SESSIONS, sessions);
      return true;
    } catch (error) {
      console.error("Delete sleep session error:", error);
      return false;
    }
  }

  /**
   * Save nightly sleep summary (permanent)
   */
  async saveSleepSummary(date, summaryData) {
    try {
      const summaries = (await this.getItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES)) || {};
      
      // ✅ CRITICAL: Date = wake-up date (the day the user wakes up)
      summaries[date] = {
        // PRIMARY KEY: Wake-up date
        date,
        
        // ✅ MANDATORY: Full timestamps (NOT just durations)
        sleep_start_time: summaryData.sleep_start_time || summaryData.sleep_start_estimated,
        sleep_end_time: summaryData.sleep_end_time || summaryData.sleep_end_estimated,
        
        // Duration metrics
        total_sleep_minutes: summaryData.total_sleep_minutes || 0,
        deep_sleep_minutes: summaryData.deep_sleep_minutes || 0,
        light_sleep_minutes: summaryData.light_sleep_minutes || 0,
        wake_minutes: summaryData.wake_minutes || 0,
        time_in_bed: summaryData.time_in_bed || 0,
        
        // Quality metrics
        sleep_efficiency: summaryData.sleep_efficiency || 0,
        restlessness_index: summaryData.restlessness_index || 0,
        fragmentation_count: summaryData.fragmentation_count || 0,
        
        // Metadata
        confidence_score: summaryData.confidence_score || 0,
        sleep_source: summaryData.sleep_source || "automatic",
        
        // ✅ NAP SESSIONS (separate array - NOT merged)
        nap_sessions: summaryData.nap_sessions || [],
        
        // Night screen usage
        night_screen_minutes: summaryData.night_screen_minutes || 0,
        
        // Timestamps
        created_at: summaryData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      await this.setItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES, summaries);
      
      // ✅ Auto-cleanup old sessions after successful summary save
      await this.deleteSleepSession(date);
      
      return summaries[date];
    } catch (error) {
      console.error("Save sleep summary error:", error);
      return null;
    }
  }

  /**
   * ✅ Compute sleep midpoint (for circadian analysis)
   */
  getSleepMidpoint(sleepStart, sleepEnd) {
    if (!sleepStart || !sleepEnd) return null;
    
    const start = new Date(sleepStart);
    const end = new Date(sleepEnd);
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    return midpoint.toISOString();
  }

  /**
   * ✅ Compute sleep consistency (needs last 7 days)
   */
  async getSleepConsistency(days = 7) {
    try {
      const summaries = await this.getSleepSummaries(days);
      
      if (summaries.length < 3) {
        return { score: 0, confidence: "low" };
      }

      // Filter out manual entries and entries without timestamps
      const validEntries = summaries.filter(s => 
        s.sleep_start_time && 
        s.sleep_source !== 'manual'
      );

      if (validEntries.length < 3) {
        return { score: 0, confidence: "low" };
      }

      // Extract sleep and wake times (minutes since midnight)
      const sleepTimes = validEntries.map(s => {
        const start = new Date(s.sleep_start_time);
        return start.getHours() * 60 + start.getMinutes();
      });

      const wakeTimes = validEntries.map(s => {
        const end = new Date(s.sleep_end_time);
        return end.getHours() * 60 + end.getMinutes();
      });

      // Calculate standard deviation
      const stdDev = (arr) => {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
      };

      const sleepStdDev = stdDev(sleepTimes);
      const wakeStdDev = stdDev(wakeTimes);

      // Lower deviation = higher consistency
      // Score: 100 - (average deviation in hours * 10)
      const avgDeviation = (sleepStdDev + wakeStdDev) / 2;
      const score = Math.max(0, 100 - (avgDeviation / 60) * 10);

      return {
        score: Math.round(score),
        sleepTimeVariation: Math.round(sleepStdDev),
        wakeTimeVariation: Math.round(wakeStdDev),
        confidence: validEntries.length >= 7 ? "high" : "medium",
      };
    } catch (error) {
      console.error("Get sleep consistency error:", error);
      return { score: 0, confidence: "low" };
    }
  }

  /**
   * ✅ Get comprehensive sleep analytics
   */
  async getSleepAnalytics(days = 7) {
    try {
      const summaries = await this.getSleepSummaries(days);
      
      if (summaries.length === 0) {
        return { 
          avgDuration: 0, 
          avgEfficiency: 0, 
          consistency: 0,
          missingDays: days,
          confidenceLevel: "none",
        };
      }

      let totalMinutes = 0;
      let totalEfficiency = 0;
      let validDays = 0;

      summaries.forEach(s => {
        if (s.total_sleep_minutes > 0) {
          totalMinutes += s.total_sleep_minutes;
          totalEfficiency += s.sleep_efficiency || 0;
          validDays++;
        }
      });

      const consistency = await this.getSleepConsistency(days);

      return {
        avgDuration: validDays > 0 ? Math.round(totalMinutes / validDays) : 0,
        avgEfficiency: validDays > 0 ? Math.round((totalEfficiency / validDays) * 100) : 0,
        consistency: consistency.score,
        consistencyVariation: {
          sleep: consistency.sleepTimeVariation,
          wake: consistency.wakeTimeVariation,
        },
        missingDays: days - validDays,
        confidenceLevel: validDays >= days * 0.8 ? "high" : validDays >= days * 0.5 ? "medium" : "low",
        totalNaps: summaries.reduce((sum, s) => sum + (s.nap_sessions?.length || 0), 0),
      };
    } catch (error) {
      console.error("Get sleep analytics error:", error);
      return {
        avgDuration: 0,
        avgEfficiency: 0,
        consistency: 0,
        missingDays: days,
        confidenceLevel: "none",
      };
    }
  } 

  /**
   * Get sleep summaries for date range
   */
  async getSleepSummaries(days = 30) {
    try {
      const summaries = (await this.getItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES)) || {};
      const sortedDates = Object.keys(summaries).sort().reverse();
      return sortedDates.slice(0, days).map((date) => ({
        date,
        ...summaries[date],
      }));
    } catch (error) {
      console.error("Get sleep summaries error:", error);
      return [];
    }
  }

  /**
   * Get single sleep summary
   */
  async getSleepSummary(date) {
    try {
      const summaries = (await this.getItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES)) || {};
      return summaries[date] || null;
    } catch (error) {
      console.error("Get sleep summary error:", error);
      return null;
    }
  }

  /**
   * Save sleep tracking state (for auto-tracking)
   */
  async saveSleepTrackingState(state) {
    try {
      await this.setItem(STORAGE_KEYS.SLEEP_TRACKING_STATE, state);
      return true;
    } catch (error) {
      console.error("Save sleep tracking state error:", error);
      return false;
    }
  }

  /**
   * Get sleep tracking state
   */
  async getSleepTrackingState() {
    try {
      return (await this.getItem(STORAGE_KEYS.SLEEP_TRACKING_STATE)) || {
        isAutoTrackingEnabled: false,
        currentSessionDate: null,
        isTracking: false,
      };
    } catch (error) {
      console.error("Get sleep tracking state error:", error);
      return {
        isAutoTrackingEnabled: false,
        currentSessionDate: null,
        isTracking: false,
      };
    }
  }

  /**
   * Check if bootstrap prompt has been shown
   */
  async hasShownBootstrapPrompt() {
    try {
      const shown = await this.getItem(STORAGE_KEYS.SLEEP_BOOTSTRAP_SHOWN);
      return shown === true;
    } catch (error) {
      console.error("Check bootstrap prompt error:", error);
      return false;
    }
  }

  /**
   * Mark bootstrap prompt as shown
   */
  async markBootstrapPromptShown() {
    try {
      await this.setItem(STORAGE_KEYS.SLEEP_BOOTSTRAP_SHOWN, true);
      return true;
    } catch (error) {
      console.error("Mark bootstrap prompt shown error:", error);
      return false;
    }
  }

  /**
   * Save missing sleep prompt record
   */
  async saveMissingSleepPrompt(date) {
    try {
      const prompts = (await this.getItem(STORAGE_KEYS.SLEEP_MISSING_PROMPTS)) || {};
      prompts[date] = {
        shown: true,
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.SLEEP_MISSING_PROMPTS, prompts);
      return true;
    } catch (error) {
      console.error("Save missing sleep prompt error:", error);
      return false;
    }
  }

  /**
   * Check if missing sleep prompt shown for date
   */
  async hasMissingSleepPromptShown(date) {
    try {
      const prompts = (await this.getItem(STORAGE_KEYS.SLEEP_MISSING_PROMPTS)) || {};
      return prompts[date]?.shown === true;
    } catch (error) {
      console.error("Check missing sleep prompt error:", error);
      return false;
    }
  }

  /**
   * Save manual sleep entry
   */
  async saveManualSleepEntry(date, sleepData) {
    try {
      const summary = {
        sleep_start_estimated: sleepData.sleep_start_time,
        sleep_end_estimated: sleepData.wake_time,
        total_sleep_minutes: sleepData.sleep_duration,
        deep_sleep_minutes: 0,
        light_sleep_minutes: 0,
        wake_minutes: 0,
        sleep_efficiency: 1.0,
        restlessness_index: 0,
        fragmentation_count: 0,
        confidence_score: 1.0,
        sleep_source: "manual",
        is_nap: sleepData.nap_session || false,
        created_at: new Date().toISOString(),
      };

      await this.saveSleepSummary(date, summary);
      return summary;
    } catch (error) {
      console.error("Save manual sleep entry error:", error);
      return null;
    }
  }

  /**
   * Get sleep statistics
   */
  async getSleepStatistics(days = 7) {
    try {
      const summaries = await this.getSleepSummaries(days);
      
      if (summaries.length === 0) {
        return {
          averageSleep: 0,
          averageEfficiency: 0,
          averageDeepSleep: 0,
          averageLightSleep: 0,
          totalNights: 0,
        };
      }

      let totalSleep = 0;
      let totalEfficiency = 0;
      let totalDeepSleep = 0;
      let totalLightSleep = 0;

      summaries.forEach(summary => {
        totalSleep += summary.total_sleep_minutes || 0;
        totalEfficiency += summary.sleep_efficiency || 0;
        totalDeepSleep += summary.deep_sleep_minutes || 0;
        totalLightSleep += summary.light_sleep_minutes || 0;
      });

      const count = summaries.length;

      return {
        averageSleep: Math.round(totalSleep / count),
        averageEfficiency: Math.round((totalEfficiency / count) * 100),
        averageDeepSleep: Math.round(totalDeepSleep / count),
        averageLightSleep: Math.round(totalLightSleep / count),
        totalNights: count,
      };
    } catch (error) {
      console.error("Get sleep statistics error:", error);
      return {
        averageSleep: 0,
        averageEfficiency: 0,
        averageDeepSleep: 0,
        averageLightSleep: 0,
        totalNights: 0,
      };
    }
  }

  // ========================================
  // 📓 Daily Journal Methods
  // ========================================

  async getDailyJournal(date) {
    try {
      const journals = (await this.getItem(STORAGE_KEYS.DAILY_JOURNALS)) || {};
      
      if (journals[date]) {
        return journals[date];
      }

      // Return empty journal structure for new day
      return {
        date,
        logs: [],
        scoreHistory: [],
        currentScore: 50, // Neutral baseline
        currentSentiment: "neutral",
        sentimentEmoji: "😐",
        finalScore: null,
        finalSentiment: null,
        isFinalized: false,
        createdAt: null,
        updatedAt: null,
      };
    } catch (error) {
      console.error("Get daily journal error:", error);
      return null;
    }
  }

  /**
   * Save/update a daily journal
   */
  async saveDailyJournal(date, journalData) {
    try {
      const journals = (await this.getItem(STORAGE_KEYS.DAILY_JOURNALS)) || {};
      
      journals[date] = {
        ...journalData,
        date,
        updatedAt: new Date().toISOString(),
        createdAt: journalData.createdAt || new Date().toISOString(),
      };

      await this.setItem(STORAGE_KEYS.DAILY_JOURNALS, journals);
      return journals[date];
    } catch (error) {
      console.error("Save daily journal error:", error);
      return null;
    }
  }

  /**
   * Add a log entry to a daily journal
   */
  async addJournalLog(date, logEntry) {
    try {
      const journal = await this.getDailyJournal(date);
      
      const newLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        deleted: false,
        ...logEntry,
      };

      journal.logs.push(newLog);
      
      await this.saveDailyJournal(date, journal);
      return newLog;
    } catch (error) {
      console.error("Add journal log error:", error);
      return null;
    }
  }

  /**
   * Soft delete a log entry (mark as deleted, don't remove)
   */
  async deleteJournalLog(date, logId) {
    try {
      const journal = await this.getDailyJournal(date);
      
      const logIndex = journal.logs.findIndex(log => log.id === logId);
      if (logIndex === -1) return false;

      // Soft delete - mark as deleted but keep for reference
      journal.logs[logIndex] = {
        ...journal.logs[logIndex],
        deleted: true,
        deletedAt: new Date().toISOString(),
      };

      await this.saveDailyJournal(date, journal);
      return true;
    } catch (error) {
      console.error("Delete journal log error:", error);
      return false;
    }
  }

  /**
   * Update score for a daily journal
   */
  async updateJournalScore(date, score, sentiment, emoji) {
    try {
      const journal = await this.getDailyJournal(date);
      
      // Add to score history
      journal.scoreHistory.push({
        timestamp: new Date().toISOString(),
        score,
        sentiment,
        emoji,
      });

      // Update current score
      journal.currentScore = score;
      journal.currentSentiment = sentiment;
      journal.sentimentEmoji = emoji;

      await this.saveDailyJournal(date, journal);
      return journal;
    } catch (error) {
      console.error("Update journal score error:", error);
      return null;
    }
  }

  /**
   * Finalize a day's journal (called when viewing next day)
   */
  async finalizeJournal(date) {
    try {
      const journal = await this.getDailyJournal(date);
      
      if (journal.isFinalized || journal.logs.length === 0) {
        return journal;
      }

      journal.finalScore = journal.currentScore;
      journal.finalSentiment = journal.currentSentiment;
      journal.finalEmoji = journal.sentimentEmoji;
      journal.isFinalized = true;
      journal.finalizedAt = new Date().toISOString();

      await this.saveDailyJournal(date, journal);
      return journal;
    } catch (error) {
      console.error("Finalize journal error:", error);
      return null;
    }
  }

  /**
   * Get journals for a date range (for reports/history)
   */
  async getJournalsInRange(startDate, endDate) {
    try {
      const journals = (await this.getItem(STORAGE_KEYS.DAILY_JOURNALS)) || {};
      
      const result = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (const [date, journal] of Object.entries(journals)) {
        const journalDate = new Date(date);
        if (journalDate >= start && journalDate <= end) {
          result.push(journal);
        }
      }

      return result.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error("Get journals in range error:", error);
      return [];
    }
  }

  /**
   * Get all daily journals (sorted by date descending)
   */
  async getAllDailyJournals() {
    try {
      const journals = (await this.getItem(STORAGE_KEYS.DAILY_JOURNALS)) || {};
      return Object.values(journals).sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error("Get all daily journals error:", error);
      return [];
    }
  }

  /**
   * Delete entire journal for a day
   */
  async deleteDailyJournal(date) {
    try {
      const journals = (await this.getItem(STORAGE_KEYS.DAILY_JOURNALS)) || {};
      
      if (!journals[date]) return false;

      // Keep the record but mark all logs as deleted and note journal was cleared
      journals[date] = {
        ...journals[date],
        logs: journals[date].logs.map(log => ({
          ...log,
          deleted: true,
          deletedAt: new Date().toISOString(),
        })),
        journalDeleted: true,
        journalDeletedAt: new Date().toISOString(),
        // Score remains unchanged as per requirement
      };

      await this.setItem(STORAGE_KEYS.DAILY_JOURNALS, journals);
      return true;
    } catch (error) {
      console.error("Delete daily journal error:", error);
      return false;
    }
  }

  // ========================================
  // ⚙️ Journal Settings
  // ========================================

  async getJournalSettings() {
    try {
      return (await this.getItem(STORAGE_KEYS.JOURNAL_SETTINGS)) || {
        showDevScore: false,  // Toggle for numerical score display
        defaultView: "today",
      };
    } catch (error) {
      console.error("Get journal settings error:", error);
      return { showDevScore: false, defaultView: "today" };
    }
  }

  async saveJournalSettings(settings) {
    try {
      const current = await this.getJournalSettings();
      await this.setItem(STORAGE_KEYS.JOURNAL_SETTINGS, { ...current, ...settings });
      return true;
    } catch (error) {
      console.error("Save journal settings error:", error);
      return false;
    }
  }

  // ========================================
  // ✏️ Legacy Journal entries
  // ========================================
  
  async saveJournalEntry(entry) {
    try {
      const entries = (await this.getJournalEntries()) || [];
      const newEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...entry,
      };
      entries.unshift(newEntry);

      const limitedEntries = entries.slice(0, 100);
      await this.setItem(STORAGE_KEYS.JOURNAL_ENTRIES, limitedEntries);
      return newEntry;
    } catch (error) {
      console.error("Save journal entry error:", error);
      return null;
    }
  }

  async getJournalEntries(limit = null) {
    try {
      const entries = (await this.getItem(STORAGE_KEYS.JOURNAL_ENTRIES)) || [];
      return limit ? entries.slice(0, limit) : entries;
    } catch (error) {
      console.error("Get journal entries error:", error);
      return [];
    }
  }

  async deleteJournalEntry(entryId) {
    try {
      const entries = (await this.getJournalEntries()) || [];
      const filteredEntries = entries.filter((entry) => entry.id !== entryId);
      await this.setItem(STORAGE_KEYS.JOURNAL_ENTRIES, filteredEntries);
      return true;
    } catch (error) {
      console.error("Delete journal entry error:", error);
      return false;
    }
  }

  // ========================================
  // ❤️ Wellness data
  // ========================================
  
  async saveWellnessData(date, data) {
    try {
      const wellnessData = (await this.getItem(STORAGE_KEYS.WELLNESS_DATA)) || {};
      wellnessData[date] = {
        ...data,
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.WELLNESS_DATA, wellnessData);
      return true;
    } catch (error) {
      console.error("Save wellness data error:", error);
      return false;
    }
  }

  async getWellnessData(days = 30) {
    try {
      const wellnessData = (await this.getItem(STORAGE_KEYS.WELLNESS_DATA)) || {};
      const sortedDates = Object.keys(wellnessData).sort().reverse();
      return sortedDates.slice(0, days).map((date) => ({
        date,
        ...wellnessData[date],
      }));
    } catch (error) {
      console.error("Get wellness data error:", error);
      return [];
    }
  }

  // ========================================
  // 🛌 Sleep window
  // ========================================
  
  async saveSleepWindow(window) {
    return this.setItem(STORAGE_KEYS.SLEEP_WINDOW, window);
  }

  async getSleepWindow() {
    return this.getItem(STORAGE_KEYS.SLEEP_WINDOW);
  }

  // ðŸŽ¯ Sleep tracking preferences
  async saveSleepPreferences(preferences) {
    try {
      await this.setItem(STORAGE_KEYS.SLEEP_PREFERENCES, preferences);
      return true;
    } catch (error) {
      console.error("Save sleep preferences error:", error);
      return false;
    }
  }

  async getSleepPreferences() {
    try {
      return (await this.getItem(STORAGE_KEYS.SLEEP_PREFERENCES)) || {
        mode: "screen_usage",
        fitnessConnected: false,
        autoTrackingEnabled: false,
      };
    } catch (error) {
      console.error("Get sleep preferences error:", error);
      return {
        mode: "screen_usage",
        fitnessConnected: false,
        autoTrackingEnabled: false,
      };
    }
  }

  // ðŸ’ª Fitness band sleep data storage
  async saveFitnessSleepData(date, sleepData) {
    try {
      const fitnessData = (await this.getItem(STORAGE_KEYS.FITNESS_SLEEP_DATA)) || {};
      fitnessData[date] = {
        ...sleepData,
        source: "fitness_band",
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.FITNESS_SLEEP_DATA, fitnessData);
      return true;
    } catch (error) {
      console.error("Save fitness sleep data error:", error);
      return false;
    }
  }

  async getFitnessSleepData(days = 30) {
    try {
      const fitnessData = (await this.getItem(STORAGE_KEYS.FITNESS_SLEEP_DATA)) || {};
      const sortedDates = Object.keys(fitnessData).sort().reverse();
      return sortedDates.slice(0, days).map((date) => ({
        date,
        ...fitnessData[date],
      }));
    } catch (error) {
      console.error("Get fitness sleep data error:", error);
      return [];
    }
  }

  async saveScreenUsageSleepData(date, sleepData) {
    try {
      const screenData = (await this.getItem(STORAGE_KEYS.SCREEN_SLEEP_DATA)) || {};
      screenData[date] = {
        ...sleepData,
        source: "screen_usage",
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.SCREEN_SLEEP_DATA, screenData);
      return true;
    } catch (error) {
      console.error("Save screen sleep data error:", error);
      return false;
    }
  }

  async getScreenUsageSleepData(days = 30) {
    try {
      const screenData = (await this.getItem(STORAGE_KEYS.SCREEN_SLEEP_DATA)) || {};
      const sortedDates = Object.keys(screenData).sort().reverse();
      return sortedDates.slice(0, days).map((date) => ({
        date,
        ...screenData[date],
      }));
    } catch (error) {
      console.error("Get screen sleep data error:", error);
      return [];
    }
  }

  async getActiveSleepData(days = 30) {
    try {
      const preferences = await this.getSleepPreferences();

      if (preferences.mode === "fitness_band" && preferences.fitnessConnected) {
        return await this.getFitnessSleepData(days);
      } else if (preferences.mode === "auto_tracking" && preferences.autoTrackingEnabled) {
        return await this.getSleepSummaries(days);
      } else {
        return await this.getScreenUsageSleepData(days);
      }
    } catch (error) {
      console.error("Get active sleep data error:", error);
      return [];
    }
  }

  // ========================================
  // 📊 App usage tracking
  // ========================================
  
  async saveAppUsage(date, usageData) {
    try {
      const appUsage = (await this.getItem(STORAGE_KEYS.APP_USAGE)) || {};
      appUsage[date] = {
        ...usageData,
        timestamp: new Date().toISOString(),
      };
      await this.setItem(STORAGE_KEYS.APP_USAGE, appUsage);
      return true;
    } catch (error) {
      console.error("Save app usage error:", error);
      return false;
    }
  }

  async getAppUsage(days = 7) {
    try {
      const appUsage = (await this.getItem(STORAGE_KEYS.APP_USAGE)) || {};
      const sortedDates = Object.keys(appUsage).sort().reverse();
      return sortedDates.slice(0, days).map((date) => ({
        date,
        ...appUsage[date],
      }));
    } catch (error) {
      console.error("Get app usage error:", error);
      return [];
    }
  }

  // ========================================
  // 🏃 Physical activity
  // ========================================
  
  async saveActivityData(date, data) {
    try {
      const store = (await this.getItem(STORAGE_KEYS.ACTIVITY_DATA)) || {};

      // Merge with existing data for the date
      const existing = store[date] || {};
      store[date] = {
        ...existing,
        ...data,
        timestamp: new Date().toISOString(),
        // Ensure we don't lose manual activities
        manualActivities: existing.manualActivities || [],
      };

      await this.setItem(STORAGE_KEYS.ACTIVITY_DATA, store);

      // Update weekly cache
      await this.updateWeeklyActivityCache(date, store[date]);

      return true;
    } catch (error) {
      console.error("Save activity data error:", error);
      return false;
    }
  }

  async getActivityData(days = 7) {
    try {
      const store = (await this.getItem(STORAGE_KEYS.ACTIVITY_DATA)) || {};
      return Object.keys(store)
        .sort()
        .reverse()
        .slice(0, days)
        .map(date => ({ date, ...store[date] }));
    } catch (error) {
      console.error("Get activity data error:", error);
      return [];
    }
  }

  async getTodayActivityData() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const store = (await this.getItem(STORAGE_KEYS.ACTIVITY_DATA)) || {};
      return store[today] || {
        steps: 0,
        distance: 0,
        calories: 0,
        activeMinutes: 0,
        moveMinutes: 0,
        heartPoints: 0,
        manualActivities: [],
      };
    } catch (error) {
      console.error("Get today activity data error:", error);
      return {
        steps: 0,
        distance: 0,
        calories: 0,
        activeMinutes: 0,
        moveMinutes: 0,
        heartPoints: 0,
        manualActivities: [],
      };
    }
  }

  // ✅ REMOVED: Manual activity logging (no longer used in project)

  // Activity goals
  async saveActivityGoals(goals) {
    try {
      await this.setItem(STORAGE_KEYS.ACTIVITY_GOALS, goals);
      return true;
    } catch (error) {
      console.error("Save activity goals error:", error);
      return false;
    }
  }

  async getActivityGoals() {
    try {
      return (await this.getItem(STORAGE_KEYS.ACTIVITY_GOALS)) || {
        steps: 10000,
        distance: 5, // km
        calories: 500,
        activeMinutes: 30,
        moveMinutes: 30,
        heartPoints: 10,
      };
    } catch (error) {
      console.error("Get activity goals error:", error);
      return {
        steps: 10000,
        distance: 5,
        calories: 500,
        activeMinutes: 30,
        moveMinutes: 30,
        heartPoints: 10,
      };
    }
  }

  // User profile for activity calculations
  async saveUserProfile(profile) {
    try {
      await this.setItem(STORAGE_KEYS.USER_PROFILE, profile);
      return true;
    } catch (error) {
      console.error("Save user profile error:", error);
      return false;
    }
  }

  async getUserProfile() {
    try {
      return (await this.getItem(STORAGE_KEYS.USER_PROFILE)) || {
        weight: 70, // kg
        height: 170, // cm
        age: 30,
        gender: "male",
      };
    } catch (error) {
      console.error("Get user profile error:", error);
      return {
        weight: 70,
        height: 170,
        age: 30,
        gender: "male",
      };
    }
  }

  // Weekly activity cache for performance
  async updateWeeklyActivityCache(date, data) {
    try {
      const cache = (await this.getItem(STORAGE_KEYS.WEEKLY_ACTIVITY)) || {};
      cache[date] = {
        steps: data.steps || 0,
        distance: data.distance || 0,
        calories: data.calories || 0,
        activeMinutes: data.activeMinutes || 0,
        moveMinutes: data.moveMinutes || 0,
        heartPoints: data.heartPoints || 0,
      };

      // Keep only last 7 days
      const dates = Object.keys(cache).sort().reverse();
      if (dates.length > 7) {
        dates.slice(7).forEach(oldDate => delete cache[oldDate]);
      }

      await this.setItem(STORAGE_KEYS.WEEKLY_ACTIVITY, cache);
      return true;
    } catch (error) {
      console.error("Update weekly cache error:", error);
      return false;
    }
  }

  async getWeeklyActivityData() {
    try {
      const cache = await this.getItem(STORAGE_KEYS.WEEKLY_ACTIVITY);
      if (cache && Object.keys(cache).length >= 7) {
        return cache;
      }

      // Rebuild cache if needed
      const activityData = await this.getActivityData(7);
      const rebuiltCache = {};

      activityData.forEach(day => {
        rebuiltCache[day.date] = {
          steps: day.steps || 0,
          distance: day.distance || 0,
          calories: day.calories || 0,
          activeMinutes: day.activeMinutes || 0,
          moveMinutes: day.moveMinutes || 0,
          heartPoints: day.heartPoints || 0,
        };
      });

      await this.setItem(STORAGE_KEYS.WEEKLY_ACTIVITY, rebuiltCache);
      return rebuiltCache;
    } catch (error) {
      console.error("Get weekly activity error:", error);
      return {};
    }
  }

  // Activity statistics
  async getActivityStatistics() {
    try {
      const weeklyData = await this.getWeeklyActivityData();
      const dates = Object.keys(weeklyData).sort();

      if (dates.length === 0) {
        return {
          averageSteps: 0,
          averageDistance: 0,
          averageCalories: 0,
          averageActiveMinutes: 0,
          totalSteps: 0,
          totalDistance: 0,
          totalCalories: 0,
          bestDay: null,
        };
      }

      let totalSteps = 0;
      let totalDistance = 0;
      let totalCalories = 0;
      let totalActiveMinutes = 0;
      let bestDay = { date: "", steps: 0 };

      dates.forEach(date => {
        const day = weeklyData[date];
        totalSteps += day.steps;
        totalDistance += day.distance;
        totalCalories += day.calories;
        totalActiveMinutes += day.activeMinutes;

        if (day.steps > bestDay.steps) {
          bestDay = { date, steps: day.steps };
        }
      });

      const count = dates.length;

      return {
        averageSteps: Math.round(totalSteps / count),
        averageDistance: Math.round(totalDistance / count * 10) / 10,
        averageCalories: Math.round(totalCalories / count),
        averageActiveMinutes: Math.round(totalActiveMinutes / count),
        totalSteps,
        totalDistance: Math.round(totalDistance * 10) / 10,
        totalCalories: Math.round(totalCalories),
        bestDay,
      };
    } catch (error) {
      console.error("Get activity statistics error:", error);
      return {
        averageSteps: 0,
        averageDistance: 0,
        averageCalories: 0,
        averageActiveMinutes: 0,
        totalSteps: 0,
        totalDistance: 0,
        totalCalories: 0,
        bestDay: null,
      };
    }
  }

  // ========================================
  // ⚙️ User preferences
  // ========================================
  
  async saveUserPreferences(preferences) {
    try {
      await this.setItem(STORAGE_KEYS.USER_PREFERENCES, preferences);
      return true;
    } catch (error) {
      console.error("Save user preferences error:", error);
      return false;
    }
  }

  async getUserPreferences() {
    try {
      return (await this.getItem(STORAGE_KEYS.USER_PREFERENCES)) || {};
    } catch (error) {
      console.error("Get user preferences error:", error);
      return {};
    }
  }

  async saveConsentData(consentData) {
    try {
      await this.setItem(STORAGE_KEYS.CONSENT_DATA, consentData);
      return true;
    } catch (error) {
      console.error("Save consent data error:", error);
      return false;
    }
  }

  async getConsentData() {
    try {
      return (await this.getItem(STORAGE_KEYS.CONSENT_DATA)) || {};
    } catch (error) {
      console.error("Get consent data error:", error);
      return {};
    }
  }

  async clearAllData() {
    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
      return true;
    } catch (error) {
      console.error("Clear all data error:", error);
      return false;
    }
  }

  async exportAllData() {
    try {
      const data = {};
      for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
        if (key === "ENCRYPTION_KEY") continue;
        data[key] = await this.getItem(storageKey);
      }
      return data;
    } catch (error) {
      console.error("Export all data error:", error);
      return null;
    }
  }

  // ========================================
  // 🔄 SLEEP DATA AGGREGATES (Lifecycle Management)
  // ========================================

  /**
   * ✅ Get weekly aggregates (30-90 days old data)
   */
  async getSleepWeeklyAggregates() {
    try {
      return (await this.getItem(STORAGE_KEYS.SLEEP_WEEKLY_AGGREGATES)) || {};
    } catch (error) {
      console.error("Get weekly aggregates error:", error);
      return {};
    }
  }

  /**
   * ✅ Get monthly aggregates (90-365 days old data)
   */
  async getSleepMonthlyAggregates() {
    try {
      return (await this.getItem(STORAGE_KEYS.SLEEP_MONTHLY_AGGREGATES)) || {};
    } catch (error) {
      console.error("Get monthly aggregates error:", error);
      return {};
    }
  }

  /**
   * ✅ Get yearly archive (365+ days old data)
   */
  async getSleepYearlyArchive() {
    try {
      return (await this.getItem(STORAGE_KEYS.SLEEP_YEARLY_ARCHIVE)) || {};
    } catch (error) {
      console.error("Get yearly archive error:", error);
      return {};
    }
  }

  /**
   * ✅ Set aggregates (called by lifecycle service)
   */
  async setAggregates(weeklyData, monthlyData, yearlyData) {
    try {
      await this.setItem(STORAGE_KEYS.SLEEP_WEEKLY_AGGREGATES, weeklyData);
      await this.setItem(STORAGE_KEYS.SLEEP_MONTHLY_AGGREGATES, monthlyData);
      await this.setItem(STORAGE_KEYS.SLEEP_YEARLY_ARCHIVE, yearlyData);
      return true;
    } catch (error) {
      console.error("Set aggregates error:", error);
      return false;
    }
  }

  /**
   * ✅ Get storage metadata for lifecycle monitoring
   */
  async getSleepStorageMetadata() {
    try {
      const nightly = await this.getItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES) || {};
      const weekly = await this.getItem(STORAGE_KEYS.SLEEP_WEEKLY_AGGREGATES) || {};
      const monthly = await this.getItem(STORAGE_KEYS.SLEEP_MONTHLY_AGGREGATES) || {};
      const yearly = await this.getItem(STORAGE_KEYS.SLEEP_YEARLY_ARCHIVE) || {};

      return {
        nightly_count: Object.keys(nightly).length,
        weekly_count: Object.keys(weekly).length,
        monthly_count: Object.keys(monthly).length,
        yearly_count: Object.keys(yearly).length,
        nightly_size_bytes: JSON.stringify(nightly).length,
        weekly_size_bytes: JSON.stringify(weekly).length,
        monthly_size_bytes: JSON.stringify(monthly).length,
        yearly_size_bytes: JSON.stringify(yearly).length,
        total_size_bytes: 
          JSON.stringify(nightly).length +
          JSON.stringify(weekly).length +
          JSON.stringify(monthly).length +
          JSON.stringify(yearly).length,
      };
    } catch (error) {
      console.error("Get storage metadata error:", error);
      return {};
    }
  }

  /**
   * ✅ Clear all sleep data (manual reset)
   */
  async clearAllSleepData() {
    try {
      await this.setItem(STORAGE_KEYS.SLEEP_NIGHTLY_SUMMARIES, {});
      await this.setItem(STORAGE_KEYS.SLEEP_WEEKLY_AGGREGATES, {});
      await this.setItem(STORAGE_KEYS.SLEEP_MONTHLY_AGGREGATES, {});
      await this.setItem(STORAGE_KEYS.SLEEP_YEARLY_ARCHIVE, {});
      await this.setItem(STORAGE_KEYS.SLEEP_SESSIONS, {});
      console.log("✅ All sleep data cleared");
      return true;
    } catch (error) {
      console.error("Clear all sleep data error:", error);
      return false;
    }
  }
}

export default new LocalStorageService();
