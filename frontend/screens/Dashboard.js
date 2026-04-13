"use client"

import { useState, useEffect, useRef } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Dimensions, Modal, TextInput,
  KeyboardAvoidingView, Platform, Vibration, Animated,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import SafeAreaWrapper from "../components/SafeAreaWrapper"
import authService from "../services/authService"
import localStorageService from "../services/localStorageService"
import journalService from "../services/journalService"
import onDeviceAIService from "../services/onDeviceAIService"
import behavioralTrackingService from "../services/behavioralTrackingService"
import wellnessScoreService from "../services/wellnessScoreService"
import devModeService from "../services/devsModeService"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const IS_TABLET = SCREEN_WIDTH > 768
const CARD_RADIUS = 20
const ACCENT = "#6366f1"

// ─────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 5)  return "Still up?"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  if (h < 21) return "Good evening"
  return "Good night"
}

const getScoreColor = (score) => {
  if (score >= 80) return "#10b981"
  if (score >= 60) return "#f59e0b"
  return "#ef4444"
}

const getScoreLabel = (score) => {
  if (score >= 85) return "Excellent"
  if (score >= 70) return "Good"
  if (score >= 55) return "Moderate"
  if (score >= 40) return "Low"
  return "Critical"
}

const getMoodColor = (label) => {
  if (label === "positive") return { bg: "#d1fae5", text: "#065f46" }
  if (label === "neutral")  return { bg: "#fef3c7", text: "#78350f" }
  return { bg: "#fee2e2", text: "#7f1d1d" }
}

const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1)

// Sort insights so highest severity surfaces first
const sortByImpact = (insights = []) => {
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...insights].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))
}

// Derive "today's focus" from component scores + alerts
const getDailyFocus = (components, alerts = []) => {
  const critical = alerts.find((a) => a.severity === "critical" || a.severity === "high")
  if (critical) {
    return {
      area: critical.area || "Wellness",
      message: critical.message,
      action: critical.recommendation || "Address this for better wellness.",
      color: "#ef4444",
      bgColor: "#fef2f2",
      borderColor: "#fecaca",
      icon: "warning-outline",
    }
  }

  const candidates = [
    {
      key: "sleep", score: components.sleep, label: "Sleep",
      action: "Aim to sleep within the same 1-hour window tonight.",
      icon: "moon-outline", color: "#6366f1", bgColor: "#eef2ff", borderColor: "#c7d2fe",
    },
    {
      key: "mood", score: components.mood, label: "Mood",
      action: "Try 5 minutes of journaling or slow breathing.",
      icon: "heart-outline", color: "#ec4899", bgColor: "#fdf2f8", borderColor: "#fbcfe8",
    },
    {
      key: "behavior", score: components.behavior, label: "Screen Habits",
      action: "Keep your phone face-down for one hour this evening.",
      icon: "phone-portrait-outline", color: "#10b981", bgColor: "#f0fdf4", borderColor: "#bbf7d0",
    },
    {
      key: "activity", score: components.activity, label: "Activity",
      action: "A 15-minute walk will meaningfully lift your score.",
      icon: "walk-outline", color: "#f59e0b", bgColor: "#fffbeb", borderColor: "#fde68a",
    },
  ]

  const weakest = candidates.sort((a, b) => a.score - b.score)[0]

  if (weakest.score >= 75) {
    return {
      area: "Consistency",
      message: "You're doing well across every area today.",
      action: "Keep up your current habits to hold the score high.",
      icon: "checkmark-circle-outline",
      color: "#10b981", bgColor: "#f0fdf4", borderColor: "#bbf7d0",
    }
  }

  return {
    area: weakest.label,
    message: `${weakest.label} is your lowest-scoring area right now.`,
    action: weakest.action,
    icon: weakest.icon,
    color: weakest.color,
    bgColor: weakest.bgColor,
    borderColor: weakest.borderColor,
  }
}

const getTrendNarrative = (trend) => {
  if (!trend || trend.direction === "insufficient_data") return null
  const { direction, strength } = trend
  if (direction === "improving") return `Up ${strength || "a few"} points recently — keep going.`
  if (direction === "declining") return `Down ${strength || "a few"} points. Small resets help.`
  return "Holding steady. Consistency is its own win."
}

// Calculate weekly delta for score card
const getWeeklyDelta = (currentScore, wellnessScore) => {
  if (!wellnessScore?.weekly_scores || wellnessScore.weekly_scores.length < 2) return null
  const scores = wellnessScore.weekly_scores
  const previousWeekAvg = scores.length > 7 
    ? scores.slice(-14, -7).reduce((a, b) => a + b, 0) / 7 
    : null
  
  if (!previousWeekAvg) return null
  const delta = Math.round(currentScore - previousWeekAvg)
  return delta !== 0 ? delta : null
}

// Get focus area for new users (weakest component)
const getFocusArea = (components) => {
  const areas = [
    { label: "Sleep", icon: "moon", score: components.sleep, color: "#6366f1" },
    { label: "Mood", icon: "happy", score: components.mood, color: "#ec4899" },
    { label: "Behavior", icon: "phone-portrait", score: components.behavior, color: "#10b981" },
    { label: "Activity", icon: "walk", score: components.activity, color: "#f59e0b" },
  ]
  const weakest = areas.reduce((a, b) => a.score < b.score ? a : b)
  return weakest
}

