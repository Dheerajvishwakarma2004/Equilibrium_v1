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
} from "react-native"
import DateTimePicker from "@react-native-community/datetimepicker"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import Svg, { Circle } from "react-native-svg"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import localStorageService from "../services/localStorageService"
import behavioralTrackingService from "../services/behavioralTrackingService"
import sleepTrackingService from "../services/sleepTrackingService"

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
  const [isNap, setIsNap] = useState(false)

  // Bootstrap and missing data prompts
  const [showBootstrapPrompt, setShowBootstrapPrompt] = useState(false)
  const [showMissingPrompt, setShowMissingPrompt] = useState(false)
  const [missingDate, setMissingDate] = useState(null)

  // Activity listener
  const [activityListener, setActivityListener] = useState(null)

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
    // Cleanup on unmount
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
      // Check for bootstrap prompt (new user)
      const shouldShowBootstrap = await sleepTrackingService.checkAndShowBootstrapPrompt()
      if (shouldShowBootstrap) {
        setShowBootstrapPrompt(true)
        return
      }

      // Check for missing data (existing user)
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
        // Enable auto tracking
        const success = await sleepTrackingService.enableAutoTracking()
        if (success) {
          setAutoTrackingEnabled(true)
          setSleepTrackingMode("auto_tracking")
          Alert.alert("Auto-Tracking Enabled", "Sleep will be automatically tracked during your sleep window.")
        }
      } else {
        // Disable auto tracking
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
      
      // Get activity data from Health Connect
      const activityData = await behavioralTrackingService.getCurrentActivityData()
      
      const appUsage = usageStats?.appUsage || [];
      const totalUsageMinutes = appUsage.reduce(
        (sum, app) => sum + (app.durationMinutes || 0),
        0
      );

      // Get today's sleep data
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
      }

      // First check if we have auto-tracked data for last night
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
            actualSleepStart: lastNightSleep.sleep_start_estimated,
            actualSleepEnd: lastNightSleep.sleep_end_estimated,
          }
        }
      } 
      
      // If no auto-tracked data, check other sources
      if (sleepData.totalMinutes === 0) {
        // Check for manually logged sleep data for yesterday
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        
        // Check for manual sleep entry
        const manualSummary = await localStorageService.getSleepSummary?.(yesterdayStr)
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
            actualSleepEnd: manualSummary.wake_time,
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
            label: "Sleep",
            color: "#6366f1",
            bgColor: "#e0e7ff",
          },
          {
            icon: "phone-portrait",
            value: totalUsageMinutes > 0 ? formatDuration(totalUsageMinutes): "Not tracked",
            label: "Screen",
            color: "#10b981",
            bgColor: "#d1fae5",
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
            bgColor: "#d1fae5",
            textColor: "#10b981",
          },
          {
            label: "App pickups",
            value: usageStats?.pickupCount ? `${usageStats.pickupCount} times` : "Not tracked",
            bgColor: "#ccfbf1",
            textColor: "#14b8a6",
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
    // Set default times for last night
    const lastNight = new Date()
    lastNight.setDate(lastNight.getDate() - 1)
    lastNight.setHours(23, 0, 0, 0)
    setManualSleepStart(lastNight)
    
    const thisMorning = new Date()
    thisMorning.setHours(7, 0, 0, 0)
    setManualSleepEnd(thisMorning)
    
    setManualSleepModalVisible(true)
  }

  const saveManualSleep = async () => {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateToLog = yesterday.toISOString().split('T')[0]
      
      await sleepTrackingService.logManualSleep(
        dateToLog,
        manualSleepStart.toISOString(),
        manualSleepEnd.toISOString(),
        isNap
      )
      
      setManualSleepModalVisible(false)
      setIsNap(false)
      Alert.alert("Success", "Sleep data logged successfully")
      await fetchData()
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to log sleep data")
    }
  }

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

  const renderActivityRing = (value, maxValue, color, strokeWidth = 12) => {
    const size = 120
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const progress = Math.min(value / maxValue, 1)
    const strokeDashoffset = circumference - progress * circumference

    return (
      <Svg width={size} height={size} style={styles.ringContainer}>
        <Circle
          stroke="#e5e7eb"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke={color}
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
    const size = 140
    const strokeWidth = 14
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const progress = efficiency / 100
    const strokeDashoffset = circumference - progress * circumference

    let color = "#ef4444" // red
    let qualityText = "Poor"
    if (efficiency >= 85) {
      color = "#10b981" // green
      qualityText = "Excellent"
    } else if (efficiency >= 70) {
      color = "#f59e0b" // orange
      qualityText = "Good"
    }

    return (
      <View style={styles.sleepRingContainer}>
        <Svg width={size} height={size}>
          <Circle
            stroke="#f3f4f6"
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          <Circle
            stroke={color}
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
          <Text style={styles.sleepEfficiencyLabel}>Sleep Quality</Text>
          <View style={[styles.sleepQualityBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.sleepQualityText, { color: color }]}>{qualityText}</Text>
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
          <View style={[styles.sleepStageSegment, { flex: deepPercent, backgroundColor: '#4338ca' }]} />
          <View style={[styles.sleepStageSegment, { flex: lightPercent, backgroundColor: '#6366f1' }]} />
          <View style={[styles.sleepStageSegment, { flex: wakePercent, backgroundColor: '#c7d2fe' }]} />
        </View>
        <View style={styles.sleepStagesLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4338ca' }]} />
            <Text style={styles.legendLabel}>Deep {formatDuration(deepSleepMinutes)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
            <Text style={styles.legendLabel}>Light {formatDuration(lightSleepMinutes)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#c7d2fe' }]} />
            <Text style={styles.legendLabel}>Awake {formatDuration(wakeMinutes)}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading data...</Text>
      </View>
    )
  }

  return (
    <SafeAreaWrapper backgroundColor="#dbeafe" statusBarStyle="dark-content">
      <View style={styles.statusBarBg} />
      <LinearGradient colors={["#f3e8ff", "#e9d5ff"]} style={styles.gradient}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color="#64748b" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Wellness Tracking</Text>
              <Text style={styles.headerSubtitle}>Your daily health metrics</Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Today's Summary */}
          <View style={styles.section}>
            <View style={styles.statsGrid}>
              {data.todayStats.map((stat, index) => (
                <View key={index} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: stat.bgColor }]}>
                    <Ionicons name={stat.icon} size={20} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Enhanced Sleep Analytics */}
          <View style={styles.trackingCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleContainer}>
                <Ionicons name="moon" size={20} color="#6366f1" />
                <Text style={styles.cardTitle}>Sleep Analytics</Text>
                {data.sleepData.source !== "Not tracked" && (
                  <View style={[styles.sourceTag, { 
                    backgroundColor: data.sleepData.isManual ? '#fbbf24' : 
                                   data.sleepData.source === 'Auto-Tracked' ? '#6366f1' : '#10b981' 
                  }]}>
                    <Text style={styles.sourceTagText}>
                      {data.sleepData.isManual ? 'Manual' : 
                       data.sleepData.source === 'Auto-Tracked' ? 'Auto' : data.sleepData.source}
                    </Text>
                  </View>
                )}
              </View>
              {autoTrackingEnabled && (
                <View style={styles.liveIndicator}>
                  <View style={[styles.liveDot, { backgroundColor: '#10b981' }]} />
                  <Text style={[styles.liveText, { color: '#10b981' }]}>Auto</Text>
                </View>
              )}
            </View>

            <View style={styles.cardContent}>
              {/* Sleep Quality Ring - Only show if we have auto-tracked sleep data with efficiency */}
              {data.sleepData.totalMinutes > 0 && !data.sleepData.isManual && data.sleepData.sleepEfficiency > 0 && (
                <View style={styles.sleepQualitySection}>
                  {renderSleepQualityRing()}
                  
                  {/* Sleep Stages Bar - Only for auto-tracked sleep */}
                  {renderSleepStagesBar()}
                </View>
              )}

              {/* Simple display for manual entries */}
              {data.sleepData.totalMinutes > 0 && data.sleepData.isManual && (
                <View style={styles.manualSleepDisplay}>
                  <View style={styles.manualSleepIcon}>
                    <Ionicons name="moon" size={48} color="#6366f1" />
                  </View>
                  <Text style={styles.manualSleepDuration}>
                    {Math.floor(data.sleepData.hours)}h {Math.round((data.sleepData.hours % 1) * 60)}m
                  </Text>
                  <Text style={styles.manualSleepLabel}>Sleep Duration Logged</Text>
                  <View style={styles.manualSleepTimes}>
                    {data.sleepData.actualSleepStart && (
                      <View style={styles.manualSleepTimeItem}>
                        <Ionicons name="bed-outline" size={16} color="#6366f1" />
                        <Text style={styles.manualSleepTimeText}>
                          {formatTime(new Date(data.sleepData.actualSleepStart))}
                        </Text>
                      </View>
                    )}
                    {data.sleepData.actualSleepEnd && (
                      <View style={styles.manualSleepTimeItem}>
                        <Ionicons name="sunny-outline" size={16} color="#f59e0b" />
                        <Text style={styles.manualSleepTimeText}>
                          {formatTime(new Date(data.sleepData.actualSleepEnd))}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Display for other tracking sources without detailed metrics */}
              {data.sleepData.totalMinutes > 0 && !data.sleepData.isManual && 
               data.sleepData.source !== 'Auto-Tracked' && (
                <View style={styles.autoSleepDisplay}>
                  <View style={styles.sleepMetric}>
                    <Text style={styles.sleepMetricValue}>
                      {Math.floor(data.sleepData.hours)}h {Math.round((data.sleepData.hours % 1) * 60)}m
                    </Text>
                    <Text style={styles.sleepMetricLabel}>Estimated Sleep</Text>
                    <Text style={styles.sleepConfidence}>
                      Confidence: {Math.round(data.sleepData.confidence * 100)}%
                    </Text>
                  </View>
                </View>
              )}

              {/* No sleep data message */}
              {data.sleepData.totalMinutes === 0 && (
                <View style={styles.noSleepData}>
                  <Ionicons name="moon-outline" size={48} color="#cbd5e1" />
                  <Text style={styles.noSleepTitle}>No Sleep Data</Text>
                  <Text style={styles.noSleepText}>
                    {autoTrackingEnabled ? 
                      "Sleep will be automatically tracked tonight" : 
                      "Enable auto-tracking or log your sleep manually"}
                  </Text>
                </View>
              )}

              {/* Sleep Insights */}
              {data.sleepData.totalMinutes > 0 && (
                <View style={styles.sleepInsights}>
                  {data.sleepData.totalMinutes < 420 && (
                    <View style={styles.insightCard}>
                      <Ionicons name="warning-outline" size={20} color="#f59e0b" />
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Below Recommended</Text>
                        <Text style={styles.insightText}>
                          You got less than 7 hours of sleep. Try to aim for 7-9 hours for optimal health.
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {data.sleepData.totalMinutes >= 420 && data.sleepData.totalMinutes <= 540 && (
                    <View style={styles.insightCard}>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#10b981" />
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Good Duration</Text>
                        <Text style={styles.insightText}>
                          You're getting the recommended amount of sleep (7-9 hours).
                        </Text>
                      </View>
                    </View>
                  )}

                  {!data.sleepData.isManual && data.sleepData.restlessnessIndex > 0.3 && (
                    <View style={styles.insightCard}>
                      <Ionicons name="information-circle-outline" size={20} color="#6366f1" />
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Restless Sleep</Text>
                        <Text style={styles.insightText}>
                          Higher movement detected during sleep. Consider reducing screen time before bed.
                        </Text>
                      </View>
                    </View>
                  )}

                  {data.sleepData.fragmentationCount > 2 && !data.sleepData.isManual && (
                    <View style={styles.insightCard}>
                      <Ionicons name="alert-circle-outline" size={20} color="#ef4444" />
                      <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Fragmented Sleep</Text>
                        <Text style={styles.insightText}>
                          Multiple wake interruptions detected. Try to maintain consistent sleep hygiene.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Auto-tracking toggle */}
              <View style={styles.autoTrackingRow}>
                <View style={styles.autoTrackingInfo}>
                  <Text style={styles.autoTrackingLabel}>Automatic Sleep Tracking</Text>
                  <Text style={styles.autoTrackingDescription}>
                    Uses motion sensors to track sleep automatically
                  </Text>
                </View>
                <Switch
                  value={autoTrackingEnabled}
                  onValueChange={toggleAutoTracking}
                  trackColor={{ false: "#e5e7eb", true: "#c7d2fe" }}
                  thumbColor={autoTrackingEnabled ? "#6366f1" : "#9ca3af"}
                />
              </View>

              {/* Sleep Window Settings */}
              <TouchableOpacity style={styles.settingsButton} onPress={() => setModalVisible(true)}>
                <Ionicons name="time-outline" size={18} color="#6366f1" />
                <Text style={styles.settingsButtonText}>
                  Sleep Window: {formatTime(sleepWindow.bedtime || new Date().setHours(23, 0, 0))} - {formatTime(sleepWindow.wakeup || new Date().setHours(7, 0, 0))}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#6366f1" />
              </TouchableOpacity>

              {/* Manual Log Button */}
              <TouchableOpacity style={styles.logButton} onPress={openManualSleepLog}>
                <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
                <Text style={styles.logButtonText}>Log Sleep Manually</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Physical Activity from Health Connect - With Rings */}
          <View style={styles.trackingCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleContainer}>
                <Ionicons name="fitness" size={20} color="#10b981" />
                <Text style={styles.cardTitle}>Physical Activity</Text>
                {data.activityData?.dataSource === "health_connect" && (
                  <View style={styles.sourceTag}>
                    <Text style={styles.sourceTagText}>Google Fit</Text>
                  </View>
                )}
              </View>
              {data.activityData?.isTracking && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              )}
            </View>

            <View style={styles.cardContent}>
              {data.activityData?.dataSource === "health_connect" ? (
                <>
                  {/* Main Activity Ring */}
                  <View style={styles.mainRingContainer}>
                    <View style={styles.ringWrapper}>
                      {renderActivityRing(
                        data.activityData?.steps || 0,
                        data.activityData?.goals?.steps || 10000,
                        "#10b981"
                      )}
                      <View style={styles.ringCenter}>
                        <Text style={styles.ringMainValue}>
                          {data.activityData?.steps || 0}
                        </Text>
                        <Text style={styles.ringLabel}>steps</Text>
                        <Text style={styles.ringGoal}>
                          of {data.activityData?.goals?.steps || 10000}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Secondary Metrics */}
                  <View style={styles.metricsRow}>
                    <View style={styles.metricItem}>
                      <Ionicons name="navigate" size={20} color="#f59e0b" />
                      <Text style={styles.metricValue}>
                        {data.activityData?.distance?.toFixed(2) || "0.00"}
                      </Text>
                      <Text style={styles.metricLabel}>km</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Ionicons name="flame" size={20} color="#ef4444" />
                      <Text style={styles.metricValue}>
                        {Math.round(data.activityData?.calories || 0)}
                      </Text>
                      <Text style={styles.metricLabel}>cal</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Ionicons name="move" size={20} color="#6366f1" />
                      <Text style={styles.metricValue}>
                        {data.activityData?.moveMinutes || 0}
                      </Text>
                      <Text style={styles.metricLabel}>move min</Text>
                      <Text style={styles.metricGoal}>goal: 30</Text>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle" size={16} color="#10b981" />
                    <Text style={styles.infoText}>
                      Activity data synced from Google Fit via Health Connect
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.connectContainer}>
                  <Ionicons name="fitness-outline" size={48} color="#cbd5e1" />
                  <Text style={styles.connectTitle}>Connect to Google Fit</Text>
                  <Text style={styles.connectDescription}>
                    Sync your activity data from Google Fit and other fitness apps through Health Connect
                  </Text>
                  <TouchableOpacity style={styles.connectHealthButton} onPress={connectHealthConnect}>
                    <Ionicons name="link" size={20} color="#fff" />
                    <Text style={styles.connectHealthText}>Connect Health Connect</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Digital Wellness */}
          <View style={styles.trackingCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleContainer}>
                <Ionicons name="phone-portrait" size={20} color="#10b981" />
                <Text style={styles.cardTitle}>Digital Wellness</Text>
              </View>
            </View>
            <View style={styles.cardContent}>
              {data.digitalData.map((item, index) => (
                <View key={index} style={[styles.dataRow, { backgroundColor: item.bgColor }]}>
                  <Text style={styles.dataLabel}>{item.label}</Text>
                  <Text style={[styles.dataValue, { color: item.textColor }]}>
                    {item.value}
                  </Text>
                </View>
              ))}

              {data.appUsage.length > 0 && (
                <View style={styles.appUsageContainer}>
                  <Text style={styles.appUsageTitle}>Top Apps Today</Text>
                  {data.appUsage.slice(0, 5).map((app, index) => (
                    <View key={index} style={styles.appRow}>
                      <Text style={styles.appName}>{app.appName || app.package}</Text>
                      <Text style={styles.appDuration}>
                        {formatDuration(app.durationMinutes)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </LinearGradient>

      {/* Sleep Window Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Sleep Window</Text>
            <Text style={styles.modalSubtitle}>
              Define your typical sleep schedule for better tracking
            </Text>

            <Text style={styles.modalLabel}>Bedtime</Text>
            <TouchableOpacity onPress={() => setPickerMode("bedtime")} style={styles.timeButton}>
              <Ionicons name="moon-outline" size={20} color="#6366f1" />
              <Text style={styles.timeButtonText}>{formatTime(tempBedtime)}</Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>Wake-up</Text>
            <TouchableOpacity onPress={() => setPickerMode("wakeup")} style={styles.timeButton}>
              <Ionicons name="sunny-outline" size={20} color="#f59e0b" />
              <Text style={styles.timeButtonText}>{formatTime(tempWakeup)}</Text>
            </TouchableOpacity>

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

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveSleepWindow}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Sleep Log Modal */}
      <Modal visible={manualSleepModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Sleep</Text>
            <Text style={styles.modalSubtitle}>
              Record your sleep duration
            </Text>

            <View style={[styles.dataRow, { backgroundColor: "#f0f9ff", marginBottom: 16 }]}>
              <Text style={styles.dataLabel}>This is a nap</Text>
              <Switch
                value={isNap}
                onValueChange={setIsNap}
                trackColor={{ false: "#cbd5e1", true: "#6366f1" }}
                thumbColor={isNap ? "#ffffff" : "#f4f3f4"}
              />
            </View>

            <Text style={styles.modalLabel}>Sleep Start</Text>
            <TouchableOpacity 
              onPress={() => setManualSleepStartPicker(true)} 
              style={styles.timeButton}
            >
              <Ionicons name="moon-outline" size={20} color="#6366f1" />
              <Text style={styles.timeButtonText}>{formatTime(manualSleepStart)}</Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>Wake Time</Text>
            <TouchableOpacity 
              onPress={() => setManualSleepEndPicker(true)} 
              style={styles.timeButton}
            >
              <Ionicons name="sunny-outline" size={20} color="#f59e0b" />
              <Text style={styles.timeButtonText}>{formatTime(manualSleepEnd)}</Text>
            </TouchableOpacity>

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

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => {
                  setManualSleepModalVisible(false)
                  setIsNap(false)
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveManualSleep}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bootstrap Prompt */}
      {showBootstrapPrompt && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.promptOverlay}>
            <View style={styles.promptContent}>
              <View style={styles.promptIcon}>
                <Ionicons name="moon" size={48} color="#6366f1" />
              </View>
              <Text style={styles.promptTitle}>Did you sleep last night?</Text>
              <Text style={styles.promptDescription}>
                You can log your sleep to start tracking your sleep trends.
              </Text>
              <View style={styles.promptButtons}>
                <TouchableOpacity 
                  style={styles.promptButtonSecondary} 
                  onPress={() => handleBootstrapResponse(false)}
                >
                  <Text style={styles.promptButtonSecondaryText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.promptButtonPrimary} 
                  onPress={() => handleBootstrapResponse(true)}
                >
                  <Text style={styles.promptButtonPrimaryText}>Log Sleep</Text>
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
            <View style={styles.promptContent}>
              <View style={styles.promptIcon}>
                <Ionicons name="help-circle-outline" size={48} color="#f59e0b" />
              </View>
              <Text style={styles.promptTitle}>Missing sleep data</Text>
              <Text style={styles.promptDescription}>
                We couldn't detect your sleep last night. Would you like to log it manually?
              </Text>
              <View style={styles.promptButtons}>
                <TouchableOpacity 
                  style={styles.promptButtonSecondary} 
                  onPress={() => handleMissingDataResponse(false)}
                >
                  <Text style={styles.promptButtonSecondaryText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.promptButtonPrimary} 
                  onPress={() => handleMissingDataResponse(true)}
                >
                  <Text style={styles.promptButtonPrimaryText}>Log Sleep</Text>
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
  container: { flex: 1 },
  statusBarBg: { height: 0, backgroundColor: "#f3e8ff" },
  gradient: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 16 },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: "300", color: "#374151" },
  headerSubtitle: { fontSize: 14, color: "#6b7280" },
  iconButton: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  content: { flex: 1, paddingHorizontal: 16 },
  section: { marginBottom: 16 },
  statsGrid: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: "300", color: "#374151", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#6b7280" },
  trackingCard: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    padding: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: "500", color: "#374151" },
  sourceTag: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  sourceTagText: { fontSize: 10, color: "#fff", fontWeight: "600" },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },
  liveText: { fontSize: 11, color: "#ef4444", fontWeight: "600" },
  cardContent: { paddingHorizontal: 16, paddingBottom: 16 },

  // Sleep Analytics Styles
  sleepQualitySection: {
    alignItems: "center",
    paddingVertical: 20,
  },
  sleepRingContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  sleepRingContent: {
    position: "absolute",
    alignItems: "center",
  },
  sleepEfficiencyValue: {
    fontSize: 32,
    fontWeight: "600",
    color: "#374151",
  },
  sleepEfficiencyLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  sleepQualityBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sleepQualityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sleepStagesContainer: {
    width: "100%",
    marginTop: 20,
  },
  sleepStagesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  sleepStagesBar: {
    flexDirection: "row",
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  sleepStageSegment: {
    height: "100%",
  },
  sleepStagesLegend: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  
  // Manual Sleep Display
  manualSleepDisplay: {
    alignItems: "center",
    paddingVertical: 24,
  },
  manualSleepIcon: {
    marginBottom: 16,
  },
  manualSleepDuration: {
    fontSize: 32,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  manualSleepLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  manualSleepTimes: {
    flexDirection: "row",
    gap: 32,
  },
  manualSleepTimeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  manualSleepTimeText: {
    fontSize: 14,
    color: "#4b5563",
  },
  
  autoSleepDisplay: {
    alignItems: "center",
    paddingVertical: 20,
  },
  sleepMetric: {
    alignItems: "center",
  },
  sleepMetricValue: {
    fontSize: 28,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  sleepMetricLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  sleepConfidence: {
    fontSize: 12,
    color: "#9ca3af",
  },

  // No Sleep Data
  noSleepData: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noSleepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 12,
    marginBottom: 8,
  },
  noSleepText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Sleep Insights
  sleepInsights: {
    gap: 12,
    marginTop: 20,
  },
  insightCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#e5e7eb",
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  insightText: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 18,
  },

  // Auto-tracking Row
  autoTrackingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  autoTrackingInfo: {
    flex: 1,
  },
  autoTrackingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  autoTrackingDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },

  // Settings Button
  settingsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    marginTop: 12,
  },
  settingsButtonText: {
    flex: 1,
    fontSize: 13,
    color: "#4b5563",
    marginLeft: 8,
  },

  // Log Button
  logButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "transparent",
    marginTop: 8,
  },
  logButtonText: { fontSize: 14, color: "#6366f1", fontWeight: "500" },

  // Activity Ring Styles
  mainRingContainer: {
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
    width: 120,
    height: 120,
  },
  ringMainValue: {
    fontSize: 28,
    fontWeight: "600",
    color: "#374151",
  },
  ringLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  ringGoal: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  metricItem: {
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
  metricLabel: {
    fontSize: 11,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  metricGoal: {
    fontSize: 10,
    color: "#9ca3af",
  },
  connectContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  connectTitle: { 
    fontSize: 18, 
    fontWeight: "600", 
    color: "#374151",
    marginTop: 8,
  },
  connectDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  connectHealthButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 12,
  },
  connectHealthText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  infoText: { 
    flex: 1, 
    fontSize: 12, 
    color: "#059669", 
    lineHeight: 16 
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  dataLabel: { fontSize: 14, color: "#6b7280" },
  dataValue: { fontSize: 14, fontWeight: "500" },
  appUsageContainer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  appUsageTitle: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 },
  appRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  appName: { fontSize: 14, color: "#374151", flex: 1 },
  appDuration: { fontSize: 14, fontWeight: "500", color: "#10b981" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: 16, color: "#6b7280", marginTop: 16 },
  
  // Modal Styles
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "600", marginBottom: 8, textAlign: "center", color: "#374151" },
  modalSubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 20 },
  modalLabel: { fontSize: 14, marginTop: 12, marginBottom: 8, color: "#374151", fontWeight: "500" },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f9fafb",
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  timeButtonText: { fontSize: 16, color: "#374151", fontWeight: "500" },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 24, gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#6b7280", fontSize: 14, fontWeight: "500" },
  saveBtn: { backgroundColor: "#6366f1", paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "500" },

  // Prompt Styles
  promptOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  promptContent: {
    width: "85%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  promptIcon: {
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  promptDescription: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  promptButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  promptButtonSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  promptButtonSecondaryText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  promptButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#6366f1",
    alignItems: "center",
  },
  promptButtonPrimaryText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
})