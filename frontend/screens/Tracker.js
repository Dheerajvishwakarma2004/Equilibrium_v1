"use client"

import { useState, useEffect } from "react"
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  Dimensions,
  Platform,
} from "react-native"
import DateTimePicker from "@react-native-community/datetimepicker"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import localStorageService from "../services/localStorageService"
import behavioralTrackingService from "../services/behavioralTrackingService"
import sleepTrackingService from "../services/sleepTrackingService"

const { width } = Dimensions.get('window')

export default function Tracker({ navigation }) {
  const [data, setData] = useState({
    todayStats: [],
    sleepData: {},
    digitalData: [],
    appUsage: [],
    activityData: null,
  });
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false);

  // Sleep tracking preference
  const [sleepTrackingMode, setSleepTrackingMode] = useState("screen_usage")
  const [fitnessConnected, setFitnessConnected] = useState(false)
  const [autoTrackingEnabled, setAutoTrackingEnabled] = useState(false)

  // Sleep window states
  const [sleepWindow, setSleepWindow] = useState({ bedtime: null, wakeup: null })
  const [modalVisible, setModalVisible] = useState(false)
  const [tempBedtime, setTempBedtime] = useState(new Date())
  const [tempWakeup, setTempWakeup] = useState(new Date())
  const [pickerMode, setPickerMode] = useState(null)

  // Manual sleep logging modal
  const [manualSleepModalVisible, setManualSleepModalVisible] = useState(false)
  const [manualSleepStart, setManualSleepStart] = useState(new Date())
  const [manualSleepEnd, setManualSleepEnd] = useState(new Date())
  const [manualSleepStartPicker, setManualSleepStartPicker] = useState(false)
  const [manualSleepEndPicker, setManualSleepEndPicker] = useState(false)
  const [manualSleepDate, setManualSleepDate] = useState(new Date()) // ✅ ADDED: Date picker for sleep date
  const [manualSleepDatePicker, setManualSleepDatePicker] = useState(false) // ✅ ADDED
  const [isNap, setIsNap] = useState(false)

  // Bootstrap and missing data prompts
  const [showBootstrapPrompt, setShowBootstrapPrompt] = useState(false)
  const [showMissingPrompt, setShowMissingPrompt] = useState(false)
  const [missingDate, setMissingDate] = useState(null)

  // Activity listener
  const [activityListener, setActivityListener] = useState(null)

  // App usage expansion
  const [showAllApps, setShowAllApps] = useState(false)

  useEffect(() => {
    initializeSleepTracking()
    fetchSleepWindow()
    fetchSleepPreference()
    setupActivityTracking()
    checkForPrompts()
  }, [])

  useEffect(() => {
    fetchData()
  }, [sleepWindow, sleepTrackingMode, autoTrackingEnabled])

  useEffect(() => {
    return () => {
      if (activityListener) {
        activityListener()
      }
      sleepTrackingService.cleanup()
    }
  }, [activityListener])

  const initializeSleepTracking = async () => {
    try {
      await sleepTrackingService.initialize()
      const isEnabled = await sleepTrackingService.isAutoTrackingEnabled()
      setAutoTrackingEnabled(isEnabled)
    } catch (error) {
      console.error("Failed to initialize sleep tracking:", error)
    }
  }

  const setupActivityTracking = async () => {
    try {
      await behavioralTrackingService.startActivityTracking()
      
      const unsubscribe = behavioralTrackingService.addActivityListener((activityUpdate) => {
        if (activityUpdate && activityUpdate.type === 'step_update') {
          fetchData()
        }
      })
      
      setActivityListener(() => unsubscribe)
    } catch (error) {
      console.error("Failed to setup activity tracking:", error)
    }
  }

  const checkForPrompts = async () => {
    try {
      const shouldShowBootstrap = await sleepTrackingService.checkAndShowBootstrapPrompt()
      if (shouldShowBootstrap) {
        setShowBootstrapPrompt(true)
        return
      }

      const missingDataDate = await sleepTrackingService.checkMissingSleepData()
      if (missingDataDate) {
        setShowMissingPrompt(true)
        setMissingDate(missingDataDate)
      }
    } catch (error) {
      console.error("Error checking prompts:", error)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await fetchSleepWindow();
    await fetchSleepPreference();
    await checkForPrompts();
    setRefreshing(false);
  };

  const fetchSleepPreference = async () => {
    try {
      const prefs = await localStorageService.getSleepPreferences()
      if (prefs) {
        setSleepTrackingMode(prefs.mode || "screen_usage")
        setFitnessConnected(prefs.fitnessConnected || false)
      }

      const isAutoEnabled = await sleepTrackingService.isAutoTrackingEnabled()
      setAutoTrackingEnabled(isAutoEnabled)
    } catch (e) {
      console.log("No saved sleep preference")
    }
  }

  const saveSleepPreference = async (mode, connected = fitnessConnected) => {
    const prefs = { mode, fitnessConnected: connected }
    await localStorageService.saveSleepPreferences(prefs)
    setSleepTrackingMode(mode)
    setFitnessConnected(connected)
    await fetchData()
  }

  const toggleAutoTracking = async () => {
    try {
      if (!autoTrackingEnabled) {
        const success = await sleepTrackingService.enableAutoTracking()
        if (success) {
          setAutoTrackingEnabled(true)
          setSleepTrackingMode("auto_tracking")
          Alert.alert("Auto-Tracking Enabled", "Sleep will be automatically tracked during your sleep window.")
        }
      } else {
        await sleepTrackingService.disableAutoTracking()
        setAutoTrackingEnabled(false)
        setSleepTrackingMode("screen_usage")
        Alert.alert("Auto-Tracking Disabled", "Automatic sleep tracking has been turned off.")
      }
    } catch (error) {
      console.error("Error toggling auto-tracking:", error)
      Alert.alert("Error", "Failed to update auto-tracking settings")
    }
  }

  const connectHealthConnect = async () => {
    try {
      const granted = await behavioralTrackingService.requestHealthConnectPermission?.()
      
      if (granted) {
        setFitnessConnected(true)
        await saveSleepPreference("fitness_band", true)
        Alert.alert("Success", "Health Connect connected successfully! Your activity data from Google Fit will now sync automatically.")
      } else {
        Alert.alert(
          "Permission Required",
          "Please enable Health Connect permissions in your device settings to sync data from Google Fit."
        )
      }
    } catch (error) {
      console.error("Error connecting Health Connect:", error)
      Alert.alert("Error", "Failed to connect Health Connect. Please try again.")
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const wellnessData = await localStorageService.getWellnessData(1)
      const usageStats = await behavioralTrackingService.getDailyUsageStats()
      
      const activityData = await behavioralTrackingService.getCurrentActivityData()
      
      const appUsage = usageStats?.appUsage || [];
      const totalUsageMinutes = appUsage.reduce(
        (sum, app) => sum + (app.durationMinutes || 0),
        0
      );

      let sleepData = {
        totalMinutes: 0,
        hours: 0,
        source: "Not tracked",
        confidence: 0,
        isManual: false,
        sleepEfficiency: 0,
        deepSleepMinutes: 0,
        lightSleepMinutes: 0,
        wakeMinutes: 0,
        restlessnessIndex: 0,
        fragmentationCount: 0,
        actualSleepStart: null,
        actualSleepEnd: null,
        napCount: 0,
        napSessions: [], // ✅ ADDED for nap details rendering
      }

      if (autoTrackingEnabled) {
        const lastNightSleep = await sleepTrackingService.getLastNightSleep()
        if (lastNightSleep) {
          sleepData = {
            totalMinutes: lastNightSleep.total_sleep_minutes || 0,
            hours: (lastNightSleep.total_sleep_minutes || 0) / 60,
            source: lastNightSleep.sleep_source === 'manual' ? 'Manual Entry' : 'Auto-Tracked',
            confidence: lastNightSleep.confidence_score || 0,
            isManual: lastNightSleep.sleep_source === 'manual',
            sleepEfficiency: lastNightSleep.sleep_efficiency || 0,
            deepSleepMinutes: lastNightSleep.deep_sleep_minutes || 0,
            lightSleepMinutes: lastNightSleep.light_sleep_minutes || 0,
            wakeMinutes: lastNightSleep.wake_minutes || 0,
            restlessnessIndex: lastNightSleep.restlessness_index || 0,
            fragmentationCount: lastNightSleep.fragmentation_count || 0,
            actualSleepStart: lastNightSleep.sleep_start_time,
            actualSleepEnd: lastNightSleep.sleep_end_time,
            napCount: lastNightSleep.nap_sessions?.length || 0,
            napSessions: lastNightSleep.nap_sessions || [], // ✅ ADDED
          }
        }
      } 
      
      if (sleepData.totalMinutes === 0) {
        // ✅ IMPROVED: Try today first (for late sleepers), then yesterday
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        
        // ✅ Check today first (catches late sleepers 3 AM - 11 AM scenario)
        let manualSummary = await localStorageService.getSleepSummary?.(today)
        if (!manualSummary) {
          manualSummary = await localStorageService.getSleepSummary?.(yesterdayStr)
        }
        if (manualSummary && manualSummary.sleep_source === 'manual') {
          sleepData = {
            totalMinutes: manualSummary.total_sleep_minutes || manualSummary.sleep_duration || 0,
            hours: (manualSummary.total_sleep_minutes || manualSummary.sleep_duration || 0) / 60,
            source: 'Manual Entry',
            confidence: 1.0,
            isManual: true,
            sleepEfficiency: 0,
            deepSleepMinutes: 0,
            lightSleepMinutes: 0,
            wakeMinutes: 0,
            restlessnessIndex: 0,
            fragmentationCount: 0,
            actualSleepStart: manualSummary.sleep_start_time,
            actualSleepEnd: manualSummary.sleep_end_time,
            napCount: manualSummary.nap_sessions?.length || 0,
            napSessions: manualSummary.nap_sessions || [], // ✅ ADDED
          }
        } else if (sleepTrackingMode === "fitness_band" && fitnessConnected) {
          const fitnessData = await localStorageService.getFitnessSleepData(1)
          if (fitnessData && fitnessData.length > 0) {
            sleepData.hours = fitnessData[0].sleepHours || 0
            sleepData.totalMinutes = (fitnessData[0].sleepHours || 0) * 60
            sleepData.source = "Health Connect"
            sleepData.confidence = fitnessData[0].confidence || 0.95
          }
        } else {
          const screenSleepData = await localStorageService.getScreenUsageSleepData(1)
          if (screenSleepData && screenSleepData.length > 0) {
            sleepData.hours = screenSleepData[0].estimatedSleepHours || 0
            sleepData.totalMinutes = (screenSleepData[0].estimatedSleepHours || 0) * 60
            sleepData.source = "Screen Usage"
            sleepData.confidence = screenSleepData[0].confidence || 0.6
          } else if (usageStats?.sleepData) {
            sleepData.hours = usageStats.sleepData.estimatedSleepMinutes / 60
            sleepData.totalMinutes = usageStats.sleepData.estimatedSleepMinutes || 0
            sleepData.source = "Screen Usage"
            sleepData.confidence = usageStats.sleepData.confidence || 0.6
          }
        }
      }

      const formattedData = {
        todayStats: [
          {
            icon: "moon",
            value: sleepData.hours > 0
              ? `${Math.floor(sleepData.hours)}h ${Math.round((sleepData.hours % 1) * 60)}m`
              : "Not tracked",
            label: "SLEEP",
            color: "#8B5CF6",
            bgColor: "#F3E8FF",
            gradientColors: ["#8B5CF6", "#A78BFA"],
          },
          {
            icon: "phone-portrait",
            value: totalUsageMinutes > 0 ? formatDuration(totalUsageMinutes): "Not tracked",
            label: "SCREEN TIME",
            color: "#10B981",
            bgColor: "#D1FAE5",
            gradientColors: ["#10B981", "#34D399"],
          },
        ],
        activityData: activityData,
        sleepData: {
          ...sleepData,
          bedtime: sleepWindow.bedtime,
          wakeup: sleepWindow.wakeup,
        },
        digitalData: [
          {
            label: "Screen time today",
            value: totalUsageMinutes > 0
              ? formatDuration(totalUsageMinutes)
              : "Not tracked",
            icon: "phone-portrait-outline",
            bgColor: "#ECFDF5",
            textColor: "#059669",
            iconColor: "#10B981",
          },
          {
            label: "App pickups",
            value: usageStats?.pickupCount ? `${usageStats.pickupCount} times` : "Not tracked",
            icon: "hand-left-outline",
            bgColor: "#F0FDFA",
            textColor: "#0D9488",
            iconColor: "#14B8A6",
          },
        ],
        appUsage: usageStats?.appUsage || [],
      }

      setData(formattedData)
    } catch (error) {
      console.error("Error fetching tracker data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (minutes) => {
    if (!minutes || minutes <= 0) return "0m";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fetchSleepWindow = async () => {
    try {
      const saved = await localStorageService.getSleepWindow()
      if (saved) {
        setSleepWindow(saved)
        setTempBedtime(new Date(saved.bedtime))
        setTempWakeup(new Date(saved.wakeup))
      }
    } catch (e) {
      console.log("No saved sleep window")
    }
  }

  const saveSleepWindow = async () => {
    const newWindow = { bedtime: tempBedtime, wakeup: tempWakeup }
    setSleepWindow(newWindow)
    await localStorageService.saveSleepWindow(newWindow)
    
    const bedtimeStr = `${tempBedtime.getHours()}:${tempBedtime.getMinutes().toString().padStart(2, '0')}`
    const wakeupStr = `${tempWakeup.getHours()}:${tempWakeup.getMinutes().toString().padStart(2, '0')}`
    await behavioralTrackingService.setUserSleepWindow(bedtimeStr, wakeupStr)
    await sleepTrackingService.updateSleepWindow(tempBedtime, tempWakeup)
    
    setModalVisible(false)
    await fetchData()
  }

  const formatTime = (date) => {
    if (!date) return "Not set"
    const d = new Date(date)
    let hours = d.getHours()
    let minutes = d.getMinutes()
    const ampm = hours >= 12 ? "PM" : "AM"
    hours = hours % 12 || 12
    return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`
  }

  const openManualSleepLog = () => {
    // ✅ IMPROVED: Allow users to select any date
    const today = new Date()
    setManualSleepDate(today) // Default to today
    
    const lastNight = new Date(today)
    lastNight.setDate(lastNight.getDate() - 1)
    lastNight.setHours(23, 0, 0, 0)
    setManualSleepStart(lastNight)
    
    const thisMorning = new Date(today)
    thisMorning.setHours(7, 0, 0, 0)
    setManualSleepEnd(thisMorning)
    
    setManualSleepModalVisible(true)
  }

  // ✅ ADDED: Format date for display
  const formatDate = (date) => {
    if (!date) return "Not set"
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' })
  }

  const saveManualSleep = async () => {
    try {
      // ✅ IMPROVED: Adjust start/end times to reflect the selected date
      const sleepStart = new Date(manualSleepStart)
      const sleepEnd = new Date(manualSleepEnd)
      
      // If sleep end is before start, assume it crossed midnight
      if (sleepEnd < sleepStart) {
        sleepEnd.setDate(sleepEnd.getDate() + 1)
      }
      
      // ✅ Service determines wake-up date from sleep_end, not from manualSleepDate
      await sleepTrackingService.logManualSleep(
        sleepStart.toISOString(),
        sleepEnd.toISOString(),
        isNap
      );
      
      setManualSleepModalVisible(false);
      setIsNap(false);
      Alert.alert("Success", isNap ? "Nap logged successfully" : "Sleep data logged successfully");
      await fetchData();
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to log sleep data");
    }
  };

  const handleBootstrapResponse = async (logSleep) => {
    try {
      await sleepTrackingService.markBootstrapComplete()
      setShowBootstrapPrompt(false)
      
      if (logSleep) {
        openManualSleepLog()
      }
    } catch (error) {
      console.error("Error handling bootstrap response:", error)
    }
  }

  const handleMissingDataResponse = async (logSleep) => {
    try {
      if (missingDate) {
        await sleepTrackingService.markMissingPromptShown(missingDate)
      }
      setShowMissingPrompt(false)
      
      if (logSleep) {
        openManualSleepLog()
      }
    } catch (error) {
      console.error("Error handling missing data response:", error)
    }
  }

  const renderActivityRing = (value, maxValue, colors, strokeWidth = 10) => {
    const size = 140
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const progress = Math.min(value / maxValue, 1)
    const strokeDashoffset = circumference - progress * circumference

    return (
      <Svg width={size} height={size} style={styles.ringContainer}>
        <Defs>
          <SvgLinearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors[0]} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors[1]} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <Circle
          stroke="#F1F5F9"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke="url(#ringGradient)"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
    )
  }

  const renderSleepQualityRing = () => {
    const efficiency = data.sleepData.sleepEfficiency * 100
    const size = 160
    const strokeWidth = 16
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const progress = efficiency / 100
    const strokeDashoffset = circumference - progress * circumference

    let colors = ["#EF4444", "#DC2626"]
    let qualityText = "Poor"
    let bgColor = "#FEE2E2"
    
    if (efficiency >= 85) {
      colors = ["#10B981", "#059669"]
      qualityText = "Excellent"
      bgColor = "#D1FAE5"
    } else if (efficiency >= 70) {
      colors = ["#F59E0B", "#D97706"]
      qualityText = "Good"
      bgColor = "#FEF3C7"
    }

    return (
      <View style={styles.sleepRingContainer}>
        <Svg width={size} height={size}>
          <Defs>
            <SvgLinearGradient id="sleepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors[0]} stopOpacity="1" />
              <Stop offset="100%" stopColor={colors[1]} stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          <Circle
            stroke="#F8FAFC"
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <Circle
            stroke="url(#sleepGradient)"
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>
        <View style={styles.sleepRingContent}>
          <Text style={styles.sleepEfficiencyValue}>{Math.round(efficiency)}%</Text>
          <Text style={styles.sleepEfficiencyLabel}>Efficiency</Text>
          <View style={[styles.sleepQualityBadge, { backgroundColor: bgColor }]}>
            <Text style={[styles.sleepQualityText, { color: colors[0] }]}>{qualityText}</Text>
          </View>
        </View>
      </View>
    )
  }

  const renderSleepStagesBar = () => {
    const { deepSleepMinutes, lightSleepMinutes, wakeMinutes } = data.sleepData
    const total = deepSleepMinutes + lightSleepMinutes + wakeMinutes

    if (total === 0) return null

    const deepPercent = (deepSleepMinutes / total) * 100
    const lightPercent = (lightSleepMinutes / total) * 100
    const wakePercent = (wakeMinutes / total) * 100

    return (
      <View style={styles.sleepStagesContainer}>
        <Text style={styles.sleepStagesTitle}>Sleep Stages Distribution</Text>
        <View style={styles.sleepStagesBar}>
          <LinearGradient
            colors={['#4338CA', '#5B21B6']}
            style={[styles.sleepStageSegment, { flex: deepPercent }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <LinearGradient
            colors={['#6366F1', '#8B5CF6']}
            style={[styles.sleepStageSegment, { flex: lightPercent }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <LinearGradient
            colors={['#C7D2FE', '#DDD6FE']}
            style={[styles.sleepStageSegment, { flex: wakePercent }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </View>
        <View style={styles.sleepStagesLegend}>
          <View style={styles.legendItem}>
            <LinearGradient colors={['#4338CA', '#5B21B6']} style={styles.legendDot} />
            <Text style={styles.legendLabel}>Deep</Text>
            <Text style={styles.legendValue}>{formatDuration(deepSleepMinutes)}</Text>
          </View>
          <View style={styles.legendItem}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.legendDot} />
            <Text style={styles.legendLabel}>Light</Text>
            <Text style={styles.legendValue}>{formatDuration(lightSleepMinutes)}</Text>
          </View>
          <View style={styles.legendItem}>
            <LinearGradient colors={['#C7D2FE', '#DDD6FE']} style={styles.legendDot} />
            <Text style={styles.legendLabel}>Awake</Text>
            <Text style={styles.legendValue}>{formatDuration(wakeMinutes)}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <LinearGradient colors={["#F3E8FF", "#E9D5FF"]} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading your wellness data...</Text>
      </LinearGradient>
    )
  }

  return (
    <SafeAreaWrapper backgroundColor="#F3E8FF" statusBarStyle="dark-content">
      <LinearGradient 
        colors={["#F3E8FF", "#E9D5FF"]} 
        style={styles.gradient}
      >
        {/* Enhanced Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color="#1F2937" />
            </TouchableOpacity>
            
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Wellness Dashboard</Text>
              <Text style={styles.headerSubtitle}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.refreshButton} 
              onPress={onRefresh}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={22} color="#1F2937" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false} 
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor="#8B5CF6"
              colors={["#8B5CF6"]}
            />
          }
        >
          {/* Updated Summary Cards - Matching PDF Design */}
          <View style={styles.summarySection}>
            {data.todayStats.map((stat, index) => (
              <LinearGradient
                key={index}
                colors={stat.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statCardGradient}
              >
                <View style={styles.statCardContent}>
                  <View style={styles.statIconContainer}>
                    <Ionicons name={stat.icon} size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {stat.value}
                  </Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              </LinearGradient>
            ))}
          </View>

          {/* Enhanced Sleep Analytics Card */}
          <View style={styles.modernCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <View style={styles.cardIconBadge}>
                  <Ionicons name="moon" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Sleep Analytics</Text>
                  <Text style={styles.cardSubtitle}>Last night's sleep quality</Text>
                </View>
              </View>
              
              {data.sleepData.source !== "Not tracked" && (
                <View style={[
                  styles.modernSourceTag,
                  { backgroundColor: data.sleepData.isManual ? '#FEF3C7' : 
                                   data.sleepData.source === 'Auto-Tracked' ? '#E0E7FF' : '#D1FAE5' }
                ]}>
                  <View style={[styles.sourceTagDot, { 
                    backgroundColor: data.sleepData.isManual ? '#F59E0B' : 
                                   data.sleepData.source === 'Auto-Tracked' ? '#6366F1' : '#10B981' 
                  }]} />
                  <Text style={[styles.modernSourceText, { 
                    color: data.sleepData.isManual ? '#D97706' : 
                           data.sleepData.source === 'Auto-Tracked' ? '#4F46E5' : '#059669' 
                  }]}>
                    {data.sleepData.isManual ? 'Manual' : 
                     data.sleepData.source === 'Auto-Tracked' ? 'Auto' : data.sleepData.source}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardContent}>
              {/* Sleep Quality Ring - Enhanced */}
              {data.sleepData.totalMinutes > 0 && !data.sleepData.isManual && data.sleepData.sleepEfficiency > 0 && (
                <View style={styles.sleepQualitySection}>
                  {renderSleepQualityRing()}
                  {renderSleepStagesBar()}
                  
                  {/* Sleep Metrics Grid */}
                  <View style={styles.sleepMetricsGrid}>
                    <View style={styles.metricBox}>
                      <Ionicons name="time-outline" size={18} color="#6366F1" />
                      <Text style={styles.metricBoxValue}>
                        {Math.floor(data.sleepData.hours)}h {Math.round((data.sleepData.hours % 1) * 60)}m
                      </Text>
                      <Text style={styles.metricBoxLabel}>Duration</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Ionicons name="bed-outline" size={18} color="#8B5CF6" />
                      <Text style={styles.metricBoxValue}>
                        {data.sleepData.fragmentationCount}
                      </Text>
                      <Text style={styles.metricBoxLabel}>Interruptions</Text>
                    </View>
                    <View style={styles.metricBox}>
                      <Ionicons name="stats-chart-outline" size={18} color="#10B981" />
                      <Text style={styles.metricBoxValue}>
                        {Math.round((data.sleepData.confidence || 0) * 100)}%
                      </Text>
                      <Text style={styles.metricBoxLabel}>Confidence</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Manual Sleep Display - Enhanced */}
              {data.sleepData.totalMinutes > 0 && data.sleepData.isManual && (
                <View style={styles.manualSleepDisplay}>
                  <LinearGradient
                    colors={['#EDE9FE', '#DDD6FE']}
                    style={styles.manualSleepIconBg}
                  >
                    <Ionicons name="moon" size={36} color="#8B5CF6" />
                  </LinearGradient>
                  <Text style={styles.manualSleepDuration}>
                    {Math.floor(data.sleepData.hours)}h {Math.round((data.sleepData.hours % 1) * 60)}m
                  </Text>
                  <Text style={styles.manualSleepLabel}>Logged Sleep Duration</Text>
                  
                  {data.sleepData.actualSleepStart && data.sleepData.actualSleepEnd && (
                    <View style={styles.manualSleepTimes}>
                      <View style={styles.timeChip}>
                        <Ionicons name="bed" size={14} color="#8B5CF6" />
                        <Text style={styles.timeChipText}>
                          {formatTime(new Date(data.sleepData.actualSleepStart))}
                        </Text>
                      </View>
                      <Ionicons name="arrow-forward" size={14} color="#CBD5E1" />
                      <View style={styles.timeChip}>
                        <Ionicons name="sunny" size={14} color="#F59E0B" />
                        <Text style={styles.timeChipText}>
                          {formatTime(new Date(data.sleepData.actualSleepEnd))}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {/* ✅ NAP SESSIONS DISPLAY */}
                  {data.sleepData.napCount > 0 && (
                    <View style={styles.napSessionsContainer}>
                      <View style={styles.napHeaderRow}>
                        <Ionicons name="sunny" size={16} color="#F59E0B" />
                        <Text style={styles.napHeaderText}>
                          {data.sleepData.napCount} {data.sleepData.napCount === 1 ? 'Nap' : 'Naps'} Logged
                        </Text>
                      </View>
                      {data.sleepData.napSessions && data.sleepData.napSessions.map((nap, idx) => {
                        const napStart = new Date(nap.start_time)
                        const napEnd = new Date(nap.end_time)
                        const napDuration = nap.duration_minutes || ((napEnd - napStart) / 60000)
                        return (
                          <View key={idx} style={styles.napItem}>
                            <View style={styles.napItemIcon}>
                              <Ionicons name="moon" size={16} color="#F59E0B" />
                            </View>
                            <View style={styles.napItemContent}>
                              <Text style={styles.napItemTime}>
                                {formatTime(napStart)} - {formatTime(napEnd)}
                              </Text>
                              <Text style={styles.napItemDuration}>
                                Duration: {Math.round(napDuration)} minutes
                              </Text>
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* No Sleep Data - Enhanced */}
              {data.sleepData.totalMinutes === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="moon-outline" size={48} color="#CBD5E1" />
                  </View>
                  <Text style={styles.emptyTitle}>No Sleep Data Yet</Text>
                  <Text style={styles.emptyText}>
                    {autoTrackingEnabled ? 
                      "Sleep will be automatically tracked tonight during your sleep window" : 
                      "Enable auto-tracking below or log your sleep manually"}
                  </Text>
                </View>
              )}

              {/* Sleep Insights - Enhanced */}
              {data.sleepData.totalMinutes > 0 && (
                <View style={styles.insightsSection}>
                  <Text style={styles.insightsSectionTitle}>Insights & Recommendations</Text>
                  
                  {data.sleepData.totalMinutes < 420 && (
                    <View style={[styles.insightCard, { borderLeftColor: '#F59E0B' }]}>
                      <View style={[styles.insightIconBg, { backgroundColor: '#FEF3C7' }]}>
                        <Ionicons name="alert-circle" size={18} color="#F59E0B" />
                      </View>
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Below Recommended</Text>
                        <Text style={styles.insightText}>
                          You got less than 7 hours of sleep. Aim for 7-9 hours for optimal health and recovery.
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {data.sleepData.totalMinutes >= 420 && data.sleepData.totalMinutes <= 540 && (
                    <View style={[styles.insightCard, { borderLeftColor: '#10B981' }]}>
                      <View style={[styles.insightIconBg, { backgroundColor: '#D1FAE5' }]}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      </View>
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Perfect Duration</Text>
                        <Text style={styles.insightText}>
                          You're getting the recommended 7-9 hours. Great job maintaining healthy sleep habits!
                        </Text>
                      </View>
                    </View>
                  )}

                  {!data.sleepData.isManual && data.sleepData.restlessnessIndex > 0.3 && (
                    <View style={[styles.insightCard, { borderLeftColor: '#8B5CF6' }]}>
                      <View style={[styles.insightIconBg, { backgroundColor: '#F3E8FF' }]}>
                        <Ionicons name="trending-up" size={18} color="#8B5CF6" />
                      </View>
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Restless Sleep Detected</Text>
                        <Text style={styles.insightText}>
                          Higher movement detected. Try reducing screen time and caffeine before bed.
                        </Text>
                      </View>
                    </View>
                  )}

                  {data.sleepData.fragmentationCount > 2 && !data.sleepData.isManual && (
                    <View style={[styles.insightCard, { borderLeftColor: '#EF4444' }]}>
                      <View style={[styles.insightIconBg, { backgroundColor: '#FEE2E2' }]}>
                        <Ionicons name="flash" size={18} color="#EF4444" />
                      </View>
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Fragmented Sleep</Text>
                        <Text style={styles.insightText}>
                          {data.sleepData.fragmentationCount} wake interruptions detected. Maintain consistent sleep hygiene.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Auto-tracking Toggle - Enhanced */}
              <View style={styles.settingCard}>
                <View style={styles.settingRow}>
                  <View style={styles.settingIconBg}>
                    <Ionicons name="moon" size={20} color="#8B5CF6" />
                  </View>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Automatic Sleep Tracking</Text>
                    <Text style={styles.settingDescription}>
                      Uses motion sensors to track sleep
                    </Text>
                  </View>
                  <Switch
                    value={autoTrackingEnabled}
                    onValueChange={toggleAutoTracking}
                    trackColor={{ false: "#E5E7EB", true: "#C7D2FE" }}
                    thumbColor={autoTrackingEnabled ? "#8B5CF6" : "#F9FAFB"}
                    ios_backgroundColor="#E5E7EB"
                  />
                </View>
              </View>

              {/* Action Buttons - Enhanced */}
              <View style={styles.actionButtons}>
                <TouchableOpacity 
                  style={styles.secondaryActionButton} 
                  onPress={() => setModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.secondaryActionContent}>
                    <View style={styles.secondaryActionIcon}>
                      <Ionicons name="time" size={20} color="#8B5CF6" />
                    </View>
                    <View style={styles.actionButtonText}>
                      <Text style={styles.actionButtonLabel}>Sleep Window</Text>
                      <Text style={styles.actionButtonValue}>
                        {formatTime(sleepWindow.bedtime || new Date().setHours(23, 0, 0))} - {formatTime(sleepWindow.wakeup || new Date().setHours(7, 0, 0))}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#8B5CF6" />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.primaryActionButton} 
                  onPress={openManualSleepLog}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#7C3AED']}
                    style={styles.primaryActionGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryActionText}>Log Sleep Manually</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Enhanced Physical Activity Card */}
          <View style={styles.modernCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="fitness" size={20} color="#10B981" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Physical Activity</Text>
                  <Text style={styles.cardSubtitle}>Today's movement & exercise</Text>
                </View>
              </View>
              
              {data.activityData?.dataSource === "health_connect" && (
                <View style={[styles.modernSourceTag, { backgroundColor: '#D1FAE5' }]}>
                  <View style={[styles.sourceTagDot, { backgroundColor: '#10B981' }]} />
                  <Text style={[styles.modernSourceText, { color: '#059669' }]}>Google Fit</Text>
                </View>
              )}
            </View>

            <View style={styles.cardContent}>
              {data.activityData?.dataSource === "health_connect" ? (
                <>
                  {/* Activity Ring - Enhanced */}
                  <View style={styles.activityRingSection}>
                    <View style={styles.ringWrapper}>
                      {renderActivityRing(
                        data.activityData?.steps || 0,
                        data.activityData?.goals?.steps || 10000,
                        ["#10B981", "#34D399"]
                      )}
                      <View style={styles.ringCenter}>
                        <Text style={styles.ringMainValue}>
                          {(data.activityData?.steps || 0).toLocaleString()}
                        </Text>
                        <Text style={styles.ringLabel}>steps</Text>
                        <View style={styles.ringProgress}>
                          <View style={[
                            styles.ringProgressBar,
                            { width: `${Math.min((data.activityData?.steps || 0) / (data.activityData?.goals?.steps || 10000) * 100, 100)}%` }
                          ]} />
                        </View>
                        <Text style={styles.ringGoal}>
                          Goal: {(data.activityData?.goals?.steps || 10000).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Activity Metrics Grid - Enhanced */}
                  <View style={styles.activityMetricsGrid}>
                    <View style={styles.activityMetricCard}>
                      <LinearGradient
                        colors={['#FEF3C7', '#FDE68A']}
                        style={styles.activityMetricIconBg}
                      >
                        <Ionicons name="navigate" size={24} color="#F59E0B" />
                      </LinearGradient>
                      <Text style={styles.activityMetricValue}>
                        {data.activityData?.distance?.toFixed(2) || "0.00"}
                      </Text>
                      <Text style={styles.activityMetricLabel}>Km</Text>
                    </View>

                    <View style={styles.activityMetricCard}>
                      <LinearGradient
                        colors={['#FEE2E2', '#FECACA']}
                        style={styles.activityMetricIconBg}
                      >
                        <Ionicons name="flame" size={24} color="#EF4444" />
                      </LinearGradient>
                      <Text style={styles.activityMetricValue}>
                        {Math.round(data.activityData?.calories || 0)}
                      </Text>
                      <Text style={styles.activityMetricLabel}>Calories</Text>
                    </View>

                    <View style={styles.activityMetricCard}>
                      <LinearGradient
                        colors={['#E0E7FF', '#C7D2FE']}
                        style={styles.activityMetricIconBg}
                      >
                        <Ionicons name="time" size={24} color="#6366F1" />
                      </LinearGradient>
                      <Text style={styles.activityMetricValue}>
                        {data.activityData?.moveMinutes || 0}
                      </Text>
                      <Text style={styles.activityMetricLabel}>Move Min</Text>
                    </View>
                  </View>

                  <View style={styles.infoCard}>
                    <Ionicons name="information-circle" size={18} color="#10B981" />
                    <Text style={styles.infoCardText}>
                      Activity data synced from Google Fit via Health Connect
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.connectSection}>
                  <LinearGradient
                    colors={['#F3F4F6', '#E5E7EB']}
                    style={styles.connectIconBg}
                  >
                    <Ionicons name="fitness-outline" size={48} color="#9CA3AF" />
                  </LinearGradient>
                  <Text style={styles.connectTitle}>Connect to Google Fit</Text>
                  <Text style={styles.connectDescription}>
                    Sync your activity data from Google Fit and other fitness apps through Health Connect to get comprehensive insights
                  </Text>
                  <TouchableOpacity 
                    style={styles.connectButton} 
                    onPress={connectHealthConnect}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#10B981', '#059669']}
                      style={styles.connectButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons name="link" size={20} color="#FFFFFF" />
                      <Text style={styles.connectButtonText}>Connect Health Connect</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Enhanced Digital Wellness Card - Matching PDF */}
          <View style={styles.modernCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="phone-portrait" size={20} color="#3B82F6" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Digital Wellness</Text>
                  <Text style={styles.cardSubtitle}>Screen time & app usage</Text>
                </View>
              </View>
            </View>

            <View style={styles.cardContent}>
              {/* Digital Metrics in Parallel - Matching PDF */}
              <View style={styles.digitalMetricsRow}>
                {data.digitalData.map((item, index) => (
                  <View key={index} style={styles.digitalMetricCard}>
                    <View style={[styles.digitalMetricIconBg, { backgroundColor: item.bgColor }]}>
                      <Ionicons name={item.icon} size={28} color={item.iconColor} />
                    </View>
                    <Text style={[styles.digitalMetricValue, { color: item.textColor }]}>
                      {item.value}
                    </Text>
                    <Text style={styles.digitalMetricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {/* Top Apps with Show All */}
              {data.appUsage.length > 0 && (
                <View style={styles.topAppsSection}>
                  <View style={styles.topAppsHeader}>
                    <Text style={styles.topAppsTitle}>Top Apps Today</Text>
                    <Text style={styles.topAppsCount}>{data.appUsage.length} apps</Text>
                  </View>
                  
                  {data.appUsage.slice(0, showAllApps ? data.appUsage.length : 5).map((app, index) => {
                    const totalUsage = data.appUsage.reduce((sum, a) => sum + (a.durationMinutes || 0), 0)
                    const percentage = totalUsage > 0 ? (app.durationMinutes / totalUsage) * 100 : 0
                    
                    return (
                      <View key={index} style={styles.appUsageRow}>
                        <View style={styles.appRank}>
                          <Text style={styles.appRankText}>{index + 1}</Text>
                        </View>
                        <View style={styles.appInfo}>
                          <Text style={styles.appName} numberOfLines={1}>
                            {app.appName || app.package}
                          </Text>
                          <View style={styles.appProgressBar}>
                            <View 
                              style={[
                                styles.appProgressFill,
                                { 
                                  width: `${percentage}%`,
                                  backgroundColor: index === 0 ? '#8B5CF6' : 
                                                 index === 1 ? '#10B981' : 
                                                 index === 2 ? '#F59E0B' : '#6B7280'
                                }
                              ]} 
                            />
                          </View>
                        </View>
                        <Text style={styles.appDuration}>
                          {formatDuration(app.durationMinutes)}
                        </Text>
                      </View>
                    )
                  })}

                  {/* Show More/Less Button */}
                  {data.appUsage.length > 5 && (
                    <TouchableOpacity 
                      style={styles.showMoreButton}
                      onPress={() => setShowAllApps(!showAllApps)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.showMoreText}>
                        {showAllApps ? 'Show Less' : `Show ${data.appUsage.length - 5} More`}
                      </Text>
                      <Ionicons 
                        name={showAllApps ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color="#8B5CF6" 
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </LinearGradient>

      {/* Sleep Window Modal with Clock Picker */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCentered}>
            <View style={styles.compactModalCard}>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>

              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                style={styles.compactIconBadge}
              >
                <Ionicons name="time" size={32} color="#FFFFFF" />
              </LinearGradient>
              
              <Text style={styles.compactTitle}>Sleep Window</Text>

              <View style={styles.compactTimeSection}>
                <TouchableOpacity 
                  onPress={() => setPickerMode("bedtime")} 
                  style={styles.compactTimeButton}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactTimeLeft}>
                    <Ionicons name="moon" size={24} color="#8B5CF6" />
                    <Text style={styles.compactTimeLabel}>Bedtime</Text>
                  </View>
                  <View style={styles.compactTimeRight}>
                    <Text style={styles.compactTimeValue}>{formatTime(tempBedtime)}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>

                <View style={styles.compactDivider} />

                <TouchableOpacity 
                  onPress={() => setPickerMode("wakeup")} 
                  style={styles.compactTimeButton}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactTimeLeft}>
                    <Ionicons name="sunny" size={24} color="#F59E0B" />
                    <Text style={styles.compactTimeLabel}>Wake Up</Text>
                  </View>
                  <View style={styles.compactTimeRight}>
                    <Text style={styles.compactTimeValue}>{formatTime(tempWakeup)}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              </View>

              {pickerMode && (
                <DateTimePicker
                  value={pickerMode === "bedtime" ? tempBedtime : tempWakeup}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      if (pickerMode === "bedtime") setTempBedtime(selectedDate)
                      if (pickerMode === "wakeup") setTempWakeup(selectedDate)
                    }
                    setPickerMode(null)
                  }}
                />
              )}

              <TouchableOpacity 
                style={styles.compactSaveButton} 
                onPress={saveSleepWindow}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#7C3AED']}
                  style={styles.compactSaveGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                  <Text style={styles.compactSaveText}>Save</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Sleep Log Modal with Clock Picker */}
      <Modal visible={manualSleepModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCentered}>
            <View style={styles.compactModalCard}>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  setManualSleepModalVisible(false)
                  setIsNap(false)
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>

              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                style={styles.compactIconBadge}
              >
                <Ionicons name="moon" size={32} color="#FFFFFF" />
              </LinearGradient>
              
              <Text style={styles.compactTitle}>Log Sleep</Text>

              {/* ✅ ADDED: Date Picker */}
              <TouchableOpacity 
                onPress={() => setManualSleepDatePicker(true)} 
                style={styles.compactDateButton}
                activeOpacity={0.7}
              >
                <View style={styles.compactDateLeft}>
                  <Ionicons name="calendar" size={20} color="#8B5CF6" />
                  <Text style={styles.compactDateLabel}>Sleep Date</Text>
                </View>
                <View style={styles.compactDateRight}>
                  <Text style={styles.compactDateValue}>{formatDate(manualSleepDate)}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </TouchableOpacity>

              <View style={styles.compactDivider} />

              <View style={styles.compactNapToggle}>
                <View style={styles.napToggleLeft}>
                  <Ionicons name="sunny" size={20} color="#F59E0B" />
                  <Text style={styles.napToggleText}>Nap</Text>
                </View>
                <Switch
                  value={isNap}
                  onValueChange={setIsNap}
                  trackColor={{ false: "#E5E7EB", true: "#FEF3C7" }}
                  thumbColor={isNap ? "#F59E0B" : "#F9FAFB"}
                  ios_backgroundColor="#E5E7EB"
                />
              </View>

              <View style={styles.compactTimeSection}>
                <TouchableOpacity 
                  onPress={() => setManualSleepStartPicker(true)} 
                  style={styles.compactTimeButton}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactTimeLeft}>
                    <Ionicons name="bed" size={24} color="#8B5CF6" />
                    <Text style={styles.compactTimeLabel}>Sleep Start</Text>
                  </View>
                  <View style={styles.compactTimeRight}>
                    <Text style={styles.compactTimeValue}>{formatTime(manualSleepStart)}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>

                <View style={styles.compactDivider} />

                <TouchableOpacity 
                  onPress={() => setManualSleepEndPicker(true)} 
                  style={styles.compactTimeButton}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactTimeLeft}>
                    <Ionicons name="alarm" size={24} color="#F59E0B" />
                    <Text style={styles.compactTimeLabel}>Wake Up</Text>
                  </View>
                  <View style={styles.compactTimeRight}>
                    <Text style={styles.compactTimeValue}>{formatTime(manualSleepEnd)}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                  </View>
                </TouchableOpacity>
              </View>

              {manualSleepStartPicker && (
                <DateTimePicker
                  value={manualSleepStart}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={(event, selectedDate) => {
                    setManualSleepStartPicker(false)
                    if (selectedDate) setManualSleepStart(selectedDate)
                  }}
                />
              )}

              {/* ✅ ADDED: Date picker for sleep date */}
              {manualSleepDatePicker && (
                <DateTimePicker
                  value={manualSleepDate}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setManualSleepDatePicker(false)
                    if (selectedDate) setManualSleepDate(selectedDate)
                  }}
                />
              )}

              {manualSleepEndPicker && (
                <DateTimePicker
                  value={manualSleepEnd}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={(event, selectedDate) => {
                    setManualSleepEndPicker(false)
                    if (selectedDate) setManualSleepEnd(selectedDate)
                  }}
                />
              )}

              <TouchableOpacity 
                style={styles.compactSaveButton} 
                onPress={saveManualSleep}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#7C3AED']}
                  style={styles.compactSaveGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                  <Text style={styles.compactSaveText}>Log Sleep</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bootstrap Prompt */}
      {showBootstrapPrompt && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.promptOverlay}>
            <View style={styles.promptCard}>
              <LinearGradient
                colors={['#EDE9FE', '#DDD6FE']}
                style={styles.promptIconBg}
              >
                <Ionicons name="moon" size={48} color="#8B5CF6" />
              </LinearGradient>
              <Text style={styles.promptTitle}>Did you sleep last night?</Text>
              <Text style={styles.promptDescription}>
                Track your sleep patterns by logging last night's sleep. This helps us provide better insights.
              </Text>
              <View style={styles.promptActions}>
                <TouchableOpacity 
                  style={styles.promptSecondaryButton} 
                  onPress={() => handleBootstrapResponse(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.promptSecondaryText}>Skip for Now</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.promptPrimaryButton} 
                  onPress={() => handleBootstrapResponse(true)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#7C3AED']}
                    style={styles.promptPrimaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.promptPrimaryText}>Log Sleep</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Missing Data Prompt */}
      {showMissingPrompt && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.promptOverlay}>
            <View style={styles.promptCard}>
              <LinearGradient
                colors={['#FEF3C7', '#FDE68A']}
                style={styles.promptIconBg}
              >
                <Ionicons name="help-circle" size={48} color="#F59E0B" />
              </LinearGradient>
              <Text style={styles.promptTitle}>Missing Sleep Data</Text>
              <Text style={styles.promptDescription}>
                We couldn't detect your sleep last night. Would you like to log it manually?
              </Text>
              <View style={styles.promptActions}>
                <TouchableOpacity 
                  style={styles.promptSecondaryButton} 
                  onPress={() => handleMissingDataResponse(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.promptSecondaryText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.promptPrimaryButton} 
                  onPress={() => handleMissingDataResponse(true)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#F59E0B', '#D97706']}
                    style={styles.promptPrimaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="create" size={18} color="#FFFFFF" />
                    <Text style={styles.promptPrimaryText}>Log Now</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaWrapper>
  )
}

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
    fontSize: 15, 
    color: "#4C1D95", 
    marginTop: 16,
    fontWeight: '600',
  },
  
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerContent: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  headerText: { 
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: { 
    fontSize: 22, 
    fontWeight: "700", 
    color: "#4C1D95",
    letterSpacing: -0.3,
  },
  headerSubtitle: { 
    fontSize: 13, 
    color: "#7C3AED",
    marginTop: 2,
    fontWeight: '500',
  },
  refreshButton: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  
  content: { 
    flex: 1, 
    paddingHorizontal: 16,
  },
  
  // PDF-Matched Summary Cards
  summarySection: { 
    flexDirection: "row", 
    gap: 12,
    marginBottom: 16,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  statCardGradient: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  statCardContent: {
    padding: 20,
    paddingVertical: 22,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  statValue: { 
    fontSize: 22, 
    fontWeight: "800", 
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  statLabel: { 
    fontSize: 13, 
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  modernCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
  },
  cardHeader: {
    padding: 18,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: { 
    fontSize: 18, 
    fontWeight: "800", 
    color: "#1F2937",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  modernSourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  sourceTagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  modernSourceText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: { 
    paddingHorizontal: 18, 
    paddingBottom: 18,
  },

  sleepQualitySection: {
    alignItems: "center",
    paddingVertical: 20,
  },
  sleepRingContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  sleepRingContent: {
    position: "absolute",
    alignItems: "center",
  },
  sleepEfficiencyValue: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -1,
  },
  sleepEfficiencyLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sleepQualityBadge: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
  },
  sleepQualityText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sleepStagesContainer: {
    width: "100%",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  sleepStagesTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sleepStagesBar: {
    flexDirection: "row",
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  sleepStageSegment: {
    height: "100%",
  },
  sleepStagesLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  legendItem: {
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  legendValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '800',
  },

  sleepMetricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  metricBoxValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  metricBoxLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  manualSleepDisplay: {
    alignItems: "center",
    paddingVertical: 28,
  },
  manualSleepIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  manualSleepDuration: {
    fontSize: 32,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  manualSleepLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 20,
    fontWeight: '700',
  },
  manualSleepTimes: {
    flexDirection: "row",
    alignItems: 'center',
    gap: 14,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  timeChipText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: '700',
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 28,
    lineHeight: 19,
    fontWeight: '500',
  },

  insightsSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  insightsSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  insightIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  insightText: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
    fontWeight: '500',
  },

  settingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  settingDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    fontWeight: '500',
  },

  actionButtons: {
    gap: 10,
    marginTop: 18,
  },
  secondaryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  secondaryActionContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#F9FAFB',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  secondaryActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    flex: 1,
  },
  actionButtonLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionButtonValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: '700',
    marginTop: 2,
  },
  primaryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryActionGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  primaryActionText: { 
    fontSize: 14, 
    color: "#FFFFFF", 
    fontWeight: "800",
  },

  activityRingSection: {
    alignItems: "center",
    marginVertical: 20,
  },
  ringWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringContainer: {
    position: "absolute",
  },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
    width: 140,
    height: 140,
  },
  ringMainValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.5,
  },
  ringLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ringProgress: {
    width: 55,
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    marginTop: 7,
    overflow: 'hidden',
  },
  ringProgressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  ringGoal: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 4,
    fontWeight: '600',
  },

  activityMetricsGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  activityMetricCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 7,
  },
  activityMetricIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityMetricValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginTop: 4,
  },
  activityMetricLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  connectSection: {
    alignItems: "center",
    paddingVertical: 36,
  },
  connectIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  connectTitle: { 
    fontSize: 18, 
    fontWeight: "800", 
    color: "#111827",
    marginBottom: 8,
  },
  connectDescription: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 18,
    lineHeight: 20,
    marginBottom: 22,
    fontWeight: '500',
  },
  connectButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  connectButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  connectButtonText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  infoCardText: { 
    flex: 1, 
    fontSize: 11, 
    color: "#059669", 
    lineHeight: 16,
    fontWeight: '600',
  },

  // PDF-Matched Digital Wellness
  digitalMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  digitalMetricCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  digitalMetricIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitalMetricValue: { 
    fontSize: 24, 
    fontWeight: "900",
  },
  digitalMetricLabel: { 
    fontSize: 12, 
    color: "#6B7280",
    fontWeight: '600',
    textAlign: 'center',
  },

  topAppsSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  topAppsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topAppsTitle: { 
    fontSize: 14, 
    fontWeight: "800", 
    color: "#111827",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topAppsCount: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
  },
  appUsageRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  appRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },
  appInfo: {
    flex: 1,
  },
  appName: { 
    fontSize: 13, 
    color: "#111827", 
    fontWeight: '700',
    marginBottom: 5,
  },
  appProgressBar: {
    height: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  appProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  appDuration: { 
    fontSize: 13, 
    fontWeight: "800", 
    color: "#111827",
    minWidth: 55,
    textAlign: 'right',
  },

  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 11,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8B5CF6',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCentered: {
    width: '100%',
    maxWidth: 360,
  },
  compactModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  compactIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  compactTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.4,
  },
  compactTimeSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 18,
  },
  compactTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  compactTimeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactTimeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  compactTimeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  compactTimeValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#8B5CF6',
  },
  compactDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 18,
  },
  compactNapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginBottom: 14,
  },
  napToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  napToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  compactSaveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  compactSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
  },
  compactSaveText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  promptOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 18,
  },
  promptCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  promptIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  promptTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 11,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  promptDescription: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
    fontWeight: '500',
  },
  promptActions: {
    flexDirection: "row",
    gap: 11,
    width: "100%",
  },
  promptSecondaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: "center",
  },
  promptSecondaryText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "800",
  },
  promptPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  promptPrimaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
  },
  promptPrimaryText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "800",
  },

  // ✅ NAP SESSIONS STYLES
  napSessionsContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  napHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  napHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  napItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 12,
  },
  napItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  napItemContent: {
    flex: 1,
  },
  napItemTime: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  napItemDuration: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },

  // ✅ ADDED: Manual sleep date picker styles
  compactDateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  compactDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactDateLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  compactDateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactDateValue: {
    fontSize: 13,
    color: '#8B5CF6',
    fontWeight: '600',
  },
})