// Get recent journal entries from journalService (where data is actually stored)
const getRecentJournalEntries = async (days = 3) => {
  try {
    const entries = []
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split("T")[0]
      
      const journalResult = await journalService.getJournal(dateStr)
      if (!journalResult.success || !journalResult.journal) continue
      
      const journal = journalResult.journal
      if (!journal.logs || journal.logs.length === 0) continue
      
      // Find latest mood log
      const moodLog = [...journal.logs]
        .reverse()
        .find(log => log.type === "mood" && !log.deleted)
      
      // Combine text entries
      const textLogs = journal.logs.filter(log => log.type === "text" && !log.deleted)
      const content = textLogs.length > 0
        ? textLogs.map(log => log.text).join(" ")
        : (moodLog?.text || "")
      
      entries.push({
        mood_label: moodLog?.moodLabel || journal.currentSentiment || "neutral",
        timestamp: journal.logs[0]?.timestamp || new Date().toISOString(),
        content: content,
        sentiment_score: journal.currentScore || 50,
        anomaly_flag: false,
      })
    }
    return entries
  } catch (error) {
    console.error("Error getting recent journal entries:", error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// Animated score ring
const ScoreRing = ({ score, color, onPress, devMode }) => {
  const pulse = useRef(new Animated.Value(1)).current
  const shadowBlur = useRef(new Animated.Value(8)).current

  useEffect(() => {
    // Dev mode tap pulse
    if (devMode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start()
    } else {
      pulse.setValue(1)
    }

    // Always-on shadow breathing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(shadowBlur, { toValue: 20, duration: 2000, useNativeDriver: false }),
        Animated.timing(shadowBlur, { toValue: 8, duration: 2000, useNativeDriver: false }),
      ])
    ).start()
  }, [devMode])

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {/* Outer wrapper: shadow animation (JS driver) */}
      <Animated.View style={{ 
        shadowRadius: shadowBlur,
        shadowColor: color,
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 0 },
      }}>
        {/* Inner wrapper: scale animation (native driver) */}
        <Animated.View style={{ 
          transform: [{ scale: pulse }],
        }}>
          {/* Outer glow ring */}
          <View style={[scoreRingStyles.glow, { borderColor: color + "40" }]}>
            <View style={[scoreRingStyles.ring, { borderColor: color, backgroundColor: color + "15" }]}>
              <Text style={[scoreRingStyles.number, { color }]}>{score}</Text>
              <Text style={[scoreRingStyles.outOf, { color: color + "99" }]}>/100</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  )
}

const scoreRingStyles = StyleSheet.create({
  glow: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  ring: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2.5,
    justifyContent: "center", alignItems: "center",
  },
  number: {
    fontSize: 24, fontWeight: "800",
    letterSpacing: -0.8, lineHeight: 28,
  },
  outOf: {
    fontSize: 9, fontWeight: "600",
    marginTop: -2,
  },
})

