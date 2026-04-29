// BehavioralTrackingService.js

import { AppState, Alert, NativeModules, Platform, DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import authService from "./authService";
import localStorageService from "./localStorageService";
import sleepTrackingService from "./sleepTrackingService";

const { UsageStatsModule, HealthConnectModule, ActivityRecognitionModule } = NativeModules;

class BehavioralTrackingService {
  constructor() {
    this.isTracking = false;
    this.consentGiven = false;
    this.canTrackDeviceUsage = false;
    this.canTrackHealthData = false;
    this.appStateSubscription = null;
    this.screenTimeTimer = null;

    // Sleep defaults
    this.defaultSleepStart = "22:00";
    this.defaultSleepEnd = "08:00";
    this.userSleepWindow = null;

    // Activity tracking
    this.activityListeners = [];
    this.isActivityTracking = false;
    this.activityUpdateSubscription = null;
  }

  // -----------------------------
  // Sleep Window Management
  // -----------------------------
  async setUserSleepWindow(start, end) {
    this.userSleepWindow = { start, end };
    await AsyncStorage.setItem(
      "userSleepWindow",
      JSON.stringify(this.userSleepWindow)
    );
    
    // Update sleep tracking service
    const bedtime = new Date();
    const [bh, bm] = start.split(":").map(Number);
    bedtime.setHours(bh, bm, 0, 0);
    
    const wakeup = new Date();
    const [wh, wm] = end.split(":").map(Number);
    wakeup.setHours(wh, wm, 0, 0);
    
    await sleepTrackingService.updateSleepWindow(bedtime, wakeup);
  }

  async loadUserSleepWindow() {
    const saved = await AsyncStorage.getItem("userSleepWindow");
    this.userSleepWindow = saved ? JSON.parse(saved) : null;
  }

  getEffectiveSleepWindow() {
    return this.userSleepWindow || {
      start: this.defaultSleepStart,
      end: this.defaultSleepEnd,
    };
  }

  // -----------------------------
  // Permissions - Usage Stats
  // -----------------------------
  async requestUsageStatsPermission() {
    if (Platform.OS !== "android" || !UsageStatsModule) return false;

    try {
      const granted = await UsageStatsModule.requestPermission();
      this.canTrackDeviceUsage = granted;
      return granted;
    } catch (e) {
      console.error("Usage permission error:", e);
      this.canTrackDeviceUsage = false;
      return false;
    }
  }

  // -----------------------------
  // Permissions - Health Connect
  // -----------------------------
  async requestHealthConnectPermission() {
    if (Platform.OS !== "android" || !HealthConnectModule) {
      console.log("Health Connect not available on this platform");
      return false;
    }

    try {
      // Check if Health Connect is available
      const isAvailable = await HealthConnectModule.isAvailable();
      if (!isAvailable) {
        console.log("Health Connect is not installed on this device");
        return false;
      }

      // Request permissions for sleep data
      const granted = await HealthConnectModule.requestPermissions([
        "SLEEP_SESSION",
        "SLEEP_STAGE"
      ]);
      
      this.canTrackHealthData = granted;
      return granted;
    } catch (e) {
      console.error("Health Connect permission error:", e);
      this.canTrackHealthData = false;
      return false;
    }
  }

  async checkHealthConnectPermission() {
    if (Platform.OS !== "android" || !HealthConnectModule) return false;

    try {
      const hasPermission = await HealthConnectModule.hasPermissions([
        "SLEEP_SESSION",
        "SLEEP_STAGE"
      ]);
      this.canTrackHealthData = hasPermission;
      return hasPermission;
    } catch (e) {
      console.error("Check Health Connect permission error:", e);
      return false;
    }
  }

  // -----------------------------
  // Physical Activity Tracking
  // -----------------------------
  async startActivityTracking() {
    if (Platform.OS !== "android" || !ActivityRecognitionModule) {
      console.log("Activity tracking not available");
      return false;
    }

    if (this.isActivityTracking) {
      return true;
    }

    try {
      // Request permission
      const granted = await ActivityRecognitionModule.requestPermission();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Please enable Activity Recognition and Location permissions in settings."
        );
        return false;
      }

      // Load user profile
      const profile = await localStorageService.getUserProfile();
      if (profile && profile.weight && profile.height && profile.age) {
        await ActivityRecognitionModule.setUserProfile(
          profile.weight,
          profile.height,
          profile.age
        );
      }

      // Load goals
      const goals = await localStorageService.getActivityGoals();
      if (goals && goals.steps && goals.activeMinutes) {
        await ActivityRecognitionModule.setGoals(
          goals.steps,
          goals.activeMinutes
        );
      }

      // Start tracking
      await ActivityRecognitionModule.startTracking();
      this.isActivityTracking = true;

      // Set up event listener using DeviceEventEmitter
      this.activityUpdateSubscription = DeviceEventEmitter.addListener(
        'onActivityUpdate',
        (data) => this.handleActivityUpdate(data)
      );

      return true;
    } catch (error) {
      console.error("Start activity tracking error:", error);
      return false;
    }
  }

  async stopActivityTracking() {
    if (Platform.OS !== "android" || !ActivityRecognitionModule) return;

    try {
      await ActivityRecognitionModule.stopTracking();
      this.isActivityTracking = false;

      if (this.activityUpdateSubscription) {
        this.activityUpdateSubscription.remove();
        this.activityUpdateSubscription = null;
      }

      // Clear listeners
      this.activityListeners = [];
    } catch (error) {
      console.error("Stop activity tracking error:", error);
    }
  }

  async handleActivityUpdate(data) {
    // Save real-time data
    const today = new Date().toISOString().split("T")[0];
    try {
      if (data?.type === "step_update" && typeof data.newSteps === "number") {
        const existing = await localStorageService.getTodayActivityData();
        const updatedSteps = (existing?.steps || 0) + data.newSteps;
        await localStorageService.saveActivityData(today, { steps: updatedSteps });
      } else {
        await localStorageService.saveActivityData(today, data);
      }
    } catch (error) {
      console.error("Save activity update error:", error);
    }

    // Notify all listeners
    this.activityListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error("Activity listener error:", error);
      }
    });
  }

  // -----------------------------
  // Activity Listener Management
  // -----------------------------
  addActivityListener(listener) {
    if (typeof listener !== 'function') {
      console.error('Activity listener must be a function');
      return () => {}; // Return empty unsubscribe function
    }

    this.activityListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.activityListeners.indexOf(listener);
      if (index > -1) {
        this.activityListeners.splice(index, 1);
      }
    };
  }

  removeActivityListener(listener) {
    const index = this.activityListeners.indexOf(listener);
    if (index > -1) {
      this.activityListeners.splice(index, 1);
    }
  }

  // -----------------------------
  // Activity Data Methods
  // -----------------------------
  async getCurrentActivityData() {
    if (Platform.OS !== "android" || !ActivityRecognitionModule) {
      return this.getEmptyActivityData();
    }

    try {
      const currentData = await ActivityRecognitionModule.getCurrentActivityData();
      const goals = await localStorageService.getActivityGoals();

      const today = new Date().toISOString().split("T")[0];
      if (currentData && currentData.steps !== undefined) {
        await localStorageService.saveActivityData(today, currentData);
      }
      
      return {
        ...currentData,
        goals: goals || { steps: 10000, activeMinutes: 30 },
        stepsProgress: (currentData.steps / (goals?.steps || 10000)) * 100,
        activeProgress: (currentData.activeMinutes / (goals?.activeMinutes || 30)) * 100,
      };
    } catch (error) {
      console.error("Get current activity error:", error);
      return this.getEmptyActivityData();
    }
  }

  async getWeeklyActivityData() {
    if (Platform.OS !== "android" || !ActivityRecognitionModule) {
      return [];
    }

    try {
      const weekData = await ActivityRecognitionModule.getWeeklyData();
      return weekData || [];
    } catch (error) {
      console.error("Get weekly data error:", error);
      return [];
    }
  }

  async setUserProfile(weight, height, age) {
    await localStorageService.saveUserProfile({ weight, height, age });
    
    if (Platform.OS === "android" && ActivityRecognitionModule) {
      try {
        await ActivityRecognitionModule.setUserProfile(weight, height, age);
      } catch (error) {
        console.error("Set user profile error:", error);
      }
    }
  }

  async setActivityGoals(steps, activeMinutes) {
    await localStorageService.saveActivityGoals({ steps, activeMinutes });
    
    if (Platform.OS === "android" && ActivityRecognitionModule) {
      try {
        await ActivityRecognitionModule.setGoals(steps, activeMinutes);
      } catch (error) {
        console.error("Set goals error:", error);
      }
    }
  }

  getEmptyActivityData() {
    return {
      steps: 0,
      distance: 0,
      calories: 0,
      activeMinutes: 0,
      moveMinutes: 0,
      heartPoints: 0,
      isTracking: false,
      activityType: "stationary",
      goals: { steps: 10000, activeMinutes: 30 },
      stepsProgress: 0,
      activeProgress: 0,
    };
  }

  // -----------------------------
  // Physical Activity (Legacy - Device-based)
  // -----------------------------
  async getTodayActivityMinutes() {
    const today = new Date().toISOString().split("T")[0]

    // Get activity minutes from Health Connect
    if (Platform.OS === "android" && ActivityRecognitionModule) {
      try {
        const granted = await ActivityRecognitionModule.requestPermission()
        if (granted) {
          const minutes = await ActivityRecognitionModule.getTodayActivityMinutes()
          await localStorageService.saveActivityData(today, {
            activeMinutes: minutes,
            source: "sensor"
          })
          return minutes
        }
      } catch (error) {
        console.error("Get today activity minutes error:", error)
      }
    }

    return 0
  }

  // -----------------------------
  // Initialization
  // -----------------------------
  async initializeTracking() {
    await this.loadUserSleepWindow();
    
    // Initialize sleep tracking service
    await sleepTrackingService.initialize();
    
    // Start activity tracking
    await this.startActivityTracking();
    
    const user = authService.getCurrentUser();
    if (!user?.consentFlags?.usageTracking) return;

    this.consentGiven = true;
    
    // Request usage stats permission
    const usageGranted = await this.requestUsageStatsPermission();
    if (!usageGranted) {
      Alert.alert(
        "Permission Required",
        "Enable Usage Access for Equilibrium in system settings."
      );
      return;
    }

    // Check if user has fitness tracking enabled
    const sleepPrefs = await localStorageService.getSleepPreferences();
    if (sleepPrefs.mode === "fitness_band") {
      await this.checkHealthConnectPermission();
    }

    this.startTracking();
  }

  startTracking() {
    if (this.isTracking) return;
    this.isTracking = true;

    this.appStateSubscription = AppState.addEventListener("change", () => {});
    this.screenTimeTimer = setInterval(() => {}, 60 * 1000);
  }

  stopTracking() {
    this.isTracking = false;
    this.appStateSubscription?.remove();
    if (this.screenTimeTimer) clearInterval(this.screenTimeTimer);
    this.stopActivityTracking();
    sleepTrackingService.cleanup();
  }

  // -----------------------------
  // Usage Stats (SOURCE OF TRUTH)
  // -----------------------------
  async getDailyUsageStats() {
    if (!this.consentGiven || !this.canTrackDeviceUsage || !UsageStatsModule) {
      return this.emptyUsage();
    }

    try {
      const usage = await UsageStatsModule.getUsageStats();
      const apps = Array.isArray(usage.apps) ? usage.apps : [];

      // Sort by usage DESC
      apps.sort((a, b) => b.durationMinutes - a.durationMinutes);

      const screenTimeMinutes = Math.round((usage.totalScreenTime || 0) / 60);

      // Get sleep data based on user preference
      const sleepData = await this.getSleepDataFromUsage(usage)

      const activityMinutes = await this.getTodayActivityMinutes()

      // Save screen usage sleep estimation
      if (sleepData.source === "inactivity") {
        const today = new Date().toISOString().split("T")[0]
        await localStorageService.saveScreenUsageSleepData(today, {
          estimatedSleepMinutes: sleepData.estimatedSleepMinutes,
          estimatedSleepHours: sleepData.estimatedSleepMinutes / 60,
          confidence: sleepData.confidence,
          sleepWindow: this.getEffectiveSleepWindow(),
        });
      }

      const usageData = {
        screenTimeMinutes,
        pickupCount: usage.pickupCount || 0,
        activityMinutes,
        appUsage: apps.map(app => ({
          appName: app.appName || app.package,
          package: app.package,
          durationMinutes: Math.round(app.durationMinutes || 0),
        })),
        sleepData,
      };

      // ✅ SAVE DAILY USAGE DATA for lifecycle aggregation
      const today = new Date().toISOString().split("T")[0];
      await this.saveDailyUsageStats(today, usageData);

      return usageData;
    } catch (e) {
      console.error("Native usage error:", e);
      return this.emptyUsage();
    }
  }

  emptyUsage() {
    return {
      screenTimeMinutes: 0,
      pickupCount: 0,
      activityMinutes: 0,
      appUsage: [],
      sleepData: {
        source: "none",
        estimatedSleepMinutes: 0,
        confidence: 0,
      },
    };
  }

  // -----------------------------
  // Sleep Resolution (Priority System)
  // -----------------------------
  async getSleepDataFromUsage(usage) {
    const prefs = await localStorageService.getSleepPreferences()

    // Priority 1: Auto tracking (new accelerometer-based)
    if (prefs.mode === "auto_tracking" && prefs.autoTrackingEnabled) {
      const lastNight = await sleepTrackingService.getLastNightSleep();
      if (lastNight) {
        return {
          source: "auto_tracking",
          estimatedSleepMinutes: lastNight.total_sleep_minutes,
          confidence: lastNight.confidence_score,
          deepSleepMinutes: lastNight.deep_sleep_minutes,
          lightSleepMinutes: lastNight.light_sleep_minutes,
          wakeMinutes: lastNight.wake_minutes,
          efficiency: lastNight.sleep_efficiency,
        };
      }
    }

    // Priority 2: Fitness band
    if (prefs.mode === "fitness_band" && prefs.fitnessConnected) {
      const hc = await this.getHealthConnectSleepData()
      if (hc) return hc
    }

    // Fallback: inactivity-based estimation
    return this.calculateSleepDataFromEvents(usage.events)
  }

  // -----------------------------
  // Health Connect Sleep Data
  // -----------------------------
  async getHealthConnectSleepData() {
    if (Platform.OS !== "android" || !HealthConnectModule) return null;

    try {
      // Check permission first
      const hasPermission = await this.checkHealthConnectPermission();
      if (!hasPermission) {
        console.log("No Health Connect permission");
        return null;
      }

      // Get sleep data from yesterday to now
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

      const sleepSessions = await HealthConnectModule.readSleepSessions(
        startTime.toISOString(),
        endTime.toISOString()
      );

      if (!sleepSessions || sleepSessions.length === 0) {
        console.log("No sleep sessions found");
        return null;
      }

      // Get the most recent sleep session
      const latestSession = sleepSessions[0];
      
      if (latestSession && latestSession.durationMinutes > 0) {
        return {
          source: "health_connect",
          estimatedSleepMinutes: Math.round(latestSession.durationMinutes),
          confidence: latestSession.confidence ?? 0.95,
          stages: latestSession.stages || [],
          startTime: latestSession.startTime,
          endTime: latestSession.endTime,
        };
      }

      return null;
    } catch (error) {
      console.error("Health Connect sleep data error:", error);
      return null;
    }
  }

  calculateSleepDataFromEvents(events = []) {
    if (!events.length) {
      return {
        source: "inactivity",
        estimatedSleepMinutes: 0,
        confidence: 0,
      }
    }

    const { start, end } = this.getEffectiveSleepWindow()

    const today = new Date().toISOString().split("T")[0]
    const [sh, sm] = start.split(":").map(Number)
    const [eh, em] = end.split(":").map(Number)

    const windowStart = new Date(today)
    windowStart.setHours(sh, sm, 0, 0)

    const windowEnd = new Date(today)
    windowEnd.setHours(eh, em, 0, 0)
    if (windowEnd <= windowStart) windowEnd.setDate(windowEnd.getDate() + 1)

    const sorted = events
      .map(e => ({ ...e, time: new Date(e.timestamp) }))
      .filter(e => e.time >= windowStart && e.time <= windowEnd)
      .sort((a, b) => a.time - b.time)

    let sleepMinutes = 0
    let lastActive = windowStart

    for (const ev of sorted) {
      const gap = (ev.time - lastActive) / 60000

      // Only count sleep AFTER 30 min inactivity
      if (gap >= 30) {
        sleepMinutes += (gap - 30)
      }

      // Any interaction resets sleep
      lastActive = ev.time
    }

    const tailGap = (windowEnd - lastActive) / 60000
    if (tailGap >= 30) {
      sleepMinutes += (tailGap - 30)
    }

    sleepMinutes = Math.max(0, Math.min(sleepMinutes, (windowEnd - windowStart) / 60000))

    return {
      source: "inactivity",
      estimatedSleepMinutes: Math.round(sleepMinutes),
      confidence: Math.min(0.85, sleepMinutes / ((windowEnd - windowStart) / 60000)),
    }
  }

  // -----------------------------
  // Helper: Get Sleep Summary for Reports
  // -----------------------------
  async getSleepSummary(days = 7) {
    try {
      const sleepPrefs = await localStorageService.getSleepPreferences();
      let sleepData = [];

      if (sleepPrefs.mode === "auto_tracking" && sleepPrefs.autoTrackingEnabled) {
        sleepData = await sleepTrackingService.getSleepSummaries(days);
      } else if (sleepPrefs.mode === "fitness_band" && sleepPrefs.fitnessConnected) {
        sleepData = await localStorageService.getFitnessSleepData(days);
      } else {
        sleepData = await localStorageService.getScreenUsageSleepData(days);
      }

      return {
        mode: sleepPrefs.mode,
        data: sleepData,
        average: this.calculateAverageSleep(sleepData),
      };
    } catch (error) {
      console.error("Get sleep summary error:", error);
      return { mode: "screen_usage", data: [], average: 0 };
    }
  }

  calculateAverageSleep(sleepData) {
    if (!sleepData || sleepData.length === 0) return 0;
    
    const total = sleepData.reduce((sum, day) => {
      return sum + (day.sleepHours || day.estimatedSleepHours || day.total_sleep_minutes / 60 || 0);
    }, 0);
    
    return total / sleepData.length;
  }

  // ========================================
  // Usage Stats Aggregation (for insights)
  // ========================================

  /**
   * Save daily usage stats to local storage for later aggregation
   */
  async saveDailyUsageStats(date, usageData) {
    try {
      if (!this.consentGiven || !this.canTrackDeviceUsage) {
        return false;
      }

      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
      const daily = await localStorageService.getItem('app_usage_daily') || {};

      daily[dateStr] = {
        date: dateStr,
        screenTimeMinutes: usageData.screenTimeMinutes || 0,
        pickupCount: usageData.pickupCount || 0,
        appUsage: usageData.appUsage || [],
        activityMinutes: usageData.activityMinutes || 0,
        lastUpdated: new Date().toISOString(),
      };

      await localStorageService.setItem('app_usage_daily', daily);
      return true;
    } catch (error) {
      console.error('Error saving daily usage stats:', error);
      return false;
    }
  }

  /**
   * Get weekly usage stats for analytics and insights
   * Returns aggregated data from past 7 days for weekly insight generation
   */
  async getWeeklyUsageStats() {
    try {
      if (!this.consentGiven || !this.canTrackDeviceUsage) {
        return [];
      }

      // Import app usage lifecycle service for aggregation
      const appUsageLifecycleService = await import('./appUsageLifecycleService.js').then(m => m.default);
      
      // Return last 7 days of aggregated usage data
      const usageData = await appUsageLifecycleService.getWeeklyUsage(7);
      return usageData;
    } catch (error) {
      console.error('Error getting weekly usage stats:', error);
      return [];
    }
  }

  /**
   * Get usage trend analysis for wellness patterns
   */
  async getUsageTrendAnalysis() {
    try {
      if (!this.consentGiven || !this.canTrackDeviceUsage) {
        return { trend: 'no_consent', trendStrength: 0 };
      }

      const appUsageLifecycleService = await import('./appUsageLifecycleService.js').then(m => m.default);
      return await appUsageLifecycleService.getTrendAnalysis();
    } catch (error) {
      console.error('Error getting usage trend analysis:', error);
      return { trend: 'error', trendStrength: 0 };
    }
  }

  /**
   * Get monthly usage patterns for long-term insights
   */
  async getMonthlyUsagePatterns() {
    try {
      if (!this.consentGiven || !this.canTrackDeviceUsage) {
        return [];
      }

      const appUsageLifecycleService = await import('./appUsageLifecycleService.js').then(m => m.default);
      return await appUsageLifecycleService.getMonthlyUsage();
    } catch (error) {
      console.error('Error getting monthly usage patterns:', error);
      return [];
    }
  }
}

export default new BehavioralTrackingService();
