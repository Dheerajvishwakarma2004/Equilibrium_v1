import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import AsyncStorage from "@react-native-async-storage/async-storage"

// Configure notification behavior for SDK 53
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
  }),
})

class NotificationService {
  constructor() {
    this.initialized = false
    this.notificationSettings = {
      moodReminders: true,
      journalReminders: true,
      wellnessAlerts: true,
      weeklyReports: true,
      crisisSupport: true, // Always enabled for safety
    }
    this.scheduledNotifications = []
  }

  calculateSecondsUntilNextTime(hour, minute) {
    const now = new Date()
    const next = new Date()
    next.setHours(hour, minute, 0, 0)

    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }

    return Math.floor((next - now) / 1000)
  }

  calculateSecondsUntilNextWeekday(weekday, hour, minute) {
    const now = new Date()
    const next = new Date()
    next.setHours(hour, minute, 0, 0)

    const currentWeekday = next.getDay()
    let daysUntil = weekday - currentWeekday

    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7
    }

    next.setDate(next.getDate() + daysUntil)

    return Math.floor((next - now) / 1000)
  }

  async initialize() {
    try {
      if (!Device.isDevice) {
        console.log("Notifications only work on physical devices")
        return false
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== "granted") {
        console.log("Notification permissions not granted")
        return false
      }

      // Load saved settings
      await this.loadNotificationSettings()

      // Schedule default notifications if enabled
      await this.scheduleDefaultNotifications()

      this.initialized = true
      console.log("NotificationService initialized successfully")
      return true
    } catch (error) {
      console.error("NotificationService initialization error:", error)
      return false
    }
  }

  async loadNotificationSettings() {
    try {
      const settings = await AsyncStorage.getItem("notificationSettings")
      if (settings) {
        this.notificationSettings = { ...this.notificationSettings, ...JSON.parse(settings) }
      }
    } catch (error) {
      console.error("Error loading notification settings:", error)
    }
  }

  async saveNotificationSettings() {
    try {
      await AsyncStorage.setItem("notificationSettings", JSON.stringify(this.notificationSettings))
    } catch (error) {
      console.error("Error saving notification settings:", error)
    }
  }

  async updateNotificationSettings(newSettings) {
    try {
      this.notificationSettings = { ...this.notificationSettings, ...newSettings }
      await this.saveNotificationSettings()

      // Reschedule notifications based on new settings
      await this.cancelAllScheduledNotifications()
      await this.scheduleDefaultNotifications()

      return true
    } catch (error) {
      console.error("Error updating notification settings:", error)
      return false
    }
  }

  async scheduleDefaultNotifications() {
    try {
      // Schedule mood reminder (daily at 10 AM)
      if (this.notificationSettings.moodReminders) {
        await this.scheduleDailyNotification({
          identifier: "mood-reminder",
          title: "Daily Check-in",
          body: "How are you feeling today? Take a moment to log your mood.",
          hour: 10,
          minute: 0,
        })
      }

      // Schedule journal reminder (daily at 8 PM)
      if (this.notificationSettings.journalReminders) {
        await this.scheduleDailyNotification({
          identifier: "journal-reminder",
          title: "Evening Reflection",
          body: "Take a few minutes to write in your journal about your day.",
          hour: 20,
          minute: 0,
        })
      }

      // Schedule weekly report (Sundays at 6 PM)
      if (this.notificationSettings.weeklyReports) {
        await this.scheduleWeeklyNotification({
          identifier: "weekly-report",
          title: "Weekly Wellness Report",
          body: "Your weekly wellness insights are ready to view.",
          weekday: 1, // Sunday
          hour: 18,
          minute: 0,
        })
      }
    } catch (error) {
      console.error("Error scheduling default notifications:", error)
    }
  }

  async scheduleDailyNotification({ identifier, title, body, hour, minute }) {
    try {
      const seconds = this.calculateSecondsUntilNextTime(hour, minute)
      const trigger = {
        type: "timeInterval",
        seconds,
        repeats: true,
      }

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: "default",
          data: { type: "daily-reminder" },
        },
        trigger,
      })

      this.scheduledNotifications.push(identifier)
    } catch (error) {
      console.error("Error scheduling daily notification:", error)
    }
  }

  async scheduleWeeklyNotification({ identifier, title, body, weekday, hour, minute }) {
    try {
      const seconds = this.calculateSecondsUntilNextWeekday(weekday, hour, minute)
      const trigger = {
        type: "timeInterval",
        seconds,
        repeats: true,
      }

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: "default",
          data: { type: "weekly-reminder" },
        },
        trigger,
      })

      this.scheduledNotifications.push(identifier)
    } catch (error) {
      console.error("Error scheduling weekly notification:", error)
    }
  }

  async sendWellnessAlert(alertData) {
    try {
      if (!this.notificationSettings.wellnessAlerts) return

      await Notifications.scheduleNotificationAsync({
        content: {
          title: alertData.title || "Wellness Alert",
          body: alertData.message,
          sound: "default",
          data: {
            type: "wellness-alert",
            severity: alertData.severity || "medium",
            ...alertData,
          },
        },
        trigger: null, // Send immediately
      })
    } catch (error) {
      console.error("Error sending wellness alert:", error)
    }
  }

  async sendCrisisNotification(message) {
    try {
      // Crisis notifications are always sent regardless of settings
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Crisis Support Available",
          body: message || "If you need immediate help, crisis resources are available 24/7.",
          sound: "default",
          data: {
            type: "crisis-support",
            priority: "high",
          },
        },
        trigger: null,
      })
    } catch (error) {
      console.error("Error sending crisis notification:", error)
    }
  }

  async cancelAllScheduledNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync()
      this.scheduledNotifications = []
    } catch (error) {
      console.error("Error canceling notifications:", error)
    }
  }

  async cancelNotification(identifier) {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier)
      this.scheduledNotifications = this.scheduledNotifications.filter((id) => id !== identifier)
    } catch (error) {
      console.error("Error canceling notification:", error)
    }
  }

  getNotificationSettings() {
    return this.notificationSettings
  }

  isInitialized() {
    return this.initialized
  }
}

export default new NotificationService()
