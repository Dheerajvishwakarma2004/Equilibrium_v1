import localStorageService from "./localStorageService"
import notificationService from "./notificationService"

const STORAGE_KEYS = {
  ALERT_SETTINGS: "tiered_alert_settings",
  ALERT_STATE: "tiered_alert_state",
}

const DEFAULT_SETTINGS = {
  enabled: false,
  sendNotifications: false,
  maxAlertsPerRun: 2,
  cooldownHours: 12,
}

class TieredAlertService {
  constructor() {
    this._settings = { ...DEFAULT_SETTINGS }
    this._initialized = false
  }

  async initialize() {
    if (this._initialized) return
    await localStorageService.initialize()
    const stored = await localStorageService.getItem(STORAGE_KEYS.ALERT_SETTINGS)
    if (stored) this._settings = { ...DEFAULT_SETTINGS, ...stored }
    this._initialized = true
  }

  async getSettings() {
    await this.initialize()
    return { ...this._settings }
  }

  async setEnabled(enabled) {
    await this.initialize()
    this._settings.enabled = !!enabled
    await localStorageService.setItem(STORAGE_KEYS.ALERT_SETTINGS, this._settings)
  }

  async setNotificationsEnabled(enabled) {
    await this.initialize()
    this._settings.sendNotifications = !!enabled
    await localStorageService.setItem(STORAGE_KEYS.ALERT_SETTINGS, this._settings)
  }

  async evaluateAlerts({ dateStr, wellnessScore, previousScore, components = {} }) {
    await this.initialize()
    if (!this._settings.enabled) return []

    const alerts = []
    const sleepSummary = await this._getTodaySleepSummary()
    const moodScore = await this._getTodayMoodScore(dateStr)
    const usage = await this._getTodayUsage(dateStr)
    const activity = await this._getTodayActivity(dateStr)

    // Overall wellness drops
    if (typeof wellnessScore === "number") {
      if (wellnessScore < 35) {
        alerts.push(this._buildAlert({
          key: "wellness_critical",
          area: "Wellness",
          severity: "critical",
          message: "Your wellness score is in a critical range today.",
          recommendation: "Pause, rest, and consider reaching out for support.",
        }))
      } else if (wellnessScore < 45) {
        alerts.push(this._buildAlert({
          key: "wellness_low",
          area: "Wellness",
          severity: "high",
          message: "Your wellness score is notably low today.",
          recommendation: "Try to reduce stressors and prioritize recovery.",
        }))
      }
    }

    if (typeof previousScore === "number" && typeof wellnessScore === "number") {
      const drop = previousScore - wellnessScore
      if (drop >= 20) {
        alerts.push(this._buildAlert({
          key: "wellness_drop_critical",
          area: "Wellness",
          severity: "high",
          message: `Large wellness drop detected (${previousScore} → ${wellnessScore}).`,
          recommendation: "Slow down today and focus on basic self-care.",
        }))
      } else if (drop >= 12) {
        alerts.push(this._buildAlert({
          key: "wellness_drop_medium",
          area: "Wellness",
          severity: "medium",
          message: `Wellness dipped compared to yesterday (${previousScore} → ${wellnessScore}).`,
          recommendation: "Short breaks and a calmer evening may help stabilize.",
        }))
      }
    }

    // Sleep-based alerts
    if (sleepSummary?.total_sleep_minutes) {
      const sleepMinutes = sleepSummary.total_sleep_minutes
      if (sleepMinutes < 240) {
        alerts.push(this._buildAlert({
          key: "sleep_critical",
          area: "Sleep",
          severity: "critical",
          message: "Severely short sleep detected (under 4 hours).",
          recommendation: "If possible, prioritize rest or a recovery nap today.",
        }))
      } else if (sleepMinutes < 360) {
        alerts.push(this._buildAlert({
          key: "sleep_high",
          area: "Sleep",
          severity: "high",
          message: "Sleep was below 6 hours last night.",
          recommendation: "Aim for an earlier bedtime to recover.",
        }))
      } else if (sleepMinutes < 420) {
        alerts.push(this._buildAlert({
          key: "sleep_medium",
          area: "Sleep",
          severity: "medium",
          message: "Sleep was below the 7-hour target.",
          recommendation: "Try to extend sleep by 30-60 minutes tonight.",
        }))
      }

      if ((sleepSummary.sleep_efficiency || 0) < 0.7) {
        alerts.push(this._buildAlert({
          key: "sleep_efficiency",
          area: "Sleep",
          severity: "medium",
          message: "Sleep efficiency was low last night.",
          recommendation: "Consider a calmer wind-down routine before bed.",
        }))
      }
    }

    // Mood alerts
    if (typeof moodScore === "number") {
      if (moodScore <= 30) {
        alerts.push(this._buildAlert({
          key: "mood_critical",
          area: "Mood",
          severity: "critical",
          message: "Mood score is very low today.",
          recommendation: "Reach out to a trusted person or support line.",
        }))
      } else if (moodScore <= 45) {
        alerts.push(this._buildAlert({
          key: "mood_high",
          area: "Mood",
          severity: "high",
          message: "Mood score is low today.",
          recommendation: "A short recovery activity may help (walk, journaling, breathing).",
        }))
      } else if (moodScore <= 55) {
        alerts.push(this._buildAlert({
          key: "mood_medium",
          area: "Mood",
          severity: "medium",
          message: "Mood looks a bit lower than usual.",
          recommendation: "Take a short break and check in with yourself.",
        }))
      }
    }

    // Screen usage alerts
    if (usage?.screenTimeMinutes) {
      const screenMinutes = usage.screenTimeMinutes
      if (screenMinutes >= 720) {
        alerts.push(this._buildAlert({
          key: "screen_critical",
          area: "Screen Habits",
          severity: "critical",
          message: "Screen time is extremely high today (12h+).",
          recommendation: "Consider a hard stop and a longer offline block.",
        }))
      } else if (screenMinutes >= 480) {
        alerts.push(this._buildAlert({
          key: "screen_high",
          area: "Screen Habits",
          severity: "high",
          message: "Screen time is very high today (8h+).",
          recommendation: "Try a 30-60 minute phone-free block.",
        }))
      } else if (screenMinutes >= 360) {
        alerts.push(this._buildAlert({
          key: "screen_medium",
          area: "Screen Habits",
          severity: "medium",
          message: "Screen time is elevated today (6h+).",
          recommendation: "Add a few short breaks away from your phone.",
        }))
      }

      if ((usage.nightScreenMinutes || 0) >= 180) {
        alerts.push(this._buildAlert({
          key: "night_screen_high",
          area: "Screen Habits",
          severity: "high",
          message: "Late-night screen use is very high.",
          recommendation: "Consider a screen-free wind-down before sleep.",
        }))
      }
    }

    // Activity alerts
    if (activity?.active_minutes !== undefined || activity?.steps !== undefined) {
      const steps = activity.steps || 0
      const moveMinutes = activity.moveMinutes ?? activity.activeMinutes ?? activity.active_minutes ?? 0
      const movementMinutes = Number(moveMinutes) || 0
      const fallbackMinutes = movementMinutes > 0 ? movementMinutes : Math.round(steps / 120)

      if (fallbackMinutes < 15) {
        alerts.push(this._buildAlert({
          key: "activity_low",
          area: "Activity",
          severity: "medium",
          message: "Very low activity detected today.",
          recommendation: "Try to reach at least 30 minutes of movement today.",
        }))
      }
    }

    const filtered = await this._applyCooldown(alerts)
    const sorted = this._sortBySeverity(filtered)
    const trimmed = sorted.slice(0, this._settings.maxAlertsPerRun)

    if (this._settings.sendNotifications) {
      await this._notifyAlerts(trimmed)
    }

    return trimmed
  }

