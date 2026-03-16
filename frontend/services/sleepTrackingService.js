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

  async importNativeSummary() {
    if (Platform.OS !== "android" || !SleepTrackingModule) return;

    try {
      const nativeSummary = await SleepTrackingModule.getLastSleepSummary();

      if (!nativeSummary) {
        console.log("No pending native sleep summary");
        return null;
      }

      const date = nativeSummary.date;
      console.log("Found native sleep summary for:", date);

      // Check if already imported
      const existing = await localStorageService.getSleepSummary(date);
      if (existing) {
        console.log("Summary already exists for", date, "- clearing native");
        await SleepTrackingModule.clearLastSleepSummary();
        return existing;
      }

      // Convert native epoch timestamps to ISO strings
      const sleepStart = nativeSummary.sleep_start_estimated;
      const sleepEnd = nativeSummary.sleep_end_estimated;

      const summary = {
        date,
        sleep_start_estimated: typeof sleepStart === 'number' 
          ? new Date(sleepStart).toISOString() 
          : sleepStart,
        sleep_end_estimated: typeof sleepEnd === 'number' 
          ? new Date(sleepEnd).toISOString() 
          : sleepEnd,
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
        created_at: new Date().toISOString(),
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

  async logManualSleep(date, sleepStartTime, wakeTime, isNap = false) {
    try {
      const start = new Date(sleepStartTime);
      const end = new Date(wakeTime);

      let durationMinutes = (end - start) / (1000 * 60);

      if (durationMinutes < 0) {
        durationMinutes = durationMinutes + (24 * 60);
      } else if (durationMinutes > 20 * 60) {
        durationMinutes = durationMinutes - (24 * 60);
      }

      if (durationMinutes < 30) {
        throw new Error("Sleep duration must be at least 30 minutes");
      }

      if (durationMinutes > 16 * 60) {
        throw new Error(`Sleep duration calculated as ${Math.round(durationMinutes / 60)} hours. Please check your sleep and wake times.`);
      }

      const summary = {
        date,
        sleep_start_time: start.toISOString(),
        wake_time: end.toISOString(),
        sleep_duration: Math.round(durationMinutes),
        total_sleep_minutes: Math.round(durationMinutes),
        nap_session: isNap,
        sleep_source: 'manual',
        confidence_score: 1.0,
        deep_sleep_minutes: 0,
        light_sleep_minutes: 0,
        wake_minutes: 0,
        time_in_bed: Math.round(durationMinutes),
        sleep_efficiency: 1.0,
        restlessness_index: 0,
        fragmentation_count: 0,
        sleep_start_estimated: start.toISOString(),
        sleep_end_estimated: end.toISOString(),
        created_at: new Date().toISOString(),
      };

      await localStorageService.saveSleepSummary(date, summary);
      console.log("Manual sleep logged:", { date, duration: durationMinutes });

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

  async getSleepStatistics(days = 7) {
    try {
      return await localStorageService.getSleepStatistics(days);
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