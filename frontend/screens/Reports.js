import { useEffect, useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Share } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import reportGenerationService from "../services/reportGenerationService"

export default function Reports({ navigation }) {
  const baseReportTypes = [
    {
      key: "weekly",
      days: 7,
      icon: "trending-up",
      title: "Weekly Summary",
      subtitle: "Your progress this week",
      color: "#10b981",
      bgColor: "#d1fae5",
    },
    {
      key: "monthly",
      days: 30,
      icon: "calendar",
      title: "Monthly Trends",
      subtitle: "Patterns from this month",
      color: "#8b5cf6",
      bgColor: "#ede9fe",
    },
  ]

  const [customReport, setCustomReport] = useState(null)
  const reportTypes = customReport
    ? [
        ...baseReportTypes,
        {
          key: "custom",
          days: customReport.periodDays,
          icon: "options",
          title: "Custom Range",
          subtitle: `${customReport.dateRange?.start || ""} → ${customReport.dateRange?.end || ""}`,
          color: "#0ea5e9",
          bgColor: "#e0f2fe",
        },
      ]
    : baseReportTypes

  const [reports, setReports] = useState({ weekly: null, monthly: null })
  const [activeType, setActiveType] = useState("weekly")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customStartDate, setCustomStartDate] = useState("")
  const [customEndDate, setCustomEndDate] = useState("")
  const [customError, setCustomError] = useState("")
  const [customLoading, setCustomLoading] = useState(false)

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true)
      setError("")
      try {
        const [weeklyRes, monthlyRes] = await Promise.all([
          reportGenerationService.generateWeeklyReport(),
          reportGenerationService.generateMonthlyReport(),
        ])

        setReports({
          weekly: weeklyRes.success ? weeklyRes.report : null,
          monthly: monthlyRes.success ? monthlyRes.report : null,
        })
      } catch (e) {
        setError("Failed to generate reports")
      } finally {
        setLoading(false)
      }
    }

    loadReports()
  }, [])

  const activeReport = activeType === "custom" ? customReport : reports[activeType]

  const formatHours = (value) => (value > 0 ? `${value.toFixed(1)}h` : "—")
  const formatScore = (value) => (value > 0 ? `${Math.round(value)}%` : "—")
  const formatMinutesAsHours = (minutes) => (minutes > 0 ? `${(minutes / 60).toFixed(1)}h` : "—")

  const formatChange = (delta, unit, invert = false) => {
    if (delta === null || delta === undefined || Number.isNaN(delta)) return "—"
    if (delta === 0) return "→ Same"
    const direction = delta > 0 ? "↑" : "↓"
    const value = Math.abs(delta).toFixed(1)
    return `${direction} ${value}${unit}`
  }

  const getChangeColor = (delta, invert = false) => {
    if (delta === null || delta === undefined || Number.isNaN(delta)) return "#3b82f6"
    if (delta === 0) return "#3b82f6"
    const improved = invert ? delta < 0 : delta > 0
    return improved ? "#10b981" : "#ef4444"
  }

  const weeklyMetrics = [
    {
      value: formatHours(activeReport?.summary?.avgSleepHours || 0),
      label: "Avg Sleep",
      change: formatChange(activeReport?.changes?.sleep_hours_change, "h"),
      changeColor: getChangeColor(activeReport?.changes?.sleep_hours_change),
      bgColor: "#dbeafe",
    },
    {
      value: formatScore(activeReport?.summary?.avgMoodScore || 0),
      label: "Mood Score",
      change: formatChange(activeReport?.changes?.mood_score_change, ""),
      changeColor: getChangeColor(activeReport?.changes?.mood_score_change),
      bgColor: "#d1fae5",
    },
    {
      value: `${activeReport?.summary?.totalEntries ?? "—"}`,
      label: "Journal Entries",
      change: "—",
      changeColor: "#3b82f6",
      bgColor: "#ede9fe",
    },
    {
      value: formatMinutesAsHours(activeReport?.summary?.avgScreenTimeMinutes || 0),
      label: "Screen Time",
      change: formatChange(activeReport?.changes?.screen_time_change, "m", true),
      changeColor: getChangeColor(activeReport?.changes?.screen_time_change, true),
      bgColor: "#fef3c7",
    },
  ]

  const insights = activeReport?.insights || []
  const recommendations = activeReport?.recommendations || []

  const handleExport = async () => {
    if (!activeReport) return
    try {
      const payload = JSON.stringify(activeReport, null, 2)
      await Share.share({
        title: activeReport.periodLabel || "Report",
        message: payload,
      })
    } catch (e) {
      setError("Failed to export report")
    }
  }

  const handleCreateCustomReport = async () => {
    setCustomLoading(true)
    setCustomError("")
    try {
      const result = await reportGenerationService.generateDateRangeReport(customStartDate, customEndDate)
      if (!result.success) {
        setCustomError(result.message || "Failed to generate custom report")
        return
      }
      setCustomReport(result.report)
      setActiveType("custom")
      setShowCustomModal(false)
    } catch (e) {
      setCustomError("Failed to generate custom report")
    } finally {
      setCustomLoading(false)
    }
  }

  return (
    <SafeAreaWrapper backgroundColor="#dbeafe" statusBarStyle="dark-content">
      <View style={styles.statusBarBg} />
      <LinearGradient colors={["#f1f5f9", "#dbeafe"]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#64748b" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Wellness Insights</Text>
              <Text style={styles.headerSubtitle}>Your journey in numbers</Text>
            </View>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="share-outline" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Report Types */}
          <View style={styles.section}>
            {reportTypes.map((report) => {
              const isActive = activeType === report.key
              return (
                <View key={report.key} style={styles.reportCard}>
                  <View style={styles.reportContent}>
                    <View style={[styles.reportIcon, { backgroundColor: report.bgColor }]}>
                      <Ionicons name={report.icon} size={24} color={report.color} />
                    </View>
                    <View style={styles.reportText}>
                      <Text style={styles.reportTitle}>{report.title}</Text>
                      <Text style={styles.reportSubtitle}>{report.subtitle}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.viewButton, { borderColor: report.color }]}
                      onPress={() => setActiveType(report.key)}
                    >
                      <Text style={[styles.viewButtonText, { color: report.color }]}>
                        {isActive ? "Active" : "View"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}
          </View>

          {/* Current Report */}
          <View style={styles.currentReportCard}>
            <View style={styles.currentReportHeader}>
              <Text style={styles.currentReportTitle}>
                {reportTypes.find((r) => r.key === activeType)?.title || "Report Summary"}
              </Text>
              <TouchableOpacity onPress={handleExport} disabled={!activeReport}>
                <Ionicons name="download-outline" size={20} color={activeReport ? "#3b82f6" : "#cbd5f5"} />
              </TouchableOpacity>
            </View>

            {loading && (
              <Text style={styles.emptyText}>Generating report...</Text>
            )}
            {!loading && error && (
              <Text style={styles.emptyText}>{error}</Text>
            )}
            {!loading && !error && activeReport?.status === "no_data" && (
              <Text style={styles.emptyText}>{activeReport.message}</Text>
            )}

            {/* Key Metrics */}
            <View style={styles.metricsGrid}>
              {weeklyMetrics.map((metric, index) => (
                <View key={index} style={[styles.metricCard, { backgroundColor: metric.bgColor }]}>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={[styles.metricChange, { color: metric.changeColor }]}>{metric.change}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Insights */}
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <Ionicons name="eye" size={20} color="#3b82f6" />
              <Text style={styles.insightsTitle}>Key Insights</Text>
            </View>
            <View style={styles.insightsList}>
              {insights.length === 0 && !loading ? (
                <Text style={styles.emptyText}>Not enough data for insights yet.</Text>
              ) : (
                insights.map((insight, index) => (
                  <View key={index} style={styles.insightItem}>
                    <View style={[styles.insightDot, { backgroundColor: insight.color }]} />
                    <View style={styles.insightText}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      <Text style={styles.insightSubtitle}>{insight.subtitle}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Recommendations */}
          <View style={styles.recommendationsCard}>
            <Text style={styles.recommendationsTitle}>Recommendations</Text>
            <View style={styles.recommendationsList}>
              {recommendations.length === 0 && !loading ? (
                <Text style={styles.emptyText}>Track a few more days to get tailored tips.</Text>
              ) : (
                recommendations.map((recommendation, index) => (
                  <View key={index} style={styles.recommendationItem}>
                    <View
                      style={[styles.recommendationDot, { backgroundColor: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b"][index % 4] }]}
                    />
                    <Text style={styles.recommendationText}>{recommendation}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Fixed Bottom Action */}
        <View style={styles.bottomAction}>
          <TouchableOpacity style={styles.customReportButton} onPress={() => setShowCustomModal(true)}>
            <Text style={styles.customReportButtonText}>Create Custom Report</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Custom Report Modal */}
      <Modal visible={showCustomModal} transparent animationType="slide" onRequestClose={() => setShowCustomModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom Date Range</Text>
            <Text style={styles.modalSubtitle}>Format: YYYY-MM-DD</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Start date"
              placeholderTextColor="#94a3b8"
              value={customStartDate}
              onChangeText={setCustomStartDate}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="End date"
              placeholderTextColor="#94a3b8"
              value={customEndDate}
              onChangeText={setCustomEndDate}
              autoCapitalize="none"
            />

            {customError ? <Text style={styles.modalError}>{customError}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCustomModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleCreateCustomReport} disabled={customLoading}>
                <Text style={styles.modalConfirmText}>{customLoading ? "Generating..." : "Generate"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  statusBarBg: {
    height: 0,
    backgroundColor: "#F7F8FA",
  },

  gradient: {
    flex: 1,
  },

  /* ================= HEADER ================= */

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },

  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8EC",
  },

  headerText: {
    flex: 1,
    marginLeft: 14,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1F2937",
    letterSpacing: -0.3,
  },

  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },

  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E8EC",
  },

  /* ================= CONTENT ================= */

  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  section: {
    marginBottom: 28,
  },

  reportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ECEEF2",
  },

  reportContent: {
    flexDirection: "row",
    alignItems: "center",
  },

  reportIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  reportText: {
    flex: 1,
    marginLeft: 14,
  },

  reportTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },

  reportSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },

  viewButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },

  viewButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },

  /* ================= CURRENT REPORT ================= */

  currentReportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#ECEEF2",
  },

  currentReportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  currentReportTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },

  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  metricCard: {
    width: "48%",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  metricValue: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111827",
  },

  metricLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },

  metricChange: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },

  /* ================= INSIGHTS ================= */

  insightsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#ECEEF2",
  },

  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  insightsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
  },

  insightsList: {
    marginTop: 4,
  },

  insightItem: {
    flexDirection: "row",
    marginBottom: 14,
  },

  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },

  insightText: {
    flex: 1,
    marginLeft: 10,
  },

  insightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },

  insightSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 18,
  },

  /* ================= RECOMMENDATIONS ================= */

  recommendationsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#ECEEF2",
  },

  recommendationsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },

  recommendationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  recommendationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },

  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    marginLeft: 10,
    lineHeight: 18,
  },

  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 6,
  },

  /* ================= BOTTOM ACTION ================= */

  bottomAction: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#ECEEF2",
  },

  customReportButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },

  customReportButtonText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600",
  },

  /* ================= MODAL ================= */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },

  modalSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 16,
  },

  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    marginBottom: 12,
    backgroundColor: "#FAFAFB",
  },

  modalError: {
    color: "#DC2626",
    fontSize: 12,
    marginBottom: 8,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },

  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
  },

  modalCancelText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },

  modalConfirm: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },

  modalConfirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
})
