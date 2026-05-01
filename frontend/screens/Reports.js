import { useEffect, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  Alert,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { LineChart } from "react-native-chart-kit"
import DateTimePicker from "@react-native-community/datetimepicker"
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import reportGenerationService from "../services/reportGenerationService"
import reportCacheService from "../services/reportCacheService"

// ─── PDF HTML Generator (outside component) ────────────────────────────────
const generateReportHTML = (report) => {
  if (!report) return ""

  const formatH = (v) => (v > 0 ? `${v.toFixed(1)}h` : "—")
  const formatS = (v) => (v > 0 ? `${Math.round(v)}%` : "—")
  const formatM = (m) => (m > 0 ? `${(m / 60).toFixed(1)}h` : "—")

  const formatD = (dateStr) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDShort = (dateStr) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const getDeltaText = (delta, unit, invert = false) => {
    if (delta === null || delta === undefined || isNaN(delta)) return ""
    if (delta === 0) return `<span style="color:#94a3b8">→ Same</span>`
    const improved = invert ? delta < 0 : delta > 0
    const color = improved ? "#10b981" : "#ef4444"
    const arrow = delta > 0 ? "↑" : "↓"
    return `<span style="color:${color};font-weight:700;">${arrow} ${Math.abs(delta).toFixed(1)}${unit}</span>`
  }

  const getConfColor = (c) => {
    switch (c) {
      case "high": return "#10b981"
      case "medium": return "#f59e0b"
      case "low": return "#f97316"
      default: return "#94a3b8"
    }
  }

  const getCovColor = (p) => {
    if (p >= 70) return "#10b981"
    if (p >= 40) return "#f59e0b"
    return "#ef4444"
  }

  const getCovBar = (percent) => {
    const color = getCovColor(percent)
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div style="flex:1;height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
          <div style="width:${percent}%;height:100%;background:${color};border-radius:999px;"></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:${color};min-width:32px;">${percent}%</span>
      </div>
    `
  }

  const insights = report.insights || []
  const recommendations = report.recommendations || []
  const topApps = report.topApps || []
  const drivers = report.drivers || []
  const coverage = report.coverage
  const volatility = report.volatility
  const changes = report.changes
  const summary = report.summary || {}
  const confidence = coverage?.confidence

  const startDate = formatDShort(report.dateRange?.start)
  const endDate = formatDShort(report.dateRange?.end)
  const generatedAt = formatD(report.generatedAt)

  const metricsHTML = `
    <div class="section no-break">
      <div class="section-title">Key Metrics</div>
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-icon" style="background:#eff6ff;">🌙</div>
          <div class="metric-value">${formatH(summary.avgSleepHours || 0)}</div>
          <div class="metric-label">Avg Sleep</div>
          <div class="metric-delta">${getDeltaText(changes?.sleep_hours_change, "h")}</div>
        </div>
        <div class="metric-card">
          <div class="metric-icon" style="background:#f0fdf4;">😊</div>
          <div class="metric-value">${formatS(summary.avgMoodScore || 0)}</div>
          <div class="metric-label">Mood Score</div>
          <div class="metric-delta">${getDeltaText(changes?.mood_score_change, "")}</div>
        </div>
        <div class="metric-card">
          <div class="metric-icon" style="background:#faf5ff;">📓</div>
          <div class="metric-value">${summary.totalEntries ?? "—"}</div>
          <div class="metric-label">Journal Entries</div>
          <div class="metric-delta"></div>
        </div>
        <div class="metric-card">
          <div class="metric-icon" style="background:#fffbeb;">📱</div>
          <div class="metric-value">${formatM(summary.avgScreenTimeMinutes || 0)}</div>
          <div class="metric-label">Screen Time</div>
          <div class="metric-delta">${getDeltaText(changes?.screen_time_change, "m", true)}</div>
        </div>
      </div>
    </div>
  `

  const changesHTML = !changes ? "" : `
    <div class="section break-before">
      <div class="section-title">Changes vs Last Period</div>
      <div class="changes-grid">
        <div class="change-item">
          <div class="change-label">Sleep</div>
          <div class="change-value">${getDeltaText(changes.sleep_hours_change, "h") || "—"}</div>
        </div>
        <div class="change-item">
          <div class="change-label">Mood</div>
          <div class="change-value">${getDeltaText(changes.mood_score_change, "") || "—"}</div>
        </div>
        <div class="change-item">
          <div class="change-label">Screen Time</div>
          <div class="change-value">${getDeltaText(changes.screen_time_change, "m", true) || "—"}</div>
        </div>
      </div>
    </div>
  `

  const insightsHTML = insights.length === 0 ? "" : `
    <div class="section">
      <div class="section-title">What Your Data Shows</div>
      <div class="section-subtitle">Patterns identified from your tracked days</div>
      ${insights.slice(0, 4).map((insight) => `
        <div class="insight-item">
          <div class="insight-accent" style="background:${insight.color || "#8b5cf6"};"></div>
          <div class="insight-body">
            <div class="insight-title">${insight.title || ""}</div>
            <div class="insight-subtitle">${insight.subtitle || ""}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `

  const recColors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b"]
  const recsHTML = recommendations.length === 0 ? "" : `
    <div class="section break-before">
      <div class="section-title">Based on Your Patterns</div>
      <div class="section-subtitle">Small adjustments that match your current habits</div>
      ${recommendations.slice(0, 5).map((rec, i) => `
        <div class="rec-item">
          <div class="rec-number" style="background:${recColors[i % 4]}18;color:${recColors[i % 4]};">
            ${i + 1}
          </div>
          <div class="rec-text">${rec}</div>
        </div>
      `).join("")}
    </div>
  `

  const appsHTML = topApps.length === 0 ? "" : `
    <div class="col-section">
      <div class="section-title">Top Apps by Usage</div>
      ${topApps.slice(0, 5).map((app, i) => {
        const maxShare = topApps[0]?.sharePercent || 1
        const barPct = Math.round(((app.sharePercent || 0) / maxShare) * 100)
        return `
          <div class="app-row">
            <div class="app-rank">${i + 1}</div>
            <div class="app-info">
              <div class="app-name-row">
                <span class="app-name">${app.appName}</span>
                <span class="app-time">${formatM(app.minutes)}</span>
              </div>
              <div style="height:5px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-top:4px;">
                <div style="width:${barPct}%;height:100%;background:#f59e0b;border-radius:999px;"></div>
              </div>
            </div>
          </div>
        `
      }).join("")}
    </div>
  `

  const coverageHTML = !coverage ? "" : `
    <div class="col-section">
      <div class="section-title">Data Coverage</div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="cov-label">Sleep</span>
          <span class="cov-days">${coverage.sleepDays}/${coverage.totalDays} days</span>
        </div>
        ${getCovBar(coverage.sleepCoverage)}
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="cov-label">Mood</span>
          <span class="cov-days">${coverage.moodDays}/${coverage.totalDays} days</span>
        </div>
        ${getCovBar(coverage.moodCoverage)}
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="cov-label">Activity</span>
          <span class="cov-days">${coverage.activityDays}/${coverage.totalDays} days</span>
        </div>
        ${getCovBar(coverage.activityCoverage)}
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span class="cov-label">App Usage</span>
          <span class="cov-days">${coverage.appUsageDays}/${coverage.totalDays} days</span>
        </div>
        ${getCovBar(coverage.appUsageCoverage)}
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;">
        <span style="font-size:11px;color:#475569;">Overall: </span>
        <span style="font-size:11px;font-weight:700;color:${getCovColor(coverage.overallCoverage)};">
          ${coverage.overallCoverage}%
        </span>
      </div>
    </div>
  `

  const driversHTML = drivers.length === 0 ? "" : `
    <div class="section break-before">
      <div class="section-title">What's Influencing You</div>
      <div class="section-subtitle">Factors that correlate with changes in your data</div>
      ${drivers.slice(0, 4).map((d) => `
        <div class="driver-row">
          <span class="driver-badge">${d.strength}</span>
          <div class="driver-info">
            <div class="driver-factor">${d.factor.replace(/_/g, " ")}</div>
            <div class="driver-note">${d.note}</div>
          </div>
        </div>
      `).join("")}
      ${volatility ? `
        <div class="volatility-row">
          <div class="volatility-item">
            <span class="vol-label">Sleep consistency</span>
            <span class="vol-value">${volatility.sleepVolatility}</span>
          </div>
          <div class="vol-divider"></div>
          <div class="volatility-item">
            <span class="vol-label">Mood consistency</span>
            <span class="vol-value">${volatility.moodVolatility}</span>
          </div>
        </div>
      ` : ""}
    </div>
  `

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          background: #ffffff;
          color: #1f2937;
          font-size: 11px;
          line-height: 1.4;
        }

        .no-break {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .break-before {
          page-break-before: auto;
          break-before: auto;
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 12px;
          border-bottom: 2px solid #e5e7eb;
          margin-bottom: 16px;
          page-break-after: avoid;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .brand-icon {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: white;
        }

        .brand-name {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.3px;
        }

        .report-type {
          font-size: 10px;
          color: #6b7280;
          margin-top: 2px;
        }

        .header-right {
          text-align: right;
        }

        .date-range {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 6px;
        }

        .confidence-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1.5px solid ${getConfColor(confidence)};
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 9px;
          font-weight: 700;
          color: ${getConfColor(confidence)};
        }

        .conf-dot {
          width: 5px;
          height: 5px;
          background: ${getConfColor(confidence)};
          border-radius: 50%;
          display: inline-block;
        }

        .section {
          margin-bottom: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #f1f5f9;
        }

        .section-title {
          font-size: 9px;
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin-bottom: 6px;
        }

        .section-subtitle {
          font-size: 9px;
          color: #9ca3af;
          margin-bottom: 8px;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .metric-card {
          background: #f8fafc;
          border-radius: 8px;
          padding: 10px 8px;
        }

        .metric-icon {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          margin-bottom: 6px;
        }

        .metric-value {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.3px;
        }

        .metric-label {
          font-size: 9px;
          color: #6b7280;
          margin-top: 2px;
        }

        .metric-delta {
          font-size: 9px;
          font-weight: 600;
          margin-top: 3px;
          min-height: 12px;
        }

        .changes-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .change-item {
          background: #f8fafc;
          border-radius: 8px;
          padding: 8px;
        }

        .change-label {
          font-size: 9px;
          color: #6b7280;
          margin-bottom: 3px;
        }

        .change-value {
          font-size: 12px;
          font-weight: 700;
        }

        .insight-item {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          align-items: flex-start;
          margin-top: 6px;
          page-break-inside: avoid;
        }

        .insight-accent {
          width: 3px;
          min-height: 28px;
          border-radius: 2px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .insight-body { flex: 1; }

        .insight-title {
          font-size: 11px;
          font-weight: 600;
          color: #1f2937;
        }

        .insight-subtitle {
          font-size: 9px;
          color: #6b7280;
          margin-top: 2px;
          line-height: 1.4;
        }

        .rec-item {
          display: flex;
          gap: 8px;
          margin-bottom: 7px;
          align-items: flex-start;
          margin-top: 6px;
          page-break-inside: avoid;
        }

        .rec-number {
          width: 18px;
          height: 18px;
          border-radius: 6px;
          font-size: 9px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          text-align: center;
          line-height: 18px;
        }

        .rec-text {
          font-size: 10px;
          color: #374151;
          line-height: 1.5;
          flex: 1;
          padding-top: 1px;
        }

        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #f1f5f9;
          page-break-inside: avoid;
        }

        .col-section .section-title {
          margin-bottom: 8px;
        }

        .app-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 7px;
          margin-top: 4px;
        }

        .app-rank {
          font-size: 10px;
          font-weight: 700;
          color: #d1d5db;
          width: 12px;
          text-align: center;
          flex-shrink: 0;
        }

        .app-info { flex: 1; }

        .app-name-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }

        .app-name {
          font-size: 10px;
          font-weight: 600;
          color: #1f2937;
        }

        .app-time {
          font-size: 9px;
          color: #6b7280;
        }

        .cov-label {
          font-size: 10px;
          color: #374151;
          font-weight: 500;
        }

        .cov-days {
          font-size: 9px;
          color: #6b7280;
        }

        .driver-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid #f8fafc;
          page-break-inside: avoid;
        }

        .driver-badge {
          background: #f1f5f9;
          border-radius: 5px;
          padding: 2px 6px;
          font-size: 8px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .driver-info { flex: 1; }

        .driver-factor {
          font-size: 10px;
          font-weight: 600;
          color: #1f2937;
          text-transform: capitalize;
        }

        .driver-note {
          font-size: 9px;
          color: #6b7280;
          line-height: 1.4;
          margin-top: 2px;
        }

        .volatility-row {
          display: flex;
          margin-top: 10px;
          background: #f8fafc;
          border-radius: 8px;
          padding: 8px 10px;
        }

        .volatility-item {
          flex: 1;
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .vol-divider {
          width: 1px;
          background: #e2e8f0;
          margin: 0 10px;
        }

        .vol-label {
          font-size: 9px;
          color: #64748b;
          flex: 1;
        }

        .vol-value {
          font-size: 10px;
          font-weight: 700;
          color: #1e293b;
        }

        .report-footer {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          page-break-inside: avoid;
        }

        .footer-brand {
          font-size: 10px;
          font-weight: 600;
          color: #6b7280;
        }

        .footer-date {
          font-size: 9px;
          color: #9ca3af;
        }

        .footer-note {
          font-size: 8px;
          color: #d1d5db;
          margin-top: 6px;
          text-align: center;
        }
      </style>
    </head>
    <body>

      <div class="report-header">
        <div>
          <div class="brand">
            <div class="brand-icon">◈</div>
            <div class="brand-name">Equilibrium</div>
          </div>
          <div class="report-type">Wellness Report · ${startDate} – ${endDate}</div>
        </div>
        <div class="header-right">
          <div class="date-range">${startDate} – ${endDate}</div>
          ${confidence ? `
            <div class="confidence-badge">
              <span class="conf-dot"></span>
              ${confidence} confidence
            </div>
          ` : ""}
        </div>
      </div>

      ${metricsHTML}
      ${changesHTML}
      ${insightsHTML}
      ${recsHTML}

      ${(topApps.length > 0 || coverage) ? `
        <div class="two-col">
          ${appsHTML}
          ${coverageHTML}
        </div>
      ` : ""}

      ${driversHTML}

      <div class="report-footer">
        <div class="footer-brand">◈ Equilibrium</div>
        <div class="footer-date">Generated on ${generatedAt}</div>
      </div>
      <div class="footer-note">
        This report reflects data you have personally tracked in Equilibrium.
      </div>

    </body>
    </html>
  `
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function Reports({ navigation }) {
  const { width: screenWidth } = Dimensions.get("window")

  const baseReportTypes = [
    {
      key: "weekly",
      days: 7,
      icon: "trending-up",
      title: "Weekly",
      subtitle: "Last 7 days",
      color: "#10b981",
    },
    {
      key: "monthly",
      days: 30,
      icon: "calendar-outline",
      title: "Monthly",
      subtitle: "Last 30 days",
      color: "#8b5cf6",
    },
  ]

  const [customReport, setCustomReport] = useState(null)
  const [reports, setReports] = useState({ weekly: null, monthly: null })
  const [activeType, setActiveType] = useState("weekly")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customStartDate, setCustomStartDate] = useState(new Date())
  const [customEndDate, setCustomEndDate] = useState(new Date())
  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)
  const [customError, setCustomError] = useState("")
  const [customLoading, setCustomLoading] = useState(false)

  const [showTrendModal, setShowTrendModal] = useState(false)
  const [trendModalType, setTrendModalType] = useState(null)

  const [generatingPDF, setGeneratingPDF] = useState(false)

  const reportTypes = customReport
    ? [
        ...baseReportTypes,
        {
          key: "custom",
          days: customReport.periodDays,
          icon: "options-outline",
          title: "Custom",
          subtitle: `${customReport.dateRange?.start || ""} → ${customReport.dateRange?.end || ""}`,
          color: "#0ea5e9",
        },
      ]
    : baseReportTypes

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true)
      setError("")
      try {
        const [weeklyCached, monthlyCached] = await Promise.all([
          reportCacheService.getCachedReport("weekly"),
          reportCacheService.getCachedReport("monthly"),
        ])
        setReports({
          weekly: weeklyCached || null,
          monthly: monthlyCached || null,
        })
        if (!weeklyCached && !monthlyCached) {
          setError("Reports are being prepared. Check back shortly.")
        }
      } catch (e) {
        setError("Failed to load reports")
      } finally {
        setLoading(false)
      }
    }
    loadReports()
  }, [])

  const activeReport = activeType === "custom" ? customReport : reports[activeType]

  // ─── Formatters ────────────────────────────────────────────────
  const formatHours = (value) => (value > 0 ? `${value.toFixed(1)}h` : "—")
  const formatScore = (value) => (value > 0 ? `${Math.round(value)}%` : "—")
  const formatMinutesAsHours = (minutes) =>
    minutes > 0 ? `${(minutes / 60).toFixed(1)}h` : "—"

  const formatChange = (delta, unit) => {
    if (delta === null || delta === undefined || Number.isNaN(delta)) return null
    if (delta === 0) return { text: "Same as before", neutral: true }
    const direction = delta > 0 ? "↑" : "↓"
    const value = Math.abs(delta).toFixed(1)
    return { text: `${direction} ${value}${unit}`, neutral: false }
  }

  const getChangeColor = (delta, invert = false) => {
    if (delta === null || delta === undefined || Number.isNaN(delta) || delta === 0)
      return "#94a3b8"
    const improved = invert ? delta < 0 : delta > 0
    return improved ? "#10b981" : "#ef4444"
  }

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const formatDateLong = (dateStr) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTimeLabel = (dateStr) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const formatDateToYYYYMMDD = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case "high": return "#10b981"
      case "medium": return "#f59e0b"
      case "low": return "#f97316"
      case "none": return "#94a3b8"
      default: return "#94a3b8"
    }
  }

  const getCoverageColor = (percent) => {
    if (percent >= 70) return "#10b981"
    if (percent >= 40) return "#f59e0b"
    return "#ef4444"
  }

  // ─── Derived data ───────────────────────────────────────────────
  const metrics = [
    {
      icon: "moon-outline",
      iconColor: "#3b82f6",
      iconBg: "#eff6ff",
      value: formatHours(activeReport?.summary?.avgSleepHours || 0),
      label: "Avg Sleep",
      delta: activeReport?.changes?.sleep_hours_change,
      unit: "h",
      invert: false,
    },
    {
      icon: "happy-outline",
      iconColor: "#10b981",
      iconBg: "#f0fdf4",
      value: formatScore(activeReport?.summary?.avgMoodScore || 0),
      label: "Mood Score",
      delta: activeReport?.changes?.mood_score_change,
      unit: "",
      invert: false,
    },
    {
      icon: "journal-outline",
      iconColor: "#8b5cf6",
      iconBg: "#faf5ff",
      value: `${activeReport?.summary?.totalEntries ?? "—"}`,
      label: "Journal Entries",
      delta: null,
      unit: "",
      invert: false,
    },
    {
      icon: "phone-portrait-outline",
      iconColor: "#f59e0b",
      iconBg: "#fffbeb",
      value: formatMinutesAsHours(activeReport?.summary?.avgScreenTimeMinutes || 0),
      label: "Screen Time",
      delta: activeReport?.changes?.screen_time_change,
      unit: "m",
      invert: true,
    },
  ]

  const insights = activeReport?.insights || []
  const recommendations = activeReport?.recommendations || []
  const coverage = activeReport?.coverage
  const topApps = activeReport?.topApps || []
  const drivers = activeReport?.drivers || []
  const volatility = activeReport?.volatility

  // ─── Sparkline ──────────────────────────────────────────────────
  const renderSparkline = (dataPoints, color) => {
    const validData = (dataPoints || []).filter(
      (d) => d !== null && d !== undefined && !isNaN(d) && d >= 0
    )

    if (!validData || validData.length < 2) {
      return (
        <View style={styles.sparklinePlaceholder}>
          <Text style={styles.sparklinePlaceholderText}>Not enough data</Text>
        </View>
      )
    }

    const chartWidth = Math.min(160, screenWidth * 0.42)
    return (
      <LineChart
        data={{ labels: [], datasets: [{ data: validData }] }}
        width={chartWidth}
        height={52}
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        withHorizontalLines={false}
        chartConfig={{
          backgroundGradientFrom: "#ffffff",
          backgroundGradientTo: "#ffffff",
          color: () => color,
          strokeWidth: 2,
          propsForBackgroundLines: { stroke: "transparent" },
        }}
        bezier
        style={{ paddingRight: 0 }}
      />
    )
  }

  // ─── Actions ────────────────────────────────────────────────────
  const handleSharePDF = async () => {
    if (!activeReport) return
    setGeneratingPDF(true)
    try {
      console.log("Starting PDF generation with expo-print...")
      const html = generateReportHTML(activeReport)
      console.log("HTML generated, length:", html.length)
      
      const { uri } = await Print.printToFileAsync({ html })
      console.log("PDF generated at:", uri)
      
      if (!uri) {
        Alert.alert("Error", "Could not generate PDF")
        return
      }
      
      const isSharingAvailable = await Sharing.isAvailableAsync()
      console.log("Sharing available:", isSharingAvailable)
      
      if (isSharingAvailable) {
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
        })
      } else {
        Alert.alert("Success", "PDF saved to your device")
      }
    } catch (e) {
      console.error("PDF Error:", e)
      Alert.alert("Error", `Failed to generate PDF: ${e.message}`)
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handleCreateCustomReport = async () => {
    setCustomLoading(true)
    setCustomError("")
    try {
      const startStr = formatDateToYYYYMMDD(customStartDate)
      const endStr = formatDateToYYYYMMDD(customEndDate)

      if (new Date(startStr) > new Date(endStr)) {
        setCustomError("Start date must be before end date")
        setCustomLoading(false)
        return
      }

      const result = await reportGenerationService.generateDateRangeReport(startStr, endStr)
      if (!result.success) {
        setCustomError(result.message || "Failed to generate custom report")
        return
      }
      setCustomReport(result.report)
      setActiveType("custom")
      setShowCustomModal(false)
      setCustomStartDate(new Date())
      setCustomEndDate(new Date())
    } catch (e) {
      setCustomError("Failed to generate custom report")
    } finally {
      setCustomLoading(false)
    }
  }

  const handleViewTrendDetail = (type) => {
    setTrendModalType(type)
    setShowTrendModal(true)
  }

  // ─── Sub-renders ─────────────────────────────────────────────────
  const renderEmptyState = (icon, message) => (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={22} color="#d1d5db" />
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  )

  const renderCoverageRow = (label, percent, days, total) => {
    const barColor = getCoverageColor(percent)
    return (
      <View key={label} style={styles.coverageRow}>
        <View style={styles.coverageRowHeader}>
          <Text style={styles.coverageLabel}>{label}</Text>
          <Text style={styles.coverageValue}>{days}/{total} days</Text>
        </View>
        <View style={styles.coverageTrack}>
          <View
            style={[
              styles.coverageFill,
              { width: `${percent}%`, backgroundColor: barColor },
            ]}
          />
        </View>
        <Text style={[styles.coveragePercent, { color: barColor }]}>{percent}%</Text>
      </View>
    )
  }

  const renderStatusBanner = () => {
    if (loading) {
      return (
        <View style={[styles.statusBanner, { backgroundColor: "#eff6ff" }]}>
          <Ionicons name="hourglass-outline" size={16} color="#3b82f6" />
          <Text style={[styles.statusBannerText, { color: "#3b82f6" }]}>
            Preparing your report…
          </Text>
        </View>
      )
    }
    if (!loading && error) {
      return (
        <View style={[styles.statusBanner, { backgroundColor: "#fff7ed" }]}>
          <Ionicons name="information-circle-outline" size={16} color="#f97316" />
          <Text style={[styles.statusBannerText, { color: "#f97316" }]}>{error}</Text>
        </View>
      )
    }
    if (
      activeReport?.status === "no_data" ||
      activeReport?.status === "limited_data"
    ) {
      return (
        <View style={[styles.statusBanner, { backgroundColor: "#fefce8" }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#ca8a04" />
          <Text style={[styles.statusBannerText, { color: "#ca8a04" }]}>
            {activeReport.message}
          </Text>
        </View>
      )
    }
    return null
  }

  // ─── Trend Detail Modal ─────────────────────────────────────────
  const renderTrendDetailModal = () => {
    if (!trendModalType) return null

    const isSleep = trendModalType === "sleep"
    const rawPoints = isSleep
      ? (activeReport?.aggregate?.sleep?.daily_breakdown || []).map((d) => ({
          date: d.date,
          value: d.sleep_minutes ? parseFloat((d.sleep_minutes / 60).toFixed(1)) : null,
        }))
      : (activeReport?.aggregate?.wellness?.daily_breakdown || []).map((d) => ({
          date: d.date,
          value: d.mood_score || null,
        }))

    const validData = rawPoints.filter((d) => d.value !== null && d.value > 0)

    if (validData.length === 0) {
      return (
        <Modal
          visible={showTrendModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTrendModal(false)}
        >
          <View style={styles.trendModalOverlay}>
            <View style={styles.trendModalCard}>
              <View style={styles.trendModalHeader}>
                <View style={styles.trendModalTitleRow}>
                  <Ionicons
                    name={isSleep ? "moon-outline" : "happy-outline"}
                    size={20}
                    color={isSleep ? "#3b82f6" : "#10b981"}
                  />
                  <Text style={styles.trendModalTitle}>
                    {isSleep ? "Sleep Trend" : "Mood Trend"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowTrendModal(false)}>
                  <Ionicons name="close" size={22} color="#6b7280" />
                </TouchableOpacity>
              </View>
              {renderEmptyState(
                isSleep ? "moon-outline" : "happy-outline",
                "No data available for this period"
              )}
            </View>
          </View>
        </Modal>
      )
    }

    const values = validData.map((d) => parseFloat(d.value))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)

    const limitedData = validData.slice(-14)
    const chartLabels = limitedData.map((d) => formatDateLabel(d.date))
    const chartData = limitedData.map((d) => parseFloat(d.value))

    if (chartData.length < 2) {
      chartData.push(chartData[0] || 0)
      chartLabels.push("")
    }

    return (
      <Modal
        visible={showTrendModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTrendModal(false)}
      >
        <View style={styles.trendModalOverlay}>
          <View style={styles.trendModalCard}>
            <View style={styles.trendModalHeader}>
              <View style={styles.trendModalTitleRow}>
                <Ionicons
                  name={isSleep ? "moon-outline" : "happy-outline"}
                  size={20}
                  color={isSleep ? "#3b82f6" : "#10b981"}
                />
                <Text style={styles.trendModalTitle}>
                  {isSleep ? "Sleep Trend" : "Mood Trend"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTrendModal(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.trendStatsRow}>
              <View style={styles.trendStat}>
                <Text style={styles.trendStatLabel}>Min</Text>
                <Text style={styles.trendStatValue}>
                  {isSleep ? `${min.toFixed(1)}h` : Math.round(min)}
                </Text>
              </View>
              <View style={styles.trendStat}>
                <Text style={styles.trendStatLabel}>Avg</Text>
                <Text style={styles.trendStatValue}>
                  {isSleep ? `${avg}h` : Math.round(avg)}
                </Text>
              </View>
              <View style={styles.trendStat}>
                <Text style={styles.trendStatLabel}>Max</Text>
                <Text style={styles.trendStatValue}>
                  {isSleep ? `${max.toFixed(1)}h` : Math.round(max)}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.trendModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <LineChart
                data={{
                  labels: chartLabels,
                  datasets: [{ data: chartData }],
                }}
                width={screenWidth - 64}
                height={220}
                chartConfig={{
                  backgroundColor: "#ffffff",
                  backgroundGradientFrom: "#ffffff",
                  backgroundGradientTo: "#ffffff",
                  decimalPlaces: isSleep ? 1 : 0,
                  color: () => (isSleep ? "#3b82f6" : "#10b981"),
                  labelColor: () => "#6b7280",
                  style: { borderRadius: 16 },
                  propsForDots: {
                    r: "4",
                    strokeWidth: "2",
                    stroke: isSleep ? "#3b82f6" : "#10b981",
                  },
                }}
                bezier
                style={styles.trendDetailChart}
              />

              <View style={styles.trendDataList}>
                <Text style={styles.trendDataListTitle}>Daily Breakdown</Text>
                {[...validData].reverse().map((d, i) => (
                  <View key={i} style={styles.trendDataRow}>
                    <Text style={styles.trendDataDate}>{formatDateLong(d.date)}</Text>
                    <Text style={styles.trendDataValue}>
                      {isSleep ? `${d.value}h` : Math.round(parseFloat(d.value))}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    )
  }

  return (
    <SafeAreaWrapper backgroundColor="#f1f5f9" statusBarStyle="dark-content">
      <LinearGradient colors={["#f1f5f9", "#dbeafe"]} style={styles.gradient}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Wellness Report</Text>
            {activeReport?.dateRange && (
              <Text style={styles.headerSubtitle}>
                {formatDateLabel(activeReport.dateRange.start)} –{" "}
                {formatDateLabel(activeReport.dateRange.end)}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.headerIconBtn,
              (!activeReport || generatingPDF) && { opacity: 0.35 },
            ]}
            onPress={handleSharePDF}
            disabled={!activeReport || generatingPDF}
          >
            <Ionicons
              name={generatingPDF ? "hourglass-outline" : "share-outline"}
              size={20}
              color="#374151"
            />
          </TouchableOpacity>
        </View>

        {/* ── Tab Selector ── */}
        <View style={styles.tabRow}>
          {reportTypes.map((r) => {
            const isActive = activeType === r.key
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.tab, isActive && { backgroundColor: "#ffffff" }]}
                onPress={() => setActiveType(r.key)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={r.icon}
                  size={14}
                  color={isActive ? r.color : "#9ca3af"}
                />
                <Text
                  style={[
                    styles.tabText,
                    isActive && { color: r.color, fontWeight: "600" },
                  ]}
                >
                  {r.title}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderStatusBanner()}

          {activeReport && (
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                Updated {formatDateTimeLabel(activeReport.generatedAt)}
              </Text>
              {coverage?.confidence && (
                <View
                  style={[
                    styles.confidencePill,
                    { borderColor: getConfidenceColor(coverage.confidence) },
                  ]}
                >
                  <View
                    style={[
                      styles.confidenceDot,
                      {
                        backgroundColor: getConfidenceColor(coverage.confidence),
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.confidenceText,
                      { color: getConfidenceColor(coverage.confidence) },
                    ]}
                  >
                    {coverage.confidence} confidence
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Metrics ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>At a Glance</Text>
            </View>
            <View style={styles.metricsGrid}>
              {metrics.map((m, i) => {
                const change = formatChange(m.delta, m.unit)
                const changeColor = getChangeColor(m.delta, m.invert)
                return (
                  <View key={i} style={styles.metricCell}>
                    <View
                      style={[
                        styles.metricIconWrap,
                        { backgroundColor: m.iconBg },
                      ]}
                    >
                      <Ionicons name={m.icon} size={16} color={m.iconColor} />
                    </View>
                    <Text style={styles.metricValue}>{m.value}</Text>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    {change ? (
                      <Text
                        style={[styles.metricChange, { color: changeColor }]}
                      >
                        {change.text}
                      </Text>
                    ) : (
                      <Text style={styles.metricChangePlaceholder}>
                        vs last period
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>

          {/* ── Trend Sparklines ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="pulse-outline" size={17} color="#3b82f6" />
              <Text style={styles.cardTitle}>Trends</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Day-by-day movement over this period
            </Text>

            <View style={styles.trendRow}>
              <View style={styles.trendLabelWrap}>
                <Ionicons name="moon-outline" size={14} color="#3b82f6" />
                <Text style={styles.trendLabel}>Sleep</Text>
              </View>
              <View style={styles.trendActions}>
                {renderSparkline(
                  (
                    activeReport?.aggregate?.sleep?.daily_breakdown || []
                  )
                    .map((d) => d.sleep_minutes || 0)
                    .filter((m) => m > 0),
                  "#3b82f6"
                )}
                <TouchableOpacity
                  style={styles.trendDetailBtn}
                  onPress={() => handleViewTrendDetail("sleep")}
                >
                  <Ionicons name="chevron-forward" size={14} color="#3b82f6" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.trendRow, { marginBottom: 0 }]}>
              <View style={styles.trendLabelWrap}>
                <Ionicons name="happy-outline" size={14} color="#10b981" />
                <Text style={styles.trendLabel}>Mood</Text>
              </View>
              <View style={styles.trendActions}>
                {renderSparkline(
                  (
                    activeReport?.aggregate?.wellness?.daily_breakdown || []
                  )
                    .map((d) => d.mood_score || 0)
                    .filter((s) => s > 0),
                  "#10b981"
                )}
                <TouchableOpacity
                  style={styles.trendDetailBtn}
                  onPress={() => handleViewTrendDetail("mood")}
                >
                  <Ionicons name="chevron-forward" size={14} color="#10b981" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Insights ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="bar-chart-outline" size={17} color="#8b5cf6" />
              <Text style={styles.cardTitle}>What Your Data Shows</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Patterns identified from your tracked days
            </Text>

            {insights.length === 0 && !loading
              ? renderEmptyState(
                  "analytics-outline",
                  "Track a few more days to start seeing patterns."
                )
              : insights.map((insight, index) => (
                  <View key={index} style={styles.insightItem}>
                    <View
                      style={[
                        styles.insightAccent,
                        { backgroundColor: insight.color },
                      ]}
                    />
                    <View style={styles.insightBody}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      <Text style={styles.insightSubtitle}>
                        {insight.subtitle}
                      </Text>
                    </View>
                  </View>
                ))}
          </View>

          {/* ── Recommendations ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="leaf-outline" size={17} color="#10b981" />
              <Text style={styles.cardTitle}>Based on Your Patterns</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Small adjustments that match your current habits
            </Text>

            {recommendations.length === 0 && !loading
              ? renderEmptyState(
                  "chatbubble-ellipses-outline",
                  "Keep tracking — suggestions will show up here soon."
                )
              : recommendations.map((rec, index) => {
                  const colors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b"]
                  return (
                    <View key={index} style={styles.recItem}>
                      <View
                        style={[
                          styles.recNumber,
                          {
                            backgroundColor:
                              colors[index % colors.length] + "18",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.recNumberText,
                            { color: colors[index % colors.length] },
                          ]}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      <Text style={styles.recText}>{rec}</Text>
                    </View>
                  )
                })}
          </View>

          {/* ── Key Drivers ── */}
          {(drivers.length > 0 || volatility) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="compass-outline" size={17} color="#0ea5e9" />
                <Text style={styles.cardTitle}>What's Influencing You</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                Factors that correlate with changes in your data
              </Text>

              {drivers.length === 0
                ? renderEmptyState(
                    "compass-outline",
                    "Not enough data to identify drivers yet."
                  )
                : drivers.map((driver, index) => (
                    <View
                      key={`${driver.factor}-${index}`}
                      style={styles.driverRow}
                    >
                      <View style={styles.driverStrengthBadge}>
                        <Text style={styles.driverStrengthText}>
                          {driver.strength}
                        </Text>
                      </View>
                      <View style={styles.driverInfo}>
                        <Text style={styles.driverTitle}>
                          {driver.factor.replace(/_/g, " ")}
                        </Text>
                        <Text style={styles.driverNote}>{driver.note}</Text>
                      </View>
                    </View>
                  ))}

              {volatility && (
                <View style={styles.volatilityWrap}>
                  <View style={styles.volatilityItem}>
                    <Ionicons name="moon-outline" size={13} color="#64748b" />
                    <Text style={styles.volatilityLabel}>Sleep consistency</Text>
                    <Text style={styles.volatilityValue}>
                      {volatility.sleepVolatility}
                    </Text>
                  </View>
                  <View style={styles.volatilityDivider} />
                  <View style={styles.volatilityItem}>
                    <Ionicons name="happy-outline" size={13} color="#64748b" />
                    <Text style={styles.volatilityLabel}>Mood consistency</Text>
                    <Text style={styles.volatilityValue}>
                      {volatility.moodVolatility}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── Top Apps ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="phone-portrait-outline"
                size={17}
                color="#f59e0b"
              />
              <Text style={styles.cardTitle}>Top Apps by Usage</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Your most-used apps this period
            </Text>

            {topApps.length === 0 && !loading
              ? renderEmptyState(
                  "phone-portrait-outline",
                  "No app usage data available yet."
                )
              : topApps.map((app, index) => {
                  const maxShare = topApps[0]?.sharePercent || 1
                  const barWidth = `${
                    ((app.sharePercent || 0) / maxShare) * 100
                  }%`
                  return (
                    <View
                      key={`${app.appName}-${index}`}
                      style={styles.appRow}
                    >
                      <Text style={styles.appRank}>{index + 1}</Text>
                      <View style={styles.appInfo}>
                        <View style={styles.appNameRow}>
                          <Text style={styles.appName}>{app.appName}</Text>
                          <Text style={styles.appTime}>
                            {formatMinutesAsHours(app.minutes)}
                          </Text>
                        </View>
                        <View style={styles.appBarTrack}>
                          <View
                            style={[styles.appBarFill, { width: barWidth }]}
                          />
                        </View>
                      </View>
                    </View>
                  )
                })}
          </View>

          {/* ── Data Coverage ── */}
          {coverage && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="layers-outline" size={17} color="#64748b" />
                <Text style={styles.cardTitle}>Data Coverage</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                How many days have data for each category
              </Text>

              {renderCoverageRow(
                "Sleep",
                coverage.sleepCoverage,
                coverage.sleepDays,
                coverage.totalDays
              )}
              {renderCoverageRow(
                "Mood",
                coverage.moodCoverage,
                coverage.moodDays,
                coverage.totalDays
              )}
              {renderCoverageRow(
                "Activity",
                coverage.activityCoverage,
                coverage.activityDays,
                coverage.totalDays
              )}
              {renderCoverageRow(
                "App Usage",
                coverage.appUsageCoverage,
                coverage.appUsageDays,
                coverage.totalDays
              )}

              <View style={styles.coverageSummary}>
                <Text style={styles.coverageSummaryText}>
                  Overall coverage:{" "}
                  <Text
                    style={{
                      color: getCoverageColor(coverage.overallCoverage),
                      fontWeight: "600",
                    }}
                  >
                    {coverage.overallCoverage}%
                  </Text>
                </Text>
              </View>
            </View>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* ── Bottom action ── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.customBtn}
            onPress={() => setShowCustomModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.customBtnText}>
              {customReport ? "Change Custom Range" : "Custom Date Range"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── PDF Generating Overlay ── */}
        {generatingPDF && (
          <View style={styles.pdfOverlay}>
            <View style={styles.pdfOverlayCard}>
              <Ionicons name="document-text-outline" size={32} color="#2563eb" />
              <Text style={styles.pdfOverlayTitle}>Building your report…</Text>
              <Text style={styles.pdfOverlaySubtitle}>
                This takes just a second
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* ── Custom Report Modal ── */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustomModal(false)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Pick a start and end date to generate a report for any period.
            </Text>

            <Text style={styles.inputLabel}>Start date</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text style={styles.datePickerButtonText}>
                {formatDateLong(customStartDate.toISOString())}
              </Text>
            </TouchableOpacity>

            {showStartPicker && (
              <DateTimePicker
                value={customStartDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowStartPicker(Platform.OS === "ios")
                  if (selectedDate) setCustomStartDate(selectedDate)
                }}
              />
            )}

            <Text style={styles.inputLabel}>End date</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowEndPicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color="#6b7280" />
              <Text style={styles.datePickerButtonText}>
                {formatDateLong(customEndDate.toISOString())}
              </Text>
            </TouchableOpacity>

            {showEndPicker && (
              <DateTimePicker
                value={customEndDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowEndPicker(Platform.OS === "ios")
                  if (selectedDate) setCustomEndDate(selectedDate)
                }}
              />
            )}

            {customError ? (
              <View style={styles.modalErrorWrap}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color="#dc2626"
                />
                <Text style={styles.modalError}>{customError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  customLoading && { opacity: 0.7 },
                ]}
                onPress={handleCreateCustomReport}
                disabled={customLoading}
              >
                <Text style={styles.modalConfirmText}>
                  {customLoading ? "Generating…" : "Generate"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Trend Detail Modal ── */}
      {renderTrendDetailModal()}
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },

  // ─── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },

  // ─── Tabs ────────────────────────────────────────────────────
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: "#e5e7eb",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabText: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "500",
  },

  // ─── Scroll ──────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // ─── Status banner ───────────────────────────────────────────
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  // ─── Meta row ────────────────────────────────────────────────
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  confidencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // ─── Card ────────────────────────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#94a3b8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 16,
    marginLeft: 1,
  },

  // ─── Metrics ─────────────────────────────────────────────────
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  metricCell: {
    width: "50%",
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  metricChange: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  metricChangePlaceholder: {
    fontSize: 12,
    color: "#d1d5db",
    marginTop: 4,
  },

  // ─── Trends ──────────────────────────────────────────────────
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  trendLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trendLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  trendActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendDetailBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  sparklinePlaceholder: {
    width: 160,
    height: 52,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  sparklinePlaceholderText: {
    fontSize: 12,
    color: "#d1d5db",
  },

  // ─── Insights ────────────────────────────────────────────────
  insightItem: {
    flexDirection: "row",
    marginBottom: 14,
    alignItems: "flex-start",
  },
  insightAccent: {
    width: 3,
    borderRadius: 2,
    minHeight: 36,
    marginRight: 12,
    marginTop: 2,
  },
  insightBody: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  insightSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 3,
    lineHeight: 19,
  },

  // ─── Recommendations ─────────────────────────────────────────
  recItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  recNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  recNumberText: {
    fontSize: 12,
    fontWeight: "700",
  },
  recText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },

  // ─── Drivers ─────────────────────────────────────────────────
  driverRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  driverStrengthBadge: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 12,
    marginTop: 1,
  },
  driverStrengthText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  driverInfo: {
    flex: 1,
  },
  driverTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    textTransform: "capitalize",
  },
  driverNote: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 3,
    lineHeight: 18,
  },
  volatilityWrap: {
    flexDirection: "row",
    marginTop: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
  },
  volatilityItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  volatilityDivider: {
    width: 1,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 10,
  },
  volatilityLabel: {
    fontSize: 11,
    color: "#64748b",
    flex: 1,
  },
  volatilityValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
  },

  // ─── Top Apps ────────────────────────────────────────────────
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  appRank: {
    width: 18,
    fontSize: 13,
    fontWeight: "700",
    color: "#d1d5db",
    textAlign: "center",
  },
  appInfo: {
    flex: 1,
  },
  appNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  appName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  appTime: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  appBarTrack: {
    height: 5,
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    overflow: "hidden",
  },
  appBarFill: {
    height: 5,
    backgroundColor: "#f59e0b",
    borderRadius: 999,
  },

  // ─── Coverage ────────────────────────────────────────────────
  coverageRow: {
    marginBottom: 14,
  },
  coverageRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  coverageLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  coverageValue: {
    fontSize: 12,
    color: "#6b7280",
  },
  coverageTrack: {
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    overflow: "hidden",
  },
  coverageFill: {
    height: 8,
    borderRadius: 999,
  },
  coveragePercent: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  coverageSummary: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  coverageSummaryText: {
    fontSize: 13,
    color: "#475569",
  },

  // ─── Empty state ─────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 19,
  },

  // ─── Bottom bar ──────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 4,
  },
  customBtn: {
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  customBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },

  // ─── PDF Overlay ─────────────────────────────────────────────
  pdfOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  pdfOverlayCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  pdfOverlayTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  pdfOverlaySubtitle: {
    fontSize: 13,
    color: "#6b7280",
  },

  // ─── Modal ───────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#fafafa",
  },
  datePickerButtonText: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
  modalErrorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 12,
  },
  modalError: {
    fontSize: 13,
    color: "#dc2626",
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  modalConfirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  // ─── Trend Detail Modal ──────────────────────────────────────
  trendModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  trendModalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },
  trendModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  trendModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  trendStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    paddingVertical: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
  },
  trendStat: {
    alignItems: "center",
  },
  trendStatLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  trendStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  trendModalScroll: {
    flex: 1,
  },
  trendDetailChart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  trendDataList: {
    marginTop: 16,
    marginBottom: 30,
  },
  trendDataListTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  trendDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  trendDataDate: {
    fontSize: 13,
    color: "#6b7280",
  },
  trendDataValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
})