// sleepTrackingService.js
import { NativeModules, Platform, DeviceEventEmitter, Alert } from "react-native";
import localStorageService from "./localStorageService";

const { SleepTrackingModule } = NativeModules;

/**
 * Battery-efficient sleep tracking service
 * - Accelerometer-based motion sampling
 * - Minute-level classification
 * - Noise reduction & smoothing
 * - Battery protection
 * - Manual logging support
 */
class SleepTrackingService {
  constructor() {
    this.isTracking = false;
    this.currentSessionDate = null;
    this.motionUpdateListener = null;

    // Configurable thresholds
    this.thresholds = {
      highMotion: 0.5,      // Variance threshold for awake state
      mediumMotion: 0.2,    // Variance threshold for light sleep
      batteryProtection: 25, // Battery % below which sensors are disabled
    };
  }

  // ========================================
  // INITIALIZATION & PERMISSIONS
  // ========================================

  async initialize() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      console.log("Sleep tracking not available on this platform");
      return false;
    }

    try {
      // Request necessary permissions
      const granted = await SleepTrackingModule.requestPermissions();
      if (!granted) {
        return false;
      }

      // Set up event listener for motion updates
      this.motionUpdateListener = DeviceEventEmitter.addListener(
        'onMotionUpdate',
        (data) => this.handleMotionUpdate(data)
      );

      // Load saved tracking state
      const state = await localStorageService.getSleepTrackingState();
      this.isTracking = state.isTracking;
      this.currentSessionDate = state.currentSessionDate;

      return true;
    } catch (error) {
      console.error("Sleep tracking initialization error:", error);
      return false;
    }
  }

  async requestPermissions() {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      const granted = await SleepTrackingModule.requestPermissions();
      return granted;
    } catch (error) {
      console.error("Request permissions error:", error);
      return false;
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

      // Schedule sleep tracking
      await SleepTrackingModule.scheduleSleepTracking(bedtime, wakeup);

      // Update preferences
      const prefs = await localStorageService.getSleepPreferences();
      prefs.autoTrackingEnabled = true;
      prefs.mode = "auto_tracking";
      await localStorageService.saveSleepPreferences(prefs);

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

      // Update preferences
      const prefs = await localStorageService.getSleepPreferences();
      prefs.autoTrackingEnabled = false;
      if (prefs.mode === "auto_tracking") {
        prefs.mode = "screen_usage";
      }
      await localStorageService.saveSleepPreferences(prefs);

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
  // MANUAL TRACKING START/STOP
  // ========================================

  async startTracking(date = null) {
    if (Platform.OS !== "android" || !SleepTrackingModule) {
      return false;
    }

    try {
      const sessionDate = date || new Date().toISOString().split("T")[0];

      // Start sensor sampling
      await SleepTrackingModule.startTracking();

      // Initialize session
      this.isTracking = true;
      this.currentSessionDate = sessionDate;

      await localStorageService.saveSleepTrackingState({
        isTracking: true,
        currentSessionDate: sessionDate,
        startTime: new Date().toISOString(),
      });

      await localStorageService.saveSleepSession(sessionDate, {
        started: true,
        startTime: new Date().toISOString(),
        minuteData: [],
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
      // Stop sensor sampling
      await SleepTrackingModule.stopTracking();

      // Process the session
      if (this.currentSessionDate) {
        await this.processSession(this.currentSessionDate);
      }

      // Clear state
      this.isTracking = false;
      this.currentSessionDate = null;

      await localStorageService.saveSleepTrackingState({
        isTracking: false,
        currentSessionDate: null,
      });

      return true;
    } catch (error) {
      console.error("Stop tracking error:", error);
      return false;
    }
  }

  // ========================================
  // MOTION DATA HANDLING
  // ========================================

  async handleMotionUpdate(data) {
    if (!this.isTracking || !this.currentSessionDate) {
      return;
    }

    try {
      // Get current session
      const session = await localStorageService.getSleepSession(this.currentSessionDate);
      if (!session) return;

      // Classify sleep state based on motion variance
      const state = this.classifySleepState(
        data.movementVariance,
        data.screenActive,
        data.pickupDetected
      );

      // Add minute data
      if (!session.minuteData) {
        session.minuteData = [];
      }

      session.minuteData.push({
        timestamp: data.timestamp,
        movementVariance: data.movementVariance,
        screenActive: data.screenActive,
        pickupDetected: data.pickupDetected,
        state: state,
      });

      // Save updated session
      await localStorageService.saveSleepSession(this.currentSessionDate, session);
    } catch (error) {
      console.error("Handle motion update error:", error);
    }
  }

  classifySleepState(movementVariance, screenActive, pickupDetected) {
    // Priority classification logic
    if (screenActive) return "awake";
    if (pickupDetected) return "awake";
    if (movementVariance > this.thresholds.highMotion) return "awake";
    if (movementVariance > this.thresholds.mediumMotion) return "light_sleep";
    return "deep_sleep";
  }

  // ========================================
  // SESSION PROCESSING
  // ========================================

  async processSession(date) {
    try {
      // Get session data
      const session = await localStorageService.getSleepSession(date);
      if (!session || !session.minuteData || session.minuteData.length === 0) {
        console.log("No session data to process for", date);
        return null;
      }

      // Apply 5-minute smoothing
      const smoothedStates = this.applySmoothingFilter(session.minuteData);

      // Detect wake interruptions
      const wakeBlocks = this.detectWakeInterruptions(smoothedStates);

      // Calculate nightly metrics
      const metrics = this.calculateNightlyMetrics(
        smoothedStates,
        wakeBlocks,
        session.startTime,
        new Date().toISOString()
      );

      // Calculate confidence score
      const confidence = this.calculateConfidenceScore(
        session.minuteData,
        session.startTime,
        new Date().toISOString()
      );

      // Create nightly summary
      const summary = {
        date,
        sleep_start_estimated: session.startTime,
        sleep_end_estimated: new Date().toISOString(),
        ...metrics,
        confidence_score: confidence,
        sleep_source: "automatic",
        created_at: new Date().toISOString(),
      };

      // Save summary
      await localStorageService.saveSleepSummary(date, summary);

      // Delete session (cleanup minute data)
      await localStorageService.deleteSleepSession(date);

      return summary;
    } catch (error) {
      console.error("Process session error:", error);
      return null;
    }
  }

  applySmoothingFilter(minuteData) {
    const smoothed = [];
    const window = 2; // 2 minutes before and after

    for (let i = 0; i < minuteData.length; i++) {
      const start = Math.max(0, i - window);
      const end = Math.min(minuteData.length - 1, i + window);
      
      // Count states in window
      const stateCounts = { awake: 0, light_sleep: 0, deep_sleep: 0 };
      
      for (let j = start; j <= end; j++) {
        stateCounts[minuteData[j].state]++;
      }

      // Find most frequent state
      const mostFrequent = Object.entries(stateCounts)
        .reduce((a, b) => a[1] > b[1] ? a : b)[0];

      smoothed.push({
        ...minuteData[i],
        smoothedState: mostFrequent,
      });
    }

    return smoothed;
  }

  detectWakeInterruptions(smoothedStates) {
    const wakeBlocks = [];
    let currentWakeStart = null;
    let awakeCount = 0;

    smoothedStates.forEach((minute, index) => {
      if (minute.smoothedState === "awake") {
        if (currentWakeStart === null) {
          currentWakeStart = index;
        }
        awakeCount++;
      } else {
        // End of awake period
        if (currentWakeStart !== null && awakeCount >= 5) {
          // Only count as wake interruption if >= 5 minutes
          wakeBlocks.push({
            start: currentWakeStart,
            end: index - 1,
            duration: awakeCount,
          });
        }
        currentWakeStart = null;
        awakeCount = 0;
      }
    });

    // Handle trailing wake block
    if (currentWakeStart !== null && awakeCount >= 5) {
      wakeBlocks.push({
        start: currentWakeStart,
        end: smoothedStates.length - 1,
        duration: awakeCount,
      });
    }

    return wakeBlocks;
  }

  calculateNightlyMetrics(smoothedStates, wakeBlocks, startTime, endTime) {
    let deepSleepMinutes = 0;
    let lightSleepMinutes = 0;
    let wakeMinutes = 0;
    let movementSpikes = 0;

    smoothedStates.forEach((minute, index) => {
      switch (minute.smoothedState) {
        case "deep_sleep":
          deepSleepMinutes++;
          break;
        case "light_sleep":
          lightSleepMinutes++;
          break;
        case "awake":
          wakeMinutes++;
          break;
      }

      // Count movement spikes (for restlessness)
      if (minute.movementVariance > this.thresholds.mediumMotion) {
        movementSpikes++;
      }
    });

    const totalSleepMinutes = deepSleepMinutes + lightSleepMinutes;
    const timeInBed = (new Date(endTime) - new Date(startTime)) / (1000 * 60);
    const sleepEfficiency = timeInBed > 0 ? totalSleepMinutes / timeInBed : 0;
    const restlessnessIndex = totalSleepMinutes > 0 ? movementSpikes / totalSleepMinutes : 0;

    return {
      deep_sleep_minutes: Math.round(deepSleepMinutes),
      light_sleep_minutes: Math.round(lightSleepMinutes),
      wake_minutes: Math.round(wakeMinutes),
      total_sleep_minutes: Math.round(totalSleepMinutes),
      time_in_bed: Math.round(timeInBed),
      sleep_efficiency: Math.round(sleepEfficiency * 100) / 100,
      restlessness_index: Math.round(restlessnessIndex * 100) / 100,
      fragmentation_count: wakeBlocks.length,
    };
  }

  calculateConfidenceScore(minuteData, startTime, endTime) {
    const totalMinutes = (new Date(endTime) - new Date(startTime)) / (1000 * 60);
    const minutesWithData = minuteData.length;

    // Sensor coverage
    const sensorCoverage = totalMinutes > 0 ? minutesWithData / totalMinutes : 0;

    // Screen consistency (fewer screen events = higher confidence)
    const screenActiveCount = minuteData.filter(m => m.screenActive).length;
    const screenConsistency = 1 - (screenActiveCount / minutesWithData);

    // Weighted confidence score
    const confidence = (0.6 * sensorCoverage) + (0.4 * screenConsistency);

    return Math.round(confidence * 100) / 100;
  }

  // ========================================
  // MANUAL SLEEP LOGGING
  // ========================================

  async logManualSleep(date, sleepStartTime, wakeTime, isNap = false) {
    try {
      // Validate input
      let start = new Date(sleepStartTime);
      let end = new Date(wakeTime);
      
      // Fix midnight crossing: If end time is before or equal to start time, add 1 day to end time
      if (end <= start) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      }
      
      const durationMinutes = (end - start) / (1000 * 60);

      // Validation rules
      if (durationMinutes < 30) {
        throw new Error("Sleep duration must be at least 30 minutes");
      }

      if (durationMinutes > 16 * 60) {
        throw new Error("Sleep duration must not exceed 16 hours");
      }

      // Save manual entry
      const entry = await localStorageService.saveManualSleepEntry(date, {
        sleep_start_time: sleepStartTime,
        wake_time: wakeTime,
        sleep_duration: Math.round(durationMinutes),
        nap_session: isNap,
      });

      return entry;
    } catch (error) {
      console.error("Log manual sleep error:", error);
      throw error;
    }
  }

  // ========================================
  // BOOTSTRAP & MISSING DATA DETECTION
  // ========================================

  async checkAndShowBootstrapPrompt() {
    try {
      // Check if already shown
      const shown = await localStorageService.hasShownBootstrapPrompt();
      if (shown) return false;

      // Check if any sleep records exist
      const summaries = await localStorageService.getSleepSummaries(1);
      if (summaries.length > 0) {
        // Has data, mark as shown
        await localStorageService.markBootstrapPromptShown();
        return false;
      }

      // Show prompt
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
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      // Check if prompt already shown for yesterday
      const promptShown = await localStorageService.hasMissingSleepPromptShown(yesterdayStr);
      if (promptShown) return null;

      // Check if sleep data exists for yesterday
      const summary = await localStorageService.getSleepSummary(yesterdayStr);
      if (summary) return null; // Data exists

      // No data found, return yesterday's date
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
  // SLEEP DATA RETRIEVAL
  // ========================================

  async getLastNightSleep() {
    try {
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
  // UTILITY METHODS
  // ========================================

  formatTimeForNative(date) {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  async updateSleepWindow(bedtime, wakeup) {
    // Update sleep window in storage
    await localStorageService.saveSleepWindow({ bedtime, wakeup });

    // If auto-tracking enabled, reschedule
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

  // ========================================
  // CLEANUP
  // ========================================

  cleanup() {
    if (this.motionUpdateListener) {
      this.motionUpdateListener.remove();
      this.motionUpdateListener = null;
    }
  }
}

export default new SleepTrackingService();
