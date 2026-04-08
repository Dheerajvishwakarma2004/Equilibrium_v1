// sleepTrackingService.js
import { NativeModules, Platform, Alert } from "react-native";
import localStorageService from "./localStorageService";

const { SleepTrackingModule } = NativeModules;

class SleepTrackingService {
  constructor() {
    this.isTracking = false;
    this.currentSessionDate = null;
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      console.log("Sleep tracking not available on this platform");
      return false;
    }

    try {
      const granted = await SleepTrackingModule.requestPermissions();
      if (!granted) {
        return false;
      }

      // Import any pending native sleep data
      await this.importNativeSummary();

      // Load saved tracking state
      const state = await localStorageService.getSleepTrackingState();
      this.isTracking = state.isTracking;
      this.currentSessionDate = state.currentSessionDate;

      console.log("Sleep tracking initialized successfully");
      return true;
    } catch (error) {
      console.error("Sleep tracking initialization error:", error);
      return false;
    }
  }

  // ========================================
  // NATIVE DATA IMPORT BRIDGE
  // ========================================

  // ✅ ADDED: Validate and convert timezone-aware timestamps
  validateAndConvertTimestamp(timestamp) {
    if (!timestamp) return null;
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.warn("Invalid timestamp:", timestamp);
        return null;
      }
      
      // Ensure we always work with UTC
      return date.toISOString();
    } catch (error) {
      console.error("Timestamp validation error:", error);
      return null;
    }
  }

  // ✅ ADDED: Determine correct wake date accounting for timezones
  getWakeDateFromTimestamps(startTime, endTime) {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      // Use wake time's date as primary key
      const wakeDate = end.toISOString().split('T')[0];
      
      // Log if there's a significant timezone discrepancy
      const startDate = start.toISOString().split('T')[0];
      if (startDate !== wakeDate) {
        console.log(`Sleep crosses midnight: ${startDate} → ${wakeDate}`);
      }
      
      return wakeDate;
    } catch (error) {
      console.error("Wake date calculation error:", error);
      return new Date().toISOString().split('T')[0];
    }
  }

  async importNativeSummary() {
    if (Platform.OS !== "android" || !SleepTrackingModule) return null;

    try {
      const nativeSummary = await SleepTrackingModule.getLastSleepSummary();

      if (!nativeSummary) {
        console.log("No pending native sleep summary");
        return null;
      }

      // ✅ IMPROVED: Validate timestamps before using
      const validatedStartTime = this.validateAndConvertTimestamp(nativeSummary.sleep_start_time);
      const validatedEndTime = this.validateAndConvertTimestamp(nativeSummary.sleep_end_time);
      
      if (!validatedEndTime) {
        console.error("Invalid sleep end time, cannot import");
        return null;
      }

      // ✅ Use validated wake date
      const date = this.getWakeDateFromTimestamps(validatedStartTime, validatedEndTime);
      console.log("Found native sleep summary for:", date);

      // Check if already imported
      const existing = await localStorageService.getSleepSummary(date);
      if (existing) {
        console.log("Summary already exists for", date, "- clearing native");
        await SleepTrackingModule.clearLastSleepSummary();
        return existing;
      }

      // ✅ FIX: Use sleep_start_time and sleep_end_time with timezone validation
      const summary = {
        date,
        sleep_start_time: validatedStartTime,
        sleep_end_time: validatedEndTime,
        total_sleep_minutes: nativeSummary.total_sleep_minutes || 0,
        deep_sleep_minutes: nativeSummary.deep_sleep_minutes || 0,
        light_sleep_minutes: nativeSummary.light_sleep_minutes || 0,
        wake_minutes: nativeSummary.wake_minutes || 0,
        time_in_bed: nativeSummary.time_in_bed || 0,
        sleep_efficiency: nativeSummary.sleep_efficiency || 0,
        confidence_score: nativeSummary.confidence_score || 0,
        restlessness_index: nativeSummary.restlessness_index || 0,
        fragmentation_count: nativeSummary.fragmentation_count || 0,
        sleep_source: "automatic",
        nap_sessions: nativeSummary.nap_sessions || [],
        night_screen_minutes: nativeSummary.night_screen_minutes || 0,
        created_at: nativeSummary.created_at || new Date().toISOString(),
      };

      // Save to encrypted AsyncStorage
      await localStorageService.saveSleepSummary(date, summary);
      console.log("Imported native sleep summary:", {
        date,
        totalSleep: summary.total_sleep_minutes,
        efficiency: summary.sleep_efficiency,
        confidence: summary.confidence_score,
      });

      // Clear native data so it's not imported again
      await SleepTrackingModule.clearLastSleepSummary();

      return summary;
    } catch (error) {
      console.error("Import native summary error:", error);
      return null;
    }
  }

  // ========================================
  // AUTO-TRACKING CONTROL
  // ========================================

  async enableAutoTracking() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      // Get sleep window
      const sleepWindow = await localStorageService.getSleepWindow();
      if (!sleepWindow || !sleepWindow.bedtime || !sleepWindow.wakeup) {
        Alert.alert(
          "Sleep Window Required",
          "Please set your sleep window before enabling auto-tracking."
        );
        return false;
      }

      // Format times for native module
      const bedtime = this.formatTimeForNative(sleepWindow.bedtime);
      const wakeup = this.formatTimeForNative(sleepWindow.wakeup);

      console.log("Enabling auto-tracking: bedtime=", bedtime, "wakeup=", wakeup);

      // Schedule via native module
      await SleepTrackingModule.scheduleSleepTracking(bedtime, wakeup);

      // Update JS preferences
      const prefs = await localStorageService.getSleepPreferences();
      prefs.autoTrackingEnabled = true;
      prefs.mode = "auto_tracking";
      await localStorageService.saveSleepPreferences(prefs);

      // Update tracking state
      await localStorageService.saveSleepTrackingState({
        isTracking: false,
        currentSessionDate: null,
        isAutoTrackingEnabled: true,
      });

      console.log("Auto-tracking enabled successfully");
      return true;
    } catch (error) {
      console.error("Enable auto-tracking error:", error);
      return false;
    }
  }

  async disableAutoTracking() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      await SleepTrackingModule.cancelSleepTracking();

      const prefs = await localStorageService.getSleepPreferences();
      prefs.autoTrackingEnabled = false;
      if (prefs.mode === "auto_tracking") {
        prefs.mode = "screen_usage";
      }
      await localStorageService.saveSleepPreferences(prefs);

      await localStorageService.saveSleepTrackingState({
        isTracking: false,
        currentSessionDate: null,
        isAutoTrackingEnabled: false,
      });

      console.log("Auto-tracking disabled");
      return true;
    } catch (error) {
      console.error("Disable auto-tracking error:", error);
      return false;
    }
  }

  async isAutoTrackingEnabled() {
    const prefs = await localStorageService.getSleepPreferences();
    return prefs.autoTrackingEnabled === true;
  }

  // ========================================
  // MANUAL TRACKING (Direct service control)
  // ========================================

  async startTracking(date = null) {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      await SleepTrackingModule.startTracking();

      const sessionDate = date || new Date().toISOString().split("T")[0];
      this.isTracking = true;
      this.currentSessionDate = sessionDate;

      await localStorageService.saveSleepTrackingState({
        isTracking: true,
        currentSessionDate: sessionDate,
        startTime: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error("Start tracking error:", error);
      return false;
    }
  }

  async stopTracking() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      await SleepTrackingModule.stopTracking();

      this.isTracking = false;
      this.currentSessionDate = null;

      await localStorageService.saveSleepTrackingState({
        isTracking: false,
        currentSessionDate: null,
      });

      // Wait a moment for native processing, then import
      setTimeout(async () => {
        await this.importNativeSummary();
      }, 2000);

      return true;
    } catch (error) {
      console.error("Stop tracking error:", error);
      return false;
    }
  }

  // ========================================
  // MANUAL SLEEP LOGGING
  // ========================================

  async logManualSleep(sleepStartTime, wakeTime, isNap = false) {
    try {
      const start = new Date(sleepStartTime);
      const end = new Date(wakeTime);

      // Calculate duration (handle midnight crossing)
      let durationMinutes = (end - start) / (1000 * 60);

      if (durationMinutes < 0) {
        durationMinutes = durationMinutes + (24 * 60);
      } else if (durationMinutes > 20 * 60) {
        durationMinutes = durationMinutes - (24 * 60);
      }

      // Validation
      if (durationMinutes < 30) {
        throw new Error("Sleep duration must be at least 30 minutes");
      }

      if (durationMinutes > 16 * 60) {
        throw new Error(`Sleep duration calculated as ${Math.round(durationMinutes / 60)} hours. Please check your sleep and wake times.`);
      }

      // ✅ CRITICAL: Use wake-up date as primary key
      const wakeDate = end.toISOString().split('T')[0];

      // Handle naps separately
      if (isNap) {
        const existing = await localStorageService.getSleepSummary(wakeDate);
        
        const napSession = {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: Math.round(durationMinutes),
          logged_at: new Date().toISOString(),
        };

        if (existing) {
          // Add to existing day's naps
          existing.nap_sessions = existing.nap_sessions || [];
          existing.nap_sessions.push(napSession);
          await localStorageService.saveSleepSummary(wakeDate, existing);
          console.log("Added nap to existing sleep summary:", wakeDate);
          return existing;
        } else {
          // ✅ IMPROVED: Create new summary with just nap - mark as nap_only
          const summary = {
            date: wakeDate,
            sleep_start_time: null, // No main sleep
            sleep_end_time: null,
            total_sleep_minutes: 0,
            deep_sleep_minutes: 0,
            light_sleep_minutes: 0,
            wake_minutes: 0,
            time_in_bed: 0,
            sleep_efficiency: 0,
            restlessness_index: 0,
            fragmentation_count: 0,
            confidence_score: 1.0,
            sleep_source: 'manual',
            nap_sessions: [napSession],
            nap_total_minutes: Math.round(durationMinutes), // ✅ Track total nap time
            nap_only_day: true, // ✅ ADDED: Flag for nap-only days
            night_screen_minutes: 0,
            created_at: new Date().toISOString(),
          };
          
          await localStorageService.saveSleepSummary(wakeDate, summary);
          console.log("Created new nap-only summary:", wakeDate);
          return summary;
        }
      }

      // Main sleep session
      const summary = {
        date: wakeDate, // ✅ Wake-up date
        sleep_start_time: start.toISOString(),
        sleep_end_time: end.toISOString(),
        total_sleep_minutes: Math.round(durationMinutes),
        deep_sleep_minutes: 0, // Manual entries don't have stage data
        light_sleep_minutes: 0,
        wake_minutes: 0,
        time_in_bed: Math.round(durationMinutes),
        sleep_efficiency: 1.0, // Assume 100% for manual
        restlessness_index: 0,
        fragmentation_count: 0,
        confidence_score: 1.0,
        sleep_source: 'manual',
        nap_sessions: [],
        night_screen_minutes: 0,
        created_at: new Date().toISOString(),
      };

      await localStorageService.saveSleepSummary(wakeDate, summary);
      console.log("Manual sleep logged:", { date: wakeDate, duration: durationMinutes });

      return summary;
    } catch (error) {
      console.error("Log manual sleep error:", error);
      throw error;
    }
  }

  // ========================================
  // BOOTSTRAP & MISSING DATA
  // ========================================

  async checkAndShowBootstrapPrompt() {
    try {
      const shown = await localStorageService.hasShownBootstrapPrompt();
      if (shown) return false;

      const summaries = await localStorageService.getSleepSummaries(1);
      if (summaries.length > 0) {
        await localStorageService.markBootstrapPromptShown();
        return false;
      }

      return true;
    } catch (error) {
      console.error("Check bootstrap prompt error:", error);
      return false;
    }
  }

  async markBootstrapComplete() {
    await localStorageService.markBootstrapPromptShown();
  }

  async checkMissingSleepData() {
    try {
      // First try to import any pending native data
      await this.importNativeSummary();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const promptShown = await localStorageService.hasMissingSleepPromptShown(yesterdayStr);
      if (promptShown) return null;

      const summary = await localStorageService.getSleepSummary(yesterdayStr);
      if (summary) return null;

      return yesterdayStr;
    } catch (error) {
      console.error("Check missing sleep data error:", error);
      return null;
    }
  }

  async markMissingPromptShown(date) {
    await localStorageService.saveMissingSleepPrompt(date);
  }

  // ========================================
  // DATA RETRIEVAL
  // ========================================

  async getLastNightSleep() {
    try {
      // Always try to import native data first
      await this.importNativeSummary();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const summary = await localStorageService.getSleepSummary(yesterdayStr);
      return summary;
    } catch (error) {
      console.error("Get last night sleep error:", error);
      return null;
    }
  }

  async getSleepSummaries(days = 7) {
    try {
      return await localStorageService.getSleepSummaries(days);
    } catch (error) {
      console.error("Get sleep summaries error:", error);
      return [];
    }
  }

  // ========================================
  // STATISTICS HELPERS
  // ========================================

  // ✅ Calculate circadian midpoint for consistency analysis
  calculateCircadianMidpoint(sleepStartTime, sleepEndTime) {
    if (!sleepStartTime || !sleepEndTime) return null;
    
    try {
      const start = new Date(sleepStartTime);
      const end = new Date(sleepEndTime);
      const midpoint = new Date((start.getTime() + end.getTime()) / 2);
      
      // Return hour of day (0-23)
      return midpoint.getHours() + midpoint.getMinutes() / 60;
    } catch (error) {
      console.error("Circadian midpoint calculation error:", error);
      return null;
    }
  }

  // ✅ Calculate sleep onset variability (std dev of sleep start times)
  calculateSleepOnsetVariability(summaries) {
    const validTimes = summaries
      .filter(s => s.sleep_start_time && !s.nap_only_day)
      .map(s => {
        const startDate = new Date(s.sleep_start_time);
        // Return hour + minutes as decimal
        return startDate.getHours() + startDate.getMinutes() / 60;
      });
    
    if (validTimes.length < 2) return 0;
    
    const mean = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const variance = validTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validTimes.length;
    
    return Math.sqrt(variance);
  }

  // ✅ Calculate wake time variability
  calculateWakeTimeVariability(summaries) {
    const validTimes = summaries
      .filter(s => s.sleep_end_time && !s.nap_only_day)
      .map(s => {
        const endDate = new Date(s.sleep_end_time);
        return endDate.getHours() + endDate.getMinutes() / 60;
      });
    
    if (validTimes.length < 2) return 0;
    
    const mean = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const variance = validTimes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / validTimes.length;
    
    return Math.sqrt(variance);
  }

  // ✅ Calculate sleep consistency score (0-100)
  calculateConsistencyScore(summaries) {
    if (summaries.length < 2) return 100;
    
    const onsetVar = this.calculateSleepOnsetVariability(summaries);
    const wakeVar = this.calculateWakeTimeVariability(summaries);
    
    // Each hour of variance reduces score by 5 points (max 20 points each)
    const onsetPenalty = Math.min(onsetVar * 5, 20);
    const wakePenalty = Math.min(wakeVar * 5, 20);
    
    return Math.max(0, 100 - onsetPenalty - wakePenalty);
  }

  // ✅ Calculate sleep debt
  calculateSleepDebt(summaries, targetHours = 7) {
    const targetMinutes = targetHours * 60;
    const mainDays = summaries.filter(s => !s.nap_only_day);
    
    if (mainDays.length === 0) return 0;
    
    const totalDebt = mainDays.reduce((sum, day) => {
      const dayDeficit = Math.max(0, targetMinutes - (day.total_sleep_minutes || 0));
      return sum + dayDeficit;
    }, 0);
    
    return Math.round(totalDebt / mainDays.length);
  }

  // ✅ Detect trend (improving or declining)
  detectTrend(summaries) {
    const mainDays = summaries
      .filter(s => !s.nap_only_day && s.total_sleep_minutes)
      .slice(-7); // Last 7 days
    
    if (mainDays.length < 3) return "insufficient_data";
    
    const firstHalf = mainDays.slice(0, Math.floor(mainDays.length / 2));
    const secondHalf = mainDays.slice(Math.floor(mainDays.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, s) => sum + s.total_sleep_minutes, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.total_sleep_minutes, 0) / secondHalf.length;
    
    const improvement = secondAvg - firstAvg;
    
    if (Math.abs(improvement) < 15) return "stable"; // Less than 15 min difference
    return improvement > 0 ? "improving" : "declining";
  }

  // ========================================
  // COMPLETE SLEEP STATISTICS
  // ========================================

  async getSleepStatistics(days = 7) {
    try {
      const summaries = await localStorageService.getSleepSummaries(days);
      
      // ✅ IMPROVED: Filter out nap-only days from main sleep calculations
      const mainSleepDays = summaries.filter(s => !s.nap_only_day);
      const napOnlyDays = summaries.filter(s => s.nap_only_day);
      
      if (mainSleepDays.length === 0) {
        return {
          // Main sleep metrics
          averageSleep: 0,
          averageEfficiency: 0,
          averageDeepSleep: 0,
          averageLightSleep: 0,
          averageFragmentation: 0,
          averageWakeBouts: 0,
          
          // ✅ Circadian & Consistency
          consistencyScore: 0,
          sleepOnsetVariability: 0,
          wakeTimeVariability: 0,
          
          // ✅ Sleep Debt & Trends
          sleepDebt: 0,
          trend: "insufficient_data",
          
          // ✅ Nap tracking
          napOnlyDaysCount: napOnlyDays.length,
          totalNapMinutes: 0,
          averageNapMinutes: 0,
          
          // ✅ Data quality
          mainSleepDaysCount: 0,
          daysWithData: 0,
          missingDays: days,
          confidenceScore: 0,
        };
      }

      // Calculate main sleep statistics
      const totalSleep = mainSleepDays.reduce((sum, s) => sum + (s.total_sleep_minutes || 0), 0);
      const totalEfficiency = mainSleepDays.reduce((sum, s) => sum + (s.sleep_efficiency || 0), 0);
      const totalDeepSleep = mainSleepDays.reduce((sum, s) => sum + (s.deep_sleep_minutes || 0), 0);
      const totalLightSleep = mainSleepDays.reduce((sum, s) => sum + (s.light_sleep_minutes || 0), 0);
      const totalFragmentation = mainSleepDays.reduce((sum, s) => sum + (s.fragmentation_count || 0), 0);
      const totalWakeBouts = mainSleepDays.reduce((sum, s) => sum + (s.wake_minutes || 0), 0);
      const totalConfidence = mainSleepDays.reduce((sum, s) => sum + (s.confidence_score || 0), 0);
      
      const count = mainSleepDays.length;
      
      // Nap statistics
      let totalNapMinutes = 0;
      napOnlyDays.forEach(day => {
        totalNapMinutes += day.nap_total_minutes || 0;
      });
      const averageNapMinutes = napOnlyDays.length > 0 ? totalNapMinutes / napOnlyDays.length : 0;
      
      // ✅ Circadian and consistency metrics
      const consistencyScore = this.calculateConsistencyScore(mainSleepDays);
      const sleepOnsetVariability = this.calculateSleepOnsetVariability(mainSleepDays);
      const wakeTimeVariability = this.calculateWakeTimeVariability(mainSleepDays);
      
      // ✅ Sleep debt and trends
      const sleepDebt = this.calculateSleepDebt(mainSleepDays, 7);
      const trend = this.detectTrend(mainSleepDays);
      
      return {
        // Main sleep metrics
        averageSleep: Math.round(totalSleep / count),
        averageEfficiency: Math.round((totalEfficiency / count) * 100),
        averageDeepSleep: Math.round(totalDeepSleep / count),
        averageLightSleep: Math.round(totalLightSleep / count),
        averageFragmentation: Math.round(totalFragmentation / count),
        averageWakeBouts: Math.round(totalWakeBouts / count),
        
        // ✅ Circadian & Consistency
        consistencyScore: Math.round(consistencyScore),
        sleepOnsetVariability: Math.round(sleepOnsetVariability * 10) / 10,
        wakeTimeVariability: Math.round(wakeTimeVariability * 10) / 10,
        
        // ✅ Sleep Debt & Trends
        sleepDebt: sleepDebt,
        trend: trend,
        
        // ✅ Nap tracking
        napOnlyDaysCount: napOnlyDays.length,
        totalNapMinutes: Math.round(totalNapMinutes),
        averageNapMinutes: Math.round(averageNapMinutes),
        
        // ✅ Data quality
        mainSleepDaysCount: count,
        daysWithData: summaries.length,
        missingDays: days - summaries.length,
        confidenceScore: Math.round((totalConfidence / count) * 100),
      };
    } catch (error) {
      console.error("Get sleep statistics error:", error);
      return {
        averageSleep: 0,
        averageEfficiency: 0,
        averageDeepSleep: 0,
        averageLightSleep: 0,
        averageFragmentation: 0,
        averageWakeBouts: 0,
        consistencyScore: 0,
        sleepOnsetVariability: 0,
        wakeTimeVariability: 0,
        sleepDebt: 0,
        trend: "error",
        napOnlyDaysCount: 0,
        totalNapMinutes: 0,
        averageNapMinutes: 0,
        mainSleepDaysCount: 0,
        daysWithData: 0,
        missingDays: days,
        confidenceScore: 0,
      };
    }
  }

  // ========================================
  // DEBUG / STATUS
  // ========================================

  async getTrackingStatus() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return { isTracking: false, autoEnabled: false };
    }

    try {
      const status = await SleepTrackingModule.getTrackingStatus();
      return status;
    } catch (error) {
      console.error("Get tracking status error:", error);
      return { isTracking: false, autoEnabled: false };
    }
  }

  // ========================================
  // UTILITY
  // ========================================

  formatTimeForNative(date) {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  async updateSleepWindow(bedtime, wakeup) {
    await localStorageService.saveSleepWindow({ bedtime, wakeup });

    const isEnabled = await this.isAutoTrackingEnabled();
    if (isEnabled) {
      await this.enableAutoTracking();
    }
  }

  async getBatteryLevel() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return 100;
    }

    try {
      const level = await SleepTrackingModule.getBatteryLevel();
      return level;
    } catch (error) {
      console.error("Get battery level error:", error);
      return 100;
    }
  }

  cleanup() {
    // No listeners to clean up in the new architecture
    // Native service manages its own lifecycle
  }
}

export default new SleepTrackingService();