  async _getTodaySleepSummary() {
    const summaries = await localStorageService.getSleepSummaries(1)
    return summaries?.[0] || null
  }

  async _getTodayMoodScore(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split("T")[0]
    const journal = await localStorageService.getDailyJournal(dateStr)
    if (!journal) return null
    const score = journal.currentScore ?? journal.mood_score
    return typeof score === "number" ? score : null
  }

  async _getTodayUsage(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split("T")[0]
    const daily = await localStorageService.getItem("app_usage_daily") || {}
    const entry = daily[dateStr]
    if (!entry) return null
    return {
      screenTimeMinutes: entry.screenTimeMinutes || 0,
      pickupCount: entry.pickupCount || 0,
      nightScreenMinutes: entry.nightScreenMinutes || 0,
    }
  }

  async _getTodayActivity(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split("T")[0]
    const activity = await localStorageService.getActivityData(1, dateStr)
    return activity?.[0] || null
  }

  _buildAlert({ key, area, severity, message, recommendation }) {
    return {
      id: `${key}_${Date.now()}`,
      key,
      area,
      severity,
      message,
      recommendation,
      created_at: new Date().toISOString(),
    }
  }

  async _applyCooldown(alerts) {
    if (!alerts.length) return []

    const state = await localStorageService.getItem(STORAGE_KEYS.ALERT_STATE) || {}
    const now = Date.now()
    const cooldownMs = this._settings.cooldownHours * 60 * 60 * 1000
    const result = []

    alerts.forEach((alert) => {
      const lastAt = state[alert.key]?.lastAt
      if (alert.severity === "critical" || !lastAt || now - lastAt > cooldownMs) {
        result.push(alert)
        state[alert.key] = { lastAt: now, lastSeverity: alert.severity }
      }
    })

    await localStorageService.setItem(STORAGE_KEYS.ALERT_STATE, state)
    return result
  }

  _sortBySeverity(alerts) {
    const order = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...alerts].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))
  }

  async _notifyAlerts(alerts) {
    if (!alerts.length) return
    await notificationService.initialize()
    await Promise.all(alerts.map((alert) => notificationService.sendWellnessAlert({
      title: `${alert.area} Alert`,
      message: alert.message,
      severity: alert.severity,
      recommendation: alert.recommendation,
    })))
  }
}

export default new TieredAlertService()