// Key Drivers card - shows impact breakdown
const KeyDriversCard = ({ components, alerts }) => {
  if (!components) return null
  
  // Calculate estimated impact (simplified)
  const drivers = [
    { key: "sleep", label: "Sleep", icon: "moon", score: components.sleep, weight: 0.40, baseline: 65 },
    { key: "mood", label: "Mood", icon: "happy", score: components.mood, weight: 0.35, baseline: 70 },
    { key: "behavior", label: "Behavior", icon: "phone-portrait", score: components.behavior, weight: 0.20, baseline: 72 },
    { key: "activity", label: "Activity", icon: "walk", score: components.activity, weight: 0.05, baseline: 68 },
  ]
    .map((d) => ({
      ...d,
      delta: Math.round(d.score - d.baseline),
      impact: Math.round((d.score - d.baseline) * d.weight),
      status: d.score >= 75 ? "good" : d.score >= 50 ? "moderate" : "low",
      statusIcon: d.score >= 75 ? "🟢" : d.score >= 50 ? "🟡" : "🔴",
    }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

  return (
    <View style={driverStyles.card}>
      <Text style={driverStyles.title}>What changed today</Text>
      {drivers.map((d) => (
        <View key={d.key} style={driverStyles.row}>
          <Text style={driverStyles.icon}>{d.statusIcon}</Text>
          <Text style={driverStyles.label}>{d.label}</Text>
          <View style={driverStyles.right}>
            <Text style={[
              driverStyles.delta,
              { color: d.delta > 0 ? "#10b981" : d.delta < 0 ? "#ef4444" : "#94a3b8" }
            ]}>
              {d.delta > 0 ? "↑" : d.delta < 0 ? "↓" : "→"} {Math.abs(d.delta)}
            </Text>
            <Text style={[
              driverStyles.impact,
              { color: d.impact > 0 ? "#10b981" : d.impact < 0 ? "#ef4444" : "#94a3b8" }
            ]}>
              {d.impact > 0 ? "+" : ""}{d.impact} pts
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const driverStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: { fontSize: 14, fontWeight: "700", color: "#1e293b", marginBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center",
    gap: 12, paddingVertical: 10, paddingHorizontal: 0,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  icon: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#1e293b", flex: 1 },
  right: { alignItems: "flex-end" },
  delta: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  impact: { fontSize: 11, fontWeight: "600" },
})

// Highlight tile
const HighlightTile = ({ icon, iconBg, iconColor, label, value, contextLabel, contextColor, optimalHint }) => (
  <View style={tileStyles.tile}>
    <View style={[tileStyles.iconWrap, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text style={tileStyles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={tileStyles.label}>{label}</Text>
    {contextLabel ? (
      <View style={[tileStyles.pill, { backgroundColor: contextColor + "20" }]}>
        <Text style={[tileStyles.pillText, { color: contextColor }]}>{contextLabel}</Text>
      </View>
    ) : (
      <View style={tileStyles.pill}>
        <Text style={[tileStyles.pillText, { color: "#cbd5e1" }]}>—</Text>
      </View>
    )}
    {optimalHint && <Text style={tileStyles.hint}>{optimalHint}</Text>}
  </View>
)

const tileStyles = StyleSheet.create({
  tile: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    flex: 1,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
    marginBottom: 10,
  },
  value: {
    fontSize: 17, fontWeight: "700",
    color: "#1e293b", marginBottom: 2,
  },
  label: { fontSize: 11, color: "#94a3b8", fontWeight: "500", marginBottom: 8 },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, backgroundColor: "#f8fafc",
  },
  pillText: { fontSize: 10, fontWeight: "700" },
  hint: { fontSize: 10, color: "#cbd5e1", marginTop: 5, textAlign: "center" },
})

// Primary Insight card
const InsightCard = ({ insight, alerts }) => {
  const criticalAlert = alerts?.find((a) => a.severity === "critical")
  const source = criticalAlert
    ? { message: criticalAlert.message, cause: null,
        recommendation: criticalAlert.recommendation, severity: "critical" }
    : insight

  if (!source) return null

  const cfg = {
    critical: { bg: "#fef2f2", border: "#fca5a5", accent: "#ef4444", label: "Urgent" },
    high:     { bg: "#fff7ed", border: "#fed7aa", accent: "#f97316", label: "Important" },
    medium:   { bg: "#eff6ff", border: "#bfdbfe", accent: "#3b82f6", label: "Insight" },
    low:      { bg: "#f0fdf4", border: "#bbf7d0", accent: "#10b981", label: "Note" },
  }[source.severity] || { bg: "#eff6ff", border: "#bfdbfe", accent: "#3b82f6", label: "Insight" }

  return (
    <View style={[insightStyles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      {/* label chip */}
      <View style={[insightStyles.chip, { backgroundColor: cfg.accent }]}>
        <Text style={insightStyles.chipText}>{cfg.label}</Text>
      </View>

      <Text style={[insightStyles.message, { color: "#1e293b" }]}>{source.message}</Text>

      {source.cause && (
        <Text style={[insightStyles.cause, { color: cfg.accent }]}>
          Why: {source.cause}
        </Text>
      )}

      <View style={[insightStyles.actionBar, { borderColor: cfg.border }]}>
        <Ionicons name="flash-outline" size={14} color={cfg.accent} />
        <Text style={[insightStyles.action, { color: "#374151" }]}>
          {source.recommendation}
        </Text>
      </View>
    </View>
  )
}

const insightStyles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS, borderWidth: 1.5,
    padding: 18, marginBottom: 12,
  },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, marginBottom: 10,
  },
  chipText: { fontSize: 10, color: "#fff", fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  message: { fontSize: 15, fontWeight: "600", lineHeight: 22, marginBottom: 8 },
  cause: { fontSize: 13, fontStyle: "italic", lineHeight: 18, marginBottom: 10, opacity: 0.85 },
  actionBar: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingTop: 12, borderTopWidth: 1,
  },
  action: { fontSize: 13, fontWeight: "500", lineHeight: 19, flex: 1 },
})

// Today's Focus card
const FocusCard = ({ components, alerts }) => {
  const focus = getDailyFocus(components, alerts)
  return (
    <View style={[focusStyles.card, { backgroundColor: focus.bgColor, borderColor: focus.borderColor }]}>
      <View style={focusStyles.header}>
        <View style={[focusStyles.dot, { backgroundColor: focus.color }]} />
        <Text style={[focusStyles.label, { color: focus.color }]}>Today's Focus</Text>
        <View style={[focusStyles.areaPill, { backgroundColor: focus.color }]}>
          <Text style={focusStyles.areaPillText}>{focus.area}</Text>
        </View>
      </View>
      <Text style={focusStyles.message}>{focus.message}</Text>
      <View style={[focusStyles.actionRow, { borderColor: focus.borderColor }]}>
        <Ionicons name={focus.icon} size={15} color={focus.color} />
        <Text style={[focusStyles.actionText, { color: focus.color }]}>{focus.action}</Text>
      </View>
    </View>
  )
}

const focusStyles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS, borderWidth: 1.5,
    padding: 18, marginBottom: 12,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    gap: 8, marginBottom: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7, flex: 1 },
  areaPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  areaPillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  message: { fontSize: 14, color: "#374151", lineHeight: 20, marginBottom: 10 },
  actionRow: {
    flexDirection: "row", alignItems: "flex-start",
    gap: 8, paddingTop: 10, borderTopWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: "600", lineHeight: 19, flex: 1 },
})

// Journal preview row
const JournalRow = ({ entry, devMode }) => {
  const mood = getMoodColor(entry.mood_label)
  const date = new Date(entry.timestamp)
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return (
    <View style={journalRowStyles.card}>
      <View style={journalRowStyles.left}>
        <View style={[journalRowStyles.moodDot, { backgroundColor: mood.bg }]}>
          <Text style={{ fontSize: 10, color: mood.text, fontWeight: "700" }}>
            {capitalize(entry.mood_label || "?")}
          </Text>
        </View>
        <Text style={journalRowStyles.date}>{dateStr}</Text>
      </View>
      <Text style={journalRowStyles.preview} numberOfLines={2}>{entry.content}</Text>
      {devMode && (
        <Text style={journalRowStyles.devText}>
          s:{entry.sentiment_score?.toFixed(2) ?? "—"} · {entry.mood_label ?? "—"} · {entry.anomaly_flag ? "⚠" : "✓"}
        </Text>
      )}
    </View>
  )
}

const journalRowStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  moodDot: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  date: { fontSize: 11, color: "#94a3b8", fontWeight: "500" },
  preview: { fontSize: 13, color: "#475569", lineHeight: 19 },
  devText: {
    marginTop: 8, fontSize: 10, color: "#6366f1",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
})

// Section header
const SectionHeader = ({ title, action, onAction }) => (
  <View style={sectionHeaderStyles.row}>
    <Text style={sectionHeaderStyles.title}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={onAction}>
        <Text style={sectionHeaderStyles.action}>{action}</Text>
      </TouchableOpacity>
    )}
  </View>
)

const sectionHeaderStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "700", color: "#1e293b" },
  action: { fontSize: 13, color: "#059669", fontWeight: "600" },
})

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
export default function Dashboard({ navigation }) {
  const insets = useSafeAreaInsets()
  const [user, setUser] = useState(null)
  const [data, setData] = useState({
    wellnessScore: 0,
    wellnessLabel: "Loading…",
    wellnessComponents: { sleep: 50, mood: 50, behavior: 50, activity: 50 },
    wellnessTrend: { direction: "stable", strength: 0 },
    wellnessAlerts: [],
    recentEntries: [],
    weeklyDelta: null,
    focusArea: null,
    todayStats: {
      sleepDisplay: "Not tracked", sleepMinutes: 0, sleepBaseline: null,
      screenDisplay: "Not tracked", screenMinutes: 0,
      moodLabel: "Neutral",
      activitySteps: 0, activityDisplay: "Not tracked",
    },
    insights: [],
    _devRaw: null,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const trendRotate = useRef(new Animated.Value(0)).current

  // ── Dev mode ──────────────────────────────────────────────
  const [devModeActive, setDevModeActive] = useState(false)
  const [showPassModal, setShowPassModal] = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [passphrase, setPassphrase] = useState("")
  const [passError, setPassError] = useState("")
  const [authenticating, setAuthenticating] = useState(false)
  const [sessionLabel, setSessionLabel] = useState("")
  const [tapFeedback, setTapFeedback] = useState(null)
  const [devScoreInput, setDevScoreInput] = useState("")
  const [devDateInput, setDevDateInput] = useState("")
  const sessionTimer = useRef(null)
  const tapTimer = useRef(null)
  const fadeIn = useRef(new Animated.Value(0)).current

  // Trend icon rotation animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(trendRotate, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(trendRotate, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // subscribe to dev mode service
  useEffect(() => {
    const unsub = devModeService.subscribe((active) => {
      setDevModeActive(active)
      if (!active) { setShowDevPanel(false); loadData() }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (devModeActive) {
      sessionTimer.current = setInterval(() => setSessionLabel(devModeService.sessionTimeRemainingLabel), 1000)
    } else {
      clearInterval(sessionTimer.current); setSessionLabel("")
    }
    return () => clearInterval(sessionTimer.current)
  }, [devModeActive])

  // fade in on load
  useEffect(() => { initDashboard() }, [])

  const initDashboard = async () => {
    try {
      setUser(authService.getCurrentUser())
      await Promise.all([localStorageService.initialize(), onDeviceAIService.initialize()])
      await behavioralTrackingService.initializeTracking()
      await loadData()
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    } catch (e) {
      console.error("Init error:", e)
      Alert.alert("Error", "Failed to initialize. Please restart.")
    } finally {
      setLoading(false)
    }
  }

  const loadData = async () => {
    try {
      const [wellnessScore, usageStats] = await Promise.all([
        wellnessScoreService.getRealTimeScore(),
        behavioralTrackingService.getDailyUsageStats(),
      ])
      
      // Get recent journal entries from journalService (which actually has the data)
      const journalEntries = await getRecentJournalEntries(3)

      const sleepSummaries = await localStorageService.getSleepSummaries(7)
      const todaySleep = sleepSummaries[0] || null
      const sleepBaseline = sleepSummaries.length > 1
        ? sleepSummaries.slice(1).reduce((s, r) => s + r.total_sleep_minutes, 0) / (sleepSummaries.length - 1)
        : null

      const rawInsights = await onDeviceAIService.generateAdvancedInsights()

      const effectiveScore = devModeService.wellnessScoreOverride !== null
        ? devModeService.wellnessScoreOverride
        : (wellnessScore?.final_score || 80)

      const comps = wellnessScore?.components || {
        sleep: { score: 50 }, mood: { score: 50 },
        behavior: { score: 50 }, activity: { score: 50 },
      }

      const totalScreenMin = (usageStats?.appUsage || [])
        .reduce((s, a) => s + (a.durationMinutes || 0), 0)

      // Get current mood from latest journal entry
      const currentMoodLabel = journalEntries?.[0]?.mood_label || "Neutral"

      // Get activity data
      const activityData = await localStorageService.getActivityData()
      const todayActivity = activityData?.find((a) => {
        const aDate = new Date(a.date || a.timestamp).toDateString()
        const today = new Date().toDateString()
        return aDate === today
      }) || null
      const activitySteps = todayActivity?.steps || 0

      const weeklyDelta = getWeeklyDelta(Math.round(effectiveScore), wellnessScore)
      const focusArea = getFocusArea({
        sleep: comps.sleep?.score || 50,
        mood: comps.mood?.score || 50,
        behavior: comps.behavior?.score || 50,
        activity: comps.activity?.score || 50,
      })

      setData({
        wellnessScore: Math.round(effectiveScore),
        wellnessLabel: wellnessScore?.is_placeholder ? "Calculating…" : getScoreLabel(Math.round(effectiveScore)),
        wellnessComponents: {
          sleep:    Math.round(comps.sleep?.score    || 50),
          mood:     Math.round(comps.mood?.score     || 50),
          behavior: Math.round(comps.behavior?.score || 50),
          activity: Math.round(comps.activity?.score || 50),
        },
        wellnessTrend:  wellnessScore?.trend  || { direction: "stable", strength: 0 },
        wellnessAlerts: wellnessScore?.alerts || [],
        recentEntries: journalEntries,
        weeklyDelta,
        focusArea,
        todayStats: {
          sleepDisplay: todaySleep
            ? `${Math.floor(todaySleep.total_sleep_minutes / 60)}h ${Math.round(todaySleep.total_sleep_minutes % 60)}m`
            : "Not tracked",
          sleepMinutes: todaySleep?.total_sleep_minutes || 0,
          sleepBaseline,

          screenDisplay: totalScreenMin > 0
            ? `${Math.floor(totalScreenMin / 60)}h ${totalScreenMin % 60}m`
            : "Not tracked",
          screenMinutes: totalScreenMin,

          moodLabel: capitalize(currentMoodLabel),

          activitySteps,
          activityDisplay: activitySteps > 0 ? `${activitySteps.toLocaleString()} steps` : "Not tracked",
        },
        insights: sortByImpact(rawInsights),
        _devRaw: devModeService.isActive ? { wellnessScore, usageStats, sleepSummaries } : null,
      })
    } catch (e) {
      console.error("Load error:", e)
    }
  }

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false) }

  // ── Dev mode handlers ─────────────────────────────────────
  const handleScoreTap = () => {
    if (devModeActive) { setShowDevPanel(true); return }
    const result = devModeService.registerTap()
    if (result.shouldPrompt) { Vibration.vibrate(80); setShowPassModal(true) }
    else if (result.tapsRemaining != null) {
      setTapFeedback(`${result.tapsRemaining} more`)
      clearTimeout(tapTimer.current)
      tapTimer.current = setTimeout(() => setTapFeedback(null), 1500)
    }
  }

  const submitPassphrase = async () => {
    if (!passphrase.trim()) return
    setAuthenticating(true); setPassError("")
    const result = await devModeService.authenticate(passphrase)
    setAuthenticating(false)
    if (result.success) {
      setShowPassModal(false); setPassphrase("")
      Vibration.vibrate([0, 60, 60, 60])
      await loadData(); setShowDevPanel(true)
    } else {
      setPassError(result.error || "Wrong passphrase"); setPassphrase("")
    }
  }

  const applyScoreOverride = () => {
    const n = parseInt(devScoreInput, 10)
    if (isNaN(n) || n < 0 || n > 100) { Alert.alert("Invalid", "Enter 0–100"); return }
    devModeService.setWellnessScoreOverride(n); loadData()
  }
  const clearScoreOverride = () => { devModeService.setWellnessScoreOverride(null); setDevScoreInput(""); loadData() }

  const applyDateOverride = () => {
    if (!devDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert("Invalid", "Use YYYY-MM-DD"); return }
    try { devModeService.setForceDate(devDateInput) } catch (e) { Alert.alert("Error", e.message) }
  }
  const clearDateOverride = () => { devModeService.setForceDate(null); setDevDateInput("") }

  const showRawData = () => {
    if (!data._devRaw) { Alert.alert("No data", "Refresh the dashboard first."); return }
    Alert.alert("Raw Data", JSON.stringify(data._devRaw.wellnessScore, null, 2).slice(0, 800), [{ text: "OK" }])
  }

  const showSleepAnalysis = async () => {
    try {
      const d = await devModeService.getSleepAnalysisData()
      Alert.alert("Sleep", `Records: ${d.totalRecords}\nAvg: ${d.statistics.averageSleepHours}h`, [{ text: "OK" }])
    } catch (e) { Alert.alert("Error", e.message) }
  }

  const showStorage = async () => {
    try {
      const d = await devModeService.getStorageBreakdownData()
      Alert.alert("Storage", `Sleep: ${d.sleepData.totalSizeKB} KB\nJournal: ${d.otherData.journal.sizeKB} KB`, [{ text: "OK" }])
    } catch (e) { Alert.alert("Error", e.message) }
  }

  const generateMock = () => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    const mock = devModeService.generateMockWellnessRecord(d.toISOString().split("T")[0])
    Alert.alert("Mock", `Score: ${mock.wellnessScore}  Mood: ${mock.moodLabel}`, [{ text: "OK" }])
  }

  // ── Highlight context helper ──────────────────────────────
  const getHighlightCtx = (value, baseline, invert = false, optimalThreshold) => {
    if (!value || value === 0) return { label: "No data", color: "#cbd5e1" }

    if (baseline && baseline > 0) {
      const pct = ((value - baseline) / baseline) * 100
      const isGood = invert ? pct < -10 : pct > 10
      const isBad  = invert ? pct > 10  : pct < -10
      if (isGood) return { label: "↑ Better", color: "#10b981" }
      if (isBad)  return { label: invert ? "↑ Higher" : "↓ Below", color: "#ef4444" }
      return { label: "Normal", color: "#94a3b8" }
    }

    if (optimalThreshold) {
      const isGood = invert ? value <= optimalThreshold : value >= optimalThreshold
      return isGood
        ? { label: "On track", color: "#10b981" }
        : { label: invert ? "Above target" : "Below target", color: "#ef4444" }
    }

    return { label: "—", color: "#cbd5e1" }
  }

  if (loading) {
    return (
      <SafeAreaWrapper backgroundColor="#eff6ff">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "#94a3b8", fontSize: 15 }}>Loading your day…</Text>
        </View>
      </SafeAreaWrapper>
    )
  }

  const scoreColor = getScoreColor(data.wellnessScore)
  const trendText  = getTrendNarrative(data.wellnessTrend)
  const comps      = data.wellnessComponents
  const minScore   = Math.min(comps.sleep, comps.mood, comps.behavior, comps.activity)
  const stats      = data.todayStats
  const primaryInsight = data.insights[0] || null

  return (
    <SafeAreaWrapper backgroundColor="#eff6ff" statusBarStyle="dark-content">
      <LinearGradient
        colors={["#eff6ff", "#ecfdf5"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <Animated.ScrollView
          style={{ opacity: fadeIn }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            S.scroll,
            { paddingBottom: Math.max(insets.bottom + 100, 120) },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
          }
        >
          {/* ── HEADER ───────────────────────────────────────── */}
          <View style={[S.headerRow, { paddingTop: insets.top > 0 ? 8 : 20 }]}>
            <View>
              <Text style={S.greeting}>{getGreeting()},</Text>
              <Text style={S.username}>{user?.username || "there"} 👋</Text>
            </View>
            <View style={S.headerRight}>
              {devModeActive && (
                <TouchableOpacity style={S.devChip} onPress={() => setShowDevPanel(true)}>
                  <Ionicons name="code-slash" size={11} color="#fff" />
                  <Text style={S.devChipText}>DEV · {sessionLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={S.avatarBtn} onPress={() => navigation.navigate("Profile")}>
                <Ionicons name="person-outline" size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── WELLNESS SCORE CARD ───────────────────────────── */}
          <View style={S.scoreCard}>
            {/* Horizontal row: ring + text */}
            <View style={S.scoreCardTop}>
              {/* Score ring on left */}
              <View style={{ alignItems: "center", minWidth: 70 }}>
                <ScoreRing
                  score={data.wellnessScore}
                  color={scoreColor}
                  onPress={handleScoreTap}
                  devMode={devModeActive}
                />
                {tapFeedback && <Text style={S.tapHint}>{tapFeedback}</Text>}
                {devModeService.wellnessScoreOverride !== null && (
                  <Text style={S.devOverrideNote}>⚠ override</Text>
                )}
              </View>

              {/* Text on right */}
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text style={S.scoreCardLabel}>Wellness</Text>
                <Text style={[S.scoreCardStatus, { color: scoreColor }]}>
                  {data.wellnessLabel}
                </Text>
                {trendText && (
                  <View style={S.trendRow}>
                    <Animated.View style={{
                      transform: [{
                        rotate: trendRotate.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg']
                        })
                      }]
                    }}>
                      <Ionicons
                        name={
                          data.wellnessTrend.direction === "improving" ? "trending-up" :
                          data.wellnessTrend.direction === "declining" ? "trending-down" :
                          "remove-outline"
                        }
                        size={11}
                        color={
                          data.wellnessTrend.direction === "improving" ? "#10b981" :
                          data.wellnessTrend.direction === "declining" ? "#ef4444" :
                          "#94a3b8"
                        }
                      />
                    </Animated.View>
                    <Text style={[
                      S.trendText,
                      {
                        color: data.wellnessTrend.direction === "improving" ? "#10b981" :
                               data.wellnessTrend.direction === "declining" ? "#ef4444" :
                               "#94a3b8"
                      }
                    ]}>
                      {trendText}
                    </Text>
                  </View>
                )}
                {devModeService.forcedDate && (
                  <Text style={S.devDateNote}>📅 {devModeService.forcedDate}</Text>
                )}
              </View>

              {/* Right side: Weekly delta or focus area */}
              <View style={{ alignItems: "flex-end", justifyContent: "center", minWidth: 70 }}>
                {data.weeklyDelta !== null ? (
                  <>
                    <Text style={[S.deltaLabel, { color: data.weeklyDelta > 0 ? "#10b981" : "#ef4444" }]}>
                      {data.weeklyDelta > 0 ? "↑" : "↓"} {Math.abs(data.weeklyDelta)}
                    </Text>
                    <Text style={S.deltaSubtext}>this week</Text>
                  </>
                ) : data.focusArea ? (
                  <>
                    <Text style={[S.focusLabel, { color: data.focusArea.color }]}>
                      Focus on
                    </Text>
                    <Text style={[S.focusAreaName, { color: data.focusArea.color }]}>
                      {data.focusArea.label}
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          {/* ── PRIMARY INSIGHT ────────────────────────────────── */}
          <InsightCard insight={primaryInsight} alerts={data.wellnessAlerts} />

          {/* ── TODAY'S FOCUS ──────────────────────────────────── */}
          <FocusCard components={data.wellnessComponents} alerts={data.wellnessAlerts} />

          {/* ── HIGHLIGHTS ─────────────────────────────────────── */}
          <View style={S.section}>
            <SectionHeader title="Today's Highlights" />
            <View style={S.tilesRow}>
              <HighlightTile
                icon="moon" iconBg="#eef2ff" iconColor="#6366f1"
                label="Sleep" value={stats.sleepDisplay}
                contextLabel={stats.sleepMinutes >= 420 && stats.sleepMinutes <= 540 ? "✓ In range" : stats.sleepMinutes > 540 ? "Over 9h" : stats.sleepMinutes > 0 ? "Below 7h" : "No data"}
                contextColor={stats.sleepMinutes >= 420 && stats.sleepMinutes <= 540 ? "#10b981" : stats.sleepMinutes > 0 ? "#f59e0b" : "#cbd5e1"}
              />
              <HighlightTile
                icon="phone-portrait" iconBg="#ecfdf5" iconColor="#10b981"
                label="Screen" value={stats.screenDisplay}
                contextLabel={stats.screenMinutes <= 180 ? "✓ Under 3h" : `${stats.screenMinutes - 180}m over`}
                contextColor={stats.screenMinutes <= 180 ? "#10b981" : "#ef4444"}
              />
            </View>
            <View style={[S.tilesRow, { marginTop: 10 }]}>
              {stats.moodLabel !== "Neutral" || data.recentEntries.length > 0 ? (
                <HighlightTile
                  icon="happy" iconBg="#fefce8" iconColor="#eab308"
                  label="Mood" value={stats.moodLabel === "Neutral" ? "Not journaled" : stats.moodLabel}
                  contextLabel={stats.moodLabel !== "Neutral" ? stats.moodLabel : null}
                  contextColor={stats.moodLabel === "Positive" ? "#10b981" : stats.moodLabel === "Negative" ? "#ef4444" : "#f59e0b"}
                />
              ) : null}
              <HighlightTile
                icon="walk" iconBg="#fce7f3" iconColor="#ec4899"
                label="Activity" value={stats.activitySteps > 0 ? `${stats.activitySteps.toLocaleString()}` : "0"}
                contextLabel={stats.activitySteps > 5000 ? "✓ Goal met" : stats.activitySteps > 0 ? `${Math.round((stats.activitySteps / 5000) * 100)}% of 5k` : "No data"}
                contextColor={stats.activitySteps > 5000 ? "#10b981" : stats.activitySteps > 0 ? "#f59e0b" : "#cbd5e1"}
              />
            </View>
          </View>

          {/* ── KEY DRIVERS ────────────────────────────────────── */}
          <KeyDriversCard components={data.wellnessComponents} alerts={data.wellnessAlerts} />


        </Animated.ScrollView>
      </LinearGradient>

      {/* ════════════════════════════════════════════════
          PASSPHRASE MODAL
      ════════════════════════════════════════════════ */}
      <Modal visible={showPassModal} transparent animationType="fade" onRequestClose={() => { setShowPassModal(false); setPassphrase("") }}>
        <KeyboardAvoidingView
          style={S.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={S.passModal}>
            <View style={S.passModalIcon}>
              <Ionicons name="code-slash" size={22} color={ACCENT} />
            </View>
            <Text style={S.passModalTitle}>Developer Access</Text>
            <Text style={S.passModalSub}>Enter passphrase to continue</Text>
            <TextInput
              style={[S.passInput, passError && S.passInputErr]}
              value={passphrase}
              onChangeText={(t) => { setPassphrase(t); setPassError("") }}
              placeholder="Passphrase"
              placeholderTextColor="#cbd5e1"
              secureTextEntry autoFocus
              returnKeyType="done"
              onSubmitEditing={submitPassphrase}
            />
            {!!passError && <Text style={S.passErrText}>{passError}</Text>}
            <View style={S.passActions}>
              <TouchableOpacity style={S.passCancelBtn} onPress={() => { setShowPassModal(false); setPassphrase("") }}>
                <Text style={S.passCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.passSubmitBtn, authenticating && { opacity: 0.6 }]}
                onPress={submitPassphrase} disabled={authenticating}
              >
                <Text style={S.passSubmitText}>{authenticating ? "Checking…" : "Unlock"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════
          DEV PANEL
      ════════════════════════════════════════════════ */}
      <Modal visible={showDevPanel} transparent animationType="slide" onRequestClose={() => setShowDevPanel(false)}>
        <View style={S.devOverlay}>
          <View style={S.devPanel}>
            {/* handle */}
            <View style={S.devHandle} />

            <View style={S.devPanelHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="code-slash" size={18} color="#818cf8" />
                <Text style={S.devPanelTitle}>Dev Mode</Text>
                <View style={S.devSessionPill}>
                  <Text style={S.devSessionText}>⏱ {sessionLabel}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowDevPanel(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }}>

              {/* Score override */}
              <View style={S.devSection}>
                <Text style={S.devSectionTitle}>Score Override</Text>
                <View style={S.devRow}>
                  <TextInput
                    style={S.devInput} value={devScoreInput}
                    onChangeText={setDevScoreInput} placeholder="0–100"
                    placeholderTextColor="#475569" keyboardType="number-pad" maxLength={3}
                  />
                  <TouchableOpacity style={S.devApplyBtn} onPress={applyScoreOverride}>
                    <Text style={S.devApplyText}>Apply</Text>
                  </TouchableOpacity>
                  {devModeService.wellnessScoreOverride !== null && (
                    <TouchableOpacity style={S.devClearBtn} onPress={clearScoreOverride}>
                      <Text style={S.devClearText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Date override */}
              <View style={S.devSection}>
                <Text style={S.devSectionTitle}>Force Date</Text>
                <View style={S.devRow}>
                  <TextInput
                    style={S.devInput} value={devDateInput}
                    onChangeText={setDevDateInput} placeholder="YYYY-MM-DD"
                    placeholderTextColor="#475569" keyboardType="numeric" maxLength={10}
                  />
                  <TouchableOpacity style={S.devApplyBtn} onPress={applyDateOverride}>
                    <Text style={S.devApplyText}>Apply</Text>
                  </TouchableOpacity>
                  {devModeService.forcedDate && (
                    <TouchableOpacity style={S.devClearBtn} onPress={clearDateOverride}>
                      <Text style={S.devClearText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Inspection */}
              <View style={S.devSection}>
                <Text style={S.devSectionTitle}>Data Inspection</Text>
                <View style={S.devBtnRow}>
                  {[
                    { label: "Raw Data", fn: showRawData, icon: "layers-outline" },
                    { label: "Sleep", fn: showSleepAnalysis, icon: "bed-outline" },
                    { label: "Storage", fn: showStorage, icon: "server-outline" },
                  ].map((b) => (
                    <TouchableOpacity key={b.label} style={S.devIconBtn} onPress={b.fn}>
                      <Ionicons name={b.icon} size={15} color="#818cf8" />
                      <Text style={S.devIconBtnText}>{b.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Mock data */}
              <View style={S.devSection}>
                <Text style={S.devSectionTitle}>Test Data</Text>
                <TouchableOpacity style={S.devWideBtn} onPress={generateMock}>
                  <Ionicons name="flask-outline" size={15} color="#818cf8" />
                  <Text style={S.devIconBtnText}>Generate Yesterday Mock</Text>
                </TouchableOpacity>
              </View>

              {/* Navigation */}
              <View style={S.devSection}>
                <Text style={S.devSectionTitle}>Navigate To</Text>
                <View style={S.devNavGrid}>
                  {["Journal", "Reports", "Settings", "Emergency", "Track"].map((r) => (
                    <TouchableOpacity
                      key={r} style={S.devNavPill}
                      onPress={() => { setShowDevPanel(false); navigation.navigate(r) }}
                    >
                      <Text style={S.devNavPillText}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Deactivate */}
              <TouchableOpacity style={S.devDeactivateBtn} onPress={() => { devModeService.deactivate("manual"); setShowDevPanel(false) }}>
                <Ionicons name="power-outline" size={15} color="#ef4444" />
                <Text style={S.devDeactivateText}>Deactivate Dev Mode</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaWrapper>
  )
}

// ─────────────────────────────────────────────────────────────
// STYLESHEET
// ─────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Header
  headerRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 22,
  },
  greeting: { fontSize: 14, color: "#94a3b8", fontWeight: "500", marginBottom: 2 },
  username: { fontSize: IS_TABLET ? 28 : 24, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  devChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: ACCENT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  devChipText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#94a3b8", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },

  // Wellness score card
  scoreCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS + 4,
    padding: 14,
    paddingRight: 16,
    marginBottom: 12,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreCardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  scoreCardLabel: { fontSize: 11, color: "#94a3b8", fontWeight: "600", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  scoreCardStatus: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginBottom: 4 },
  devDateNote: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  trendText: { fontSize: 11, fontWeight: "500", flex: 1 },
  deltaLabel: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  deltaSubtext: { fontSize: 9, color: "#94a3b8", fontWeight: "500" },
  focusLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 1 },
  focusAreaName: { fontSize: 14, fontWeight: "700" },
  tapHint: { fontSize: 8, color: "#cbd5e1", marginTop: 2 },
  devOverrideNote: { fontSize: 8, color: ACCENT, fontWeight: "700", marginTop: 1 },

  cardDivider: { height: 1, backgroundColor: "#f1f5f9", marginBottom: 16 },
  breakdownTitle: {
    fontSize: 11, color: "#94a3b8", fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6,
    marginBottom: 12,
  },

  // Highlights
  section: { marginBottom: 28 },
  tilesRow: { flexDirection: "row", gap: 10 },

  // Modals — Passphrase
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  passModal: {
    backgroundColor: "#fff", borderRadius: 24,
    padding: 28, width: "100%", maxWidth: 360,
    alignItems: "center",
    shadowColor: "#0f172a", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 30, elevation: 12,
  },
  passModalIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#eef2ff",
    justifyContent: "center", alignItems: "center", marginBottom: 14,
  },
  passModalTitle: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginBottom: 4 },
  passModalSub: { fontSize: 13, color: "#94a3b8", marginBottom: 20 },
  passInput: {
    width: "100%", borderWidth: 1.5, borderColor: "#e2e8f0",
    borderRadius: 12, padding: 14, fontSize: 15, color: "#1e293b",
    backgroundColor: "#f8fafc", marginBottom: 8,
  },
  passInputErr: { borderColor: "#ef4444" },
  passErrText: { color: "#ef4444", fontSize: 12, marginBottom: 8, alignSelf: "flex-start" },
  passActions: { flexDirection: "row", gap: 10, width: "100%", marginTop: 6 },
  passCancelBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#e2e8f0", alignItems: "center",
  },
  passCancelText: { color: "#64748b", fontWeight: "600", fontSize: 14 },
  passSubmitBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: ACCENT, alignItems: "center",
  },
  passSubmitText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Dev panel
  devOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  devPanel: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 30, paddingTop: 12,
    maxHeight: "88%",
  },
  devHandle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: "#334155", alignSelf: "center", marginBottom: 16,
  },
  devPanelHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 16,
  },
  devPanelTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  devSessionPill: {
    backgroundColor: "rgba(99,102,241,0.2)", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "#6366f1",
  },
  devSessionText: { color: "#818cf8", fontSize: 10, fontWeight: "600" },
  devSection: {
    backgroundColor: "#1e293b", borderRadius: 14,
    padding: 14, marginBottom: 10,
  },
  devSectionTitle: {
    fontSize: 10, fontWeight: "800", color: "#475569",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
  },
  devRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  devInput: {
    flex: 1, backgroundColor: "#0f172a",
    borderRadius: 10, borderWidth: 1, borderColor: "#334155",
    paddingHorizontal: 12, paddingVertical: 9,
    color: "#e2e8f0", fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  devApplyBtn: {
    backgroundColor: ACCENT, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  devApplyText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  devClearBtn: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9,
    borderWidth: 1, borderColor: "#ef4444",
  },
  devClearText: { color: "#ef4444", fontWeight: "600", fontSize: 12 },
  devBtnRow: { flexDirection: "row", gap: 8 },
  devIconBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#0f172a", borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: "#334155",
  },
  devIconBtnText: { color: "#818cf8", fontSize: 11, fontWeight: "600" },
  devWideBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#0f172a", borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: "#334155",
  },
  devNavGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  devNavPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: "#0f172a", borderRadius: 20,
    borderWidth: 1, borderColor: "#334155",
  },
  devNavPillText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  devDeactivateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, marginTop: 6, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5, borderColor: "#ef4444",
  },
  devDeactivateText: { color: "#ef4444", fontWeight: "700", fontSize: 13 },
})