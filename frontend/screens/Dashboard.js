"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Dimensions, Modal, TextInput,
  KeyboardAvoidingView, Platform, Vibration,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import SafeAreaWrapper from "../components/SafeAreaWrapper"
import ResponsiveCard from "../components/ResponsiveCard"
import ResponsiveGrid from "../components/ResponsiveGrid"
import authService from "../services/authService"
import localStorageService from "../services/localStorageService"
import onDeviceAIService from "../services/onDeviceAIService"
import behavioralTrackingService from "../services/behavioralTrackingService"
import devModeService from "../services/devsModeService"

const { width: screenWidth } = Dimensions.get("window")
const isTablet = screenWidth > 768

export default function Dashboard({ navigation }) {
  const insets = useSafeAreaInsets()
  const [user, setUser] = useState(null)
  const [dashboardData, setDashboardData] = useState({
    wellnessScore: 0,
    recentEntries: [],
    todayStats: {
      sleep: "Not tracked",
      screenTime: "Not tracked",
      mood: "Not tracked",
      pickups: 0,
    },
    insights: [],
  })
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

   // ── Dev Mode State ──────────────────────────────────────────
  const [devModeActive, setDevModeActive] = useState(false)
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [passphrase, setPassphrase] = useState("")
  const [passphraseError, setPassphraseError] = useState("")
  const [authenticating, setAuthenticating] = useState(false)
  const [sessionLabel, setSessionLabel] = useState("")
  const [tapFeedback, setTapFeedback] = useState(null) // e.g. "4 more taps"

  // Score override for dev testing
  const [devScoreInput, setDevScoreInput] = useState("")
  // Forced date for journal backdating
  const [devDateInput, setDevDateInput] = useState("")

  const sessionLabelTimer = useRef(null)
  const tapFeedbackTimer = useRef(null)

  // ── Subscribe to devModeService state changes ───────────────
  useEffect(() => {
    const unsub = devModeService.subscribe((active) => {
      setDevModeActive(active)
      if (!active) {
        setShowDevPanel(false)
        // Reload dashboard to clear any overrides
        loadDashboardData()
      }
    })
    return unsub
  }, [])

  // ── Session countdown ticker ────────────────────────────────
  useEffect(() => {
    if (devModeActive) {
      sessionLabelTimer.current = setInterval(() => {
        setSessionLabel(devModeService.sessionTimeRemainingLabel)
      }, 1000)
    } else {
      clearInterval(sessionLabelTimer.current)
      setSessionLabel("")
    }
    return () => clearInterval(sessionLabelTimer.current)
  }, [devModeActive])

  useEffect(() => {
    initializeDashboard()
  }, [])

  const initializeDashboard = async () => {
    try {
      const currentUser = authService.getCurrentUser()
      setUser(currentUser)

      await Promise.all([
        localStorageService.initialize(),
        onDeviceAIService.initialize(),
      ])

      // Initialize behavioral tracking
      await behavioralTrackingService.initializeTracking()

      await loadDashboardData()
    } catch (error) {
      console.error("Dashboard initialization error:", error)
      Alert.alert("Error", "Failed to initialize dashboard. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const loadDashboardData = async () => {
    try {
      const [journalEntries, wellnessData, usageStats] = await Promise.all([
        localStorageService.getJournalEntries(3),
        localStorageService.getWellnessData(7),
        behavioralTrackingService.getDailyUsageStats()
      ])

      const todayData = wellnessData[0]
      const insights = onDeviceAIService.generateWellnessInsights(wellnessData)

       // Apply dev score override if active
      const effectiveScore = devModeService.wellnessScoreOverride !== null
        ? devModeService.wellnessScoreOverride
        : (todayData?.wellnessScore || 0)

      setDashboardData({
        wellnessScore: effectiveScore,
        recentEntries: journalEntries,
        todayStats: {
          sleep: todayData?.sleepHours
            ? `${Math.floor(todayData.sleepHours)}h ${Math.round((todayData.sleepHours % 1) * 60)}m`
            : "Not tracked", // Placeholder sleep tracking
          screenTime: usageStats?.screenTimeMinutes
            ? `${Math.floor(usageStats.screenTimeMinutes / 60)}h ${usageStats.screenTimeMinutes % 60}m`
            : "Not tracked",
          mood: todayData?.moodLabel ? capitalize(todayData.moodLabel) : "Not tracked",
          pickups: usageStats?.pickupCount || 0,
        },
        insights,
        // Raw data exposed in dev mode
        _devRaw: devModeService.isActive ? {
          todayData,
          usageStats,
          wellnessData: wellnessData.slice(0, 7),
        } : null,
      })
    } catch (error) {
      console.error("Dashboard data loading error:", error)
      Alert.alert("Error", "Failed to load dashboard data.")
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadDashboardData()
    setRefreshing(false)
  }

   // ── Dev Mode Activation ─────────────────────────────────────

  // Hidden tap zone is the wellness score circle
  const handleWellnessTap = () => {
    if (devModeActive) {
      // Already active → open panel
      setShowDevPanel(true)
      return
    }

    const result = devModeService.registerTap()

    if (result.shouldPrompt) {
      Vibration.vibrate(80)
      setShowPassphraseModal(true)
    } else if (result.tapsRemaining !== null) {
      // Show subtle tap feedback
      setTapFeedback(`${result.tapsRemaining} more`)
      clearTimeout(tapFeedbackTimer.current)
      tapFeedbackTimer.current = setTimeout(() => setTapFeedback(null), 1500)
    }
  }

  const handlePassphraseSubmit = async () => {
    if (!passphrase.trim()) return
    setAuthenticating(true)
    setPassphraseError("")

    const result = await devModeService.authenticate(passphrase)

    setAuthenticating(false)
    if (result.success) {
      setShowPassphraseModal(false)
      setPassphrase("")
      setDevModeActive(true)
      Vibration.vibrate([0, 60, 60, 60])
      // Reload to apply any overrides
      await loadDashboardData()
      setShowDevPanel(true)
    } else {
      setPassphraseError(result.error || "Authentication failed")
      setPassphrase("")
    }
  }

  const handlePassphraseCancel = () => {
    setShowPassphraseModal(false)
    setPassphrase("")
    setPassphraseError("")
  }

  const handleDeactivateDev = () => {
    devModeService.deactivate("Manual — user pressed deactivate")
    setShowDevPanel(false)
  }

  // ── Dev Panel Actions ───────────────────────────────────────

  const applyScoreOverride = () => {
    const score = parseInt(devScoreInput, 10)
    if (isNaN(score) || score < 0 || score > 100) {
      Alert.alert("Invalid", "Score must be 0–100")
      return
    }
    devModeService.setWellnessScoreOverride(score)
    loadDashboardData()
    Alert.alert("✅ Dev", `Wellness score overridden to ${score}`)
  }

  const clearScoreOverride = () => {
    devModeService.setWellnessScoreOverride(null)
    setDevScoreInput("")
    loadDashboardData()
  }

  const applyDateOverride = () => {
    if (!devDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Invalid", "Use YYYY-MM-DD format")
      return
    }
    try {
      devModeService.setForceDate(devDateInput)
      Alert.alert("✅ Dev", `Forced date set to ${devDateInput}.\nJournal will use this as "today".`)
    } catch (e) {
      Alert.alert("Error", e.message)
    }
  }

  const clearDateOverride = () => {
    devModeService.setForceDate(null)
    setDevDateInput("")
    Alert.alert("✅ Dev", "Date override cleared. Using real today.")
  }

  const generateMockData = () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split("T")[0]
    const mock = devModeService.generateMockWellnessRecord(dateStr)
    Alert.alert(
      "🧪 Mock Record Generated",
      `Date: ${mock.date}\nScore: ${mock.wellnessScore}\nMood: ${mock.moodLabel}\nSentiment: ${mock.sentimentScore}\nAnomal: ${mock.anomalyFlag}`,
      [{ text: "OK" }]
    )
  }

  const showRawData = () => {
    if (!dashboardData._devRaw) {
      Alert.alert("Dev Raw Data", "No raw data available. Refresh dashboard.")
      return
    }
    const raw = dashboardData._devRaw
    Alert.alert(
      "📊 Raw Data",
      `Today:\n${JSON.stringify(raw.todayData, null, 2)}\n\nUsage:\n${JSON.stringify(raw.usageStats, null, 2)}`,
      [{ text: "OK" }]
    )
  }

  // ── Helpers ─────────────────────────────────────────────────

  const getGreeting = () => {
    const hour = new Date().getHours()
    return (hour < 12) ? "Good morning" : (hour < 17) ? "Good afternoon" : "Good evening"
  }

  const getWellnessColor = (score) => {
    if (score >= 80) return "#10b981"
    if (score >= 60) return "#f59e0b"
    return "#ef4444"
  }

  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)


  const handleQuickMoodLog = async (moodLabel) => {
    try {
      const today = devModeService.getEffectiveDate()

      const metrics = {
        sleepHours: 7, 
        moodLabel,
        moodScore: moodLabel === "positive" ? 0.8 : moodLabel === "neutral" ? 0.5 : 0.2,
        screenTimeMinutes: 180, 
        activityMinutes: 30, 
      }

      await localStorageService.saveWellnessData(today, metrics)

      await loadDashboardData()
      Alert.alert("Mood Logged", `Feeling ${moodLabel} recorded${devModeService.forcedDate ? ` for ${today} (dev override)` : ""}`)
    } catch (error) {
      console.error("Error logging mood:", error)
      Alert.alert("Error", "Failed to log mood")
    }
  }

  /*const moodOptions = [
    { emoji: "ðŸ˜Š", label: "Positive", color: "#10b981" },
    { emoji: "ðŸ˜", label: "Neutral", color: "#6b7280" },
    { emoji: "ðŸ˜”", label: "Negative", color: "#ef4444" },
  ];*/

  if (loading) {
    return (
      <SafeAreaWrapper backgroundColor="#dbeafe">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </SafeAreaWrapper>
    )
  }

  return (
    <SafeAreaWrapper backgroundColor="#dbeafe" statusBarStyle="dark-content">
      <LinearGradient colors={["#dbeafe", "#d1fae5"]} style={styles.gradient}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: 10 }]}>
            <View style={styles.headerContent}>
              <View style={styles.headerText}>
                <Text style={styles.greeting}>
                  {getGreeting()}, {user.username || "User"}
                </Text>
                <Text style={styles.subtitle}>How are you feeling today?</Text>
              </View>
              <View style={styles.headerIcons}>
              {/* Dev mode indicator badge */}
                {devModeActive && (
                  <TouchableOpacity
                    style={styles.devBadge}
                    onPress={() => setShowDevPanel(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="code-slash" size={12} color="#fff" />
                    <Text style={styles.devBadgeText}>DEV</Text>
                    <Text style={styles.devBadgeTimer}>{sessionLabel}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => navigation.navigate("Profile")}
                  activeOpacity={0.7}
                >
                  <Ionicons name="person-outline" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Wellness Score — tap zone for dev mode activation */}
            <ResponsiveCard style={styles.wellnessCard}>
              <View style={styles.wellnessHeader}>
                <Text style={styles.wellnessTitle}>Today's Wellness Score</Text>
                <View style={styles.wellnessScoreWrapper}>
                  <TouchableOpacity
                    onPress={handleWellnessTap}
                    activeOpacity={devModeActive ? 0.6 : 1}
                    style={[
                      styles.wellnessScore,
                      { backgroundColor: getWellnessColor(dashboardData.wellnessScore) },
                      devModeActive && styles.wellnessScoreDev,
                    ]}
                  >
                    <Text style={styles.wellnessScoreText}>{dashboardData.wellnessScore}</Text>
                  </TouchableOpacity>
                  {/* Subtle tap feedback */}
                  {tapFeedback && (
                    <Text style={styles.tapFeedback}>{tapFeedback}</Text>
                  )}
                  {/* Dev score override indicator */}
                  {devModeService.wellnessScoreOverride !== null && (
                    <Text style={styles.devOverrideLabel}>⚠ DEV</Text>
                  )}
                </View>
              </View>
              <Text style={styles.wellnessSubtitle}>
                Based on sleep, mood, activity, and screen time
                {devModeService.forcedDate ? `\n📅 Dev date: ${devModeService.forcedDate}` : ""}
              </Text>
            </ResponsiveCard>

            {/* Insights */}
            {dashboardData.insights.length > 0 && (
              <ResponsiveCard backgroundColor="rgba(59, 130, 246, 0.1)" style={styles.insightCard}>
                <View style={styles.insightHeader}>
                  <Ionicons name="analytics" size={20} color="#3b82f6" />
                  <Text style={styles.insightTitle}>Wellness Insight</Text>
                </View>
                <Text style={styles.insightMessage}>{dashboardData.insights[0].message}</Text>
                <Text style={styles.insightRecommendation}>💡 {dashboardData.insights[0].recommendation}</Text>
              </ResponsiveCard>
            )}            
          </View>

          {/* Main Content */}
          <View style={styles.content}>
            {/* Today's Highlights */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Today's Highlights</Text>
              <ResponsiveGrid columns={2} spacing={12}>
                <ResponsiveCard style={styles.highlightCard}>
                  <View style={[styles.highlightIcon, { backgroundColor: "#e0e7ff" }]}>
                    <Ionicons name="moon" size={20} color="#6366f1" />
                  </View>
                  <Text style={styles.highlightValue}>{dashboardData.todayStats.sleep}</Text>
                  <Text style={styles.highlightLabel}>Sleep</Text>
                </ResponsiveCard>

                <ResponsiveCard style={styles.highlightCard}>
                  <View style={[styles.highlightIcon, { backgroundColor: "#d1fae5" }]}>
                    <Ionicons name="phone-portrait" size={20} color="#10b981" />
                  </View>
                  <Text style={styles.highlightValue}>{dashboardData.todayStats.screenTime}</Text>
                  <Text style={styles.highlightLabel}>Screen time</Text>
                </ResponsiveCard>

                <ResponsiveCard style={styles.highlightCard}>
                  <View style={[styles.highlightIcon, { backgroundColor: "#fef3c7" }]}>
                    <Ionicons name="happy" size={20} color="#f59e0b" />
                  </View>
                  <Text style={styles.highlightValue}>{dashboardData.todayStats.mood}</Text>
                  <Text style={styles.highlightLabel}>Mood</Text>
                </ResponsiveCard>

                <ResponsiveCard style={styles.highlightCard}>
                  <View style={[styles.highlightIcon, { backgroundColor: "#ede9fe" }]}>
                    <Ionicons name="refresh" size={20} color="#8b5cf6" />
                  </View>
                  <Text style={styles.highlightValue}>{dashboardData.todayStats.pickups}</Text>
                  <Text style={styles.highlightLabel}>Pickups</Text>
                </ResponsiveCard>
              </ResponsiveGrid>
            </View>

            {/* Recent Journal Entries */}
            {dashboardData.recentEntries.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent Entries</Text>
                  <TouchableOpacity onPress={() => navigation.navigate("Journal")}>
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.journalPreview}>
                  {dashboardData.recentEntries.slice(0, 2).map((entry) => (
                    <ResponsiveCard key={entry.id} style={styles.journalPreviewItem}>
                      <View style={styles.journalPreviewHeader}>
                        <Text style={styles.journalPreviewDate}>{new Date(entry.timestamp).toLocaleDateString()}</Text>
                        {entry.mood_label && (
                          <View style={[styles.moodBadge, { backgroundColor: getMoodColor(entry.mood_label) }]}>
                            <Text style={styles.moodBadgeText}>{capitalize(entry.mood_label)}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.journalPreviewText} numberOfLines={2}>
                        {entry.content}
                      </Text>
                      {/* Dev mode: show raw AI scores on entries */}
                      {devModeActive && (
                        <View style={styles.devEntryDebug}>
                          <Text style={styles.devDebugText}>
                            🤖 sentiment: {entry.sentiment_score?.toFixed(3) ?? "—"} | mood: {entry.mood_label ?? "—"} | anomaly: {entry.anomaly_flag ? "⚠️" : "✓"}
                          </Text>
                        </View>
                      )}
                    </ResponsiveCard>
                  ))}
                </View>
              </View>
            )}

            {/* Quick Actions removed — accessible via tab bar heart button */}
          </View>
        </ScrollView>
      </LinearGradient>
       {/* ════════════════════════════════════════════════════════
          PASSPHRASE MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal
        visible={showPassphraseModal}
        transparent
        animationType="fade"
        onRequestClose={handlePassphraseCancel}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.passphraseModal}>
            <View style={styles.passphraseHeader}>
              <Ionicons name="code-slash" size={24} color="#6366f1" />
              <Text style={styles.passphraseTitle}>Developer Access</Text>
            </View>
            <Text style={styles.passphraseSubtitle}>Enter passphrase to enable dev mode</Text>

            <TextInput
              style={[styles.passphraseInput, passphraseError ? styles.passphraseInputError : null]}
              value={passphrase}
              onChangeText={(t) => { setPassphrase(t); setPassphraseError("") }}
              placeholder="Passphrase"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handlePassphraseSubmit}
            />

            {passphraseError ? (
              <Text style={styles.passphraseError}>{passphraseError}</Text>
            ) : null}

            <View style={styles.passphraseActions}>
              <TouchableOpacity
                style={styles.passphraseCancelBtn}
                onPress={handlePassphraseCancel}
              >
                <Text style={styles.passphraseCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.passphraseSubmitBtn, authenticating && styles.passphraseSubmitDisabled]}
                onPress={handlePassphraseSubmit}
                disabled={authenticating}
              >
                <Text style={styles.passphraseSubmitText}>
                  {authenticating ? "Verifying..." : "Unlock"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════
          DEV PANEL MODAL
      ════════════════════════════════════════════════════════ */}
      <Modal
        visible={showDevPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDevPanel(false)}
      >
        <View style={styles.devPanelOverlay}>
          <View style={styles.devPanel}>
            {/* Panel Header */}
            <View style={styles.devPanelHeader}>
              <View style={styles.devPanelTitleRow}>
                <Ionicons name="code-slash" size={20} color="#6366f1" />
                <Text style={styles.devPanelTitle}>Dev Mode</Text>
                <View style={styles.devPanelSessionBadge}>
                  <Text style={styles.devPanelSessionText}>⏱ {sessionLabel}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowDevPanel(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* ── Section: Wellness Score Override ── */}
              <View style={styles.devSection}>
                <Text style={styles.devSectionTitle}>🎯 Wellness Score Override</Text>
                <Text style={styles.devSectionDesc}>
                  Simulates a specific score for UI state testing. Not persisted.
                  {devModeService.wellnessScoreOverride !== null
                    ? `\nCurrently overriding to: ${devModeService.wellnessScoreOverride}`
                    : "\nCurrently using real score."}
                </Text>
                <View style={styles.devInputRow}>
                  <TextInput
                    style={styles.devInput}
                    value={devScoreInput}
                    onChangeText={setDevScoreInput}
                    placeholder="0 – 100"
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <TouchableOpacity style={styles.devActionBtn} onPress={applyScoreOverride}>
                    <Text style={styles.devActionBtnText}>Apply</Text>
                  </TouchableOpacity>
                  {devModeService.wellnessScoreOverride !== null && (
                    <TouchableOpacity style={styles.devClearBtn} onPress={clearScoreOverride}>
                      <Text style={styles.devClearBtnText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Section: Date Override (Backdating) ── */}
              <View style={styles.devSection}>
                <Text style={styles.devSectionTitle}>📅 Force Date (Backdating)</Text>
                <Text style={styles.devSectionDesc}>
                  Sets a past date as "today" for journal and mood logging. Lets you add entries for past days.
                  {devModeService.forcedDate
                    ? `\nForced to: ${devModeService.forcedDate}`
                    : "\nUsing real today."}
                </Text>
                <View style={styles.devInputRow}>
                  <TextInput
                    style={styles.devInput}
                    value={devDateInput}
                    onChangeText={setDevDateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    maxLength={10}
                  />
                  <TouchableOpacity style={styles.devActionBtn} onPress={applyDateOverride}>
                    <Text style={styles.devActionBtnText}>Apply</Text>
                  </TouchableOpacity>
                  {devModeService.forcedDate && (
                    <TouchableOpacity style={styles.devClearBtn} onPress={clearDateOverride}>
                      <Text style={styles.devClearBtnText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Section: Data Inspection ── */}
              <View style={styles.devSection}>
                <Text style={styles.devSectionTitle}>🔍 Data Inspection</Text>
                <TouchableOpacity style={styles.devFullBtn} onPress={showRawData}>
                  <Ionicons name="layers-outline" size={16} color="#6366f1" />
                  <Text style={styles.devFullBtnText}>View Raw Today's Data</Text>
                </TouchableOpacity>
              </View>

              {/* ── Section: Test Data Generation ── */}
              <View style={styles.devSection}>
                <Text style={styles.devSectionTitle}>🧪 Test Data Generation</Text>
                <Text style={styles.devSectionDesc}>
                  Generates a synthetic wellness record for yesterday. For UI testing only — not written to storage.
                </Text>
                <TouchableOpacity style={styles.devFullBtn} onPress={generateMockData}>
                  <Ionicons name="flask-outline" size={16} color="#6366f1" />
                  <Text style={styles.devFullBtnText}>Generate Mock Yesterday Record</Text>
                </TouchableOpacity>
              </View>

              {/* ── Section: Navigation Shortcuts ── */}
              <View style={styles.devSection}>
                <Text style={styles.devSectionTitle}>🧭 Screen Navigation</Text>
                {[
                  { label: "Journal", route: "Journal" },
                  { label: "Reports", route: "Reports" },
                  { label: "Settings", route: "Settings" },
                  { label: "Emergency", route: "Emergency" },
                  { label: "Track", route: "Track" },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.devNavBtn}
                    onPress={() => { setShowDevPanel(false); navigation.navigate(item.route) }}
                  >
                    <Text style={styles.devNavBtnText}>→ {item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Deactivate ── */}
              <TouchableOpacity style={styles.devDeactivateBtn} onPress={handleDeactivateDev}>
                <Ionicons name="power-outline" size={16} color="#ef4444" />
                <Text style={styles.devDeactivateBtnText}>Deactivate Dev Mode</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaWrapper>
  )
}

const getMoodColor = (label) => {
  if (label === 'positive') return "#d1fae5";
  if (label === 'neutral') return "#fef3c7";
  return "#fecaca"; // For negative
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: isTablet ? 28 : 24,
    fontWeight: "300",
    color: "#374151",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: isTablet ? 18 : 16,
    color: "#6b7280",
  },
  headerIcons: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Dev mode header badge
  devBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#6366f1",
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 10,
  },
  devBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  devBadgeTimer: { color: "rgba(255,255,255,0.8)", fontSize: 9 },
  wellnessCard: {
    marginBottom: 16,
  },
  wellnessHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  wellnessTitle: {
    fontSize: isTablet ? 20 : 18,
    fontWeight: "600",
    color: "#374151",
  },
  wellnessScore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  wellnessScoreDev: {
    borderWidth: 2, borderColor: "#6366f1", // purple ring in dev mode
  },
  wellnessScoreText: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  tapFeedback: { fontSize: 9, color: "#9ca3af", marginTop: 3 },
  devOverrideLabel: { fontSize: 9, color: "#6366f1", fontWeight: "700", marginTop: 2 },
  wellnessSubtitle: {
    fontSize: isTablet ? 16 : 14,
    color: "#6b7280",
  },
  insightCard: {
    marginBottom: 16,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: "600",
    color: "#1e40af",
  },
  insightMessage: {
    fontSize: isTablet ? 16 : 14,
    color: "#1e40af",
    marginBottom: 8,
    lineHeight: 20,
  },
  insightRecommendation: {
    fontSize: isTablet ? 15 : 13,
    color: "#3730a3",
    fontStyle: "italic",
  },

  
  content: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: "600",
    color: "#374151",
  },
  seeAllText: {
    fontSize: isTablet ? 16 : 14,
    color: "#059669",
    fontWeight: "600",
  },
  highlightCard: {
    alignItems: "center",
    padding: isTablet ? 20 : 16,
  },
  highlightIcon: {
    width: isTablet ? 48 : 40,
    height: isTablet ? 48 : 40,
    borderRadius: isTablet ? 24 : 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  highlightValue: {
    fontSize: isTablet ? 20 : 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  highlightLabel: {
    fontSize: isTablet ? 14 : 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  journalPreview: {
    gap: 16,
  },
  journalPreviewItem: {
    padding: 16,
  },
  journalPreviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  journalPreviewDate: {
    fontSize: isTablet ? 14 : 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  moodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  moodBadgeText: {
    fontSize: isTablet ? 12 : 10,
    fontWeight: "600",
    color: "#374151",
  },
  journalPreviewText: {
    fontSize: isTablet ? 16 : 14,
    color: "#374151",
    lineHeight: isTablet ? 24 : 20,
  },
  // Dev entry debug strip
  devEntryDebug: {
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: "#e0e7ff",
  },
  devDebugText: { fontSize: 10, color: "#6366f1", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  actionsGrid: { gap: 12 },
  actionCard: { padding: 16 },
  actionContent: { flexDirection: "row", alignItems: "center", gap: 16 },
  actionIcon: {
    width: isTablet ? 56 : 48, height: isTablet ? 56 : 48,
    borderRadius: isTablet ? 28 : 24,
    justifyContent: "center", alignItems: "center",
  },
  actionText: { flex: 1 },
  actionTitle: { fontSize: isTablet ? 18 : 16, fontWeight: "600", color: "#374151", marginBottom: 4 },
  actionSubtitle: { fontSize: isTablet ? 16 : 14, color: "#6b7280" },

  emergencyCard: { padding: 16 },
  emergencyContent: { flexDirection: "row", alignItems: "center", gap: 16 },
  emergencyIcon: {
    width: isTablet ? 48 : 40, height: isTablet ? 48 : 40,
    backgroundColor: "#fecaca", borderRadius: isTablet ? 24 : 20,
    justifyContent: "center", alignItems: "center",
  },
  emergencyText: { flex: 1 },
  emergencyTitle: { fontSize: isTablet ? 18 : 16, fontWeight: "600", color: "#374151", marginBottom: 4 },
  emergencySubtitle: { fontSize: isTablet ? 16 : 14, color: "#6b7280" },
  emergencyButton: {
    backgroundColor: "#dc2626",
    paddingHorizontal: isTablet ? 20 : 16, paddingVertical: isTablet ? 12 : 10,
    borderRadius: 8,
  },
  emergencyButtonText: { color: "#ffffff", fontSize: isTablet ? 16 : 14, fontWeight: "600" },

  // ── Passphrase Modal ────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  passphraseModal: {
    backgroundColor: "#fff", borderRadius: 20,
    padding: 28, width: "100%", maxWidth: 360,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 10,
  },
  passphraseHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  passphraseTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  passphraseSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 20 },
  passphraseInput: {
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10,
    padding: 14, fontSize: 16, color: "#374151",
    backgroundColor: "#f9fafb", marginBottom: 8,
  },
  passphraseInputError: { borderColor: "#ef4444" },
  passphraseError: { color: "#ef4444", fontSize: 13, marginBottom: 12 },
  passphraseActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  passphraseCancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#e5e7eb",
    alignItems: "center",
  },
  passphraseCancelText: { color: "#6b7280", fontWeight: "600", fontSize: 15 },
  passphraseSubmitBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: "#6366f1", alignItems: "center",
  },
  passphraseSubmitDisabled: { backgroundColor: "#a5b4fc" },
  passphraseSubmitText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // ── Dev Panel Modal ─────────────────────────────────────────
  devPanelOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  devPanel: {
    backgroundColor: "#0f172a",  // dark terminal vibe
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: "85%",
  },
  devPanelHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 20,
  },
  devPanelTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  devPanelTitle: { fontSize: 18, fontWeight: "700", color: "#f8fafc" },
  devPanelSessionBadge: {
    backgroundColor: "rgba(99,102,241,0.2)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "#6366f1",
  },
  devPanelSessionText: { color: "#818cf8", fontSize: 11, fontWeight: "600" },

  devSection: {
    backgroundColor: "#1e293b", borderRadius: 12,
    padding: 16, marginBottom: 12,
  },
  devSectionTitle: { fontSize: 13, fontWeight: "700", color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  devSectionDesc: { fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 17 },

  devInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  devInput: {
    flex: 1, backgroundColor: "#0f172a", borderRadius: 8,
    borderWidth: 1, borderColor: "#334155",
    paddingHorizontal: 12, paddingVertical: 10,
    color: "#f1f5f9", fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  devActionBtn: {
    backgroundColor: "#6366f1", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  devActionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  devClearBtn: {
    backgroundColor: "transparent", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1, borderColor: "#ef4444",
  },
  devClearBtnText: { color: "#ef4444", fontWeight: "600", fontSize: 13 },

  devFullBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#0f172a", borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: "#334155",
  },
  devFullBtnText: { color: "#818cf8", fontWeight: "600", fontSize: 13 },

  devNavBtn: {
    paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  devNavBtnText: { color: "#94a3b8", fontSize: 14 },

  devDeactivateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, padding: 14, marginTop: 8, marginBottom: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: "#ef4444",
  },
  devDeactivateBtnText: { color: "#ef4444", fontWeight: "700", fontSize: 14 },
})