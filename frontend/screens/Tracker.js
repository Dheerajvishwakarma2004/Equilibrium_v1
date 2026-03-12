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
  TextInput,
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
    sleepData: [],
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
  const [manualSleepDate, setManualSleepDate] = useState(null)
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
    fetchSleepWindow()
    fetchSleepPreference()
    setupActivityTracking()
    checkBootstrapAndMissingData()
  }, [])

  useEffect(() => {
    fetchData()
  }, [sleepWindow, sleepTrackingMode])

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (activityListener) {
        activityListener()
      }
    }
  }, [activityListener])

  const setupActivityTracking = async () => {
    try {
      // Start activity tracking
      await behavioralTrackingService.startActivityTracking()
      
      // Setup real-time listener
      const unsubscribe = behavioralTrackingService.addActivityListener((activityUpdate) => {
        if (activityUpdate && activityUpdate.type === 'step_update') {
          // Refresh data when we get real-time updates
          fetchData()
        }
      })
      
      setActivityListener(() => unsubscribe)
    } catch (error) {
      console.error("Failed to setup activity tracking:", error)
    }
  }

  const checkBootstrapAndMissingData = async () => {
    try {
      // Check for bootstrap prompt
      const shouldShowBootstrap = await sleepTrackingService.checkAndShowBootstrapPrompt()
      if (shouldShowBootstrap) {
        setShowBootstrapPrompt(true)
        return
      }

      // Check for missing sleep data
      const missingDataDate = await sleepTrackingService.checkMissingSleepData()
      if (missingDataDate) {
        setMissingDate(missingDataDate)
        setShowMissingPrompt(true)
      }
    } catch (error) {
      console.error("Check bootstrap/missing data error:", error)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await fetchSleepWindow();
    await fetchSleepPreference();
    setRefreshing(false);
  };

  const fetchSleepPreference = async () => {
    try {
      const prefs = await localStorageService.getSleepPreferences()
      if (prefs) {
        setSleepTrackingMode(prefs.mode || "screen_usage")
        setFitnessConnected(prefs.fitnessConnected || false)
        setAutoTrackingEnabled(prefs.autoTrackingEnabled || false)
      }
    } catch (e) {
      console.log("No saved sleep preference")
    }
  }

  const saveSleepPreference = async (mode, connected = fitnessConnected, autoEnabled = autoTrackingEnabled) => {
    const prefs = { mode, fitnessConnected: connected, autoTrackingEnabled: autoEnabled }
    await localStorageService.saveSleepPreferences(prefs)
    setSleepTrackingMode(mode)
    setFitnessConnected(connected)
    setAutoTrackingEnabled(autoEnabled)
    await fetchData()
  }

  const toggleAutoTracking = async () => {
    const newState = !autoTrackingEnabled

    if (newState) {
      // Enable auto tracking
      const success = await sleepTrackingService.enableAutoTracking()
      if (success) {
        await saveSleepPreference("auto_tracking", fitnessConnected, true)
        Alert.alert("Auto-Tracking Enabled", "Sleep tracking will automatically start at your bedtime.")
      } else {
        Alert.alert("Error", "Failed to enable auto-tracking. Please check your sleep window settings.")
      }
    } else {
      // Disable auto tracking
      await sleepTrackingService.disableAutoTracking()
      await saveSleepPreference("screen_usage", fitnessConnected, false)
      Alert.alert("Auto-Tracking Disabled", "Automatic sleep tracking has been turned off.")
    }
  }

  const connectHealthConnect = async () => {
    try {
      const granted = await behavioralTrackingService.requestHealthConnectPermission?.()
      
      if (granted) {
        setFitnessConnected(true)
        await saveSleepPreference("fitness_band", true, autoTrackingEnabled)
        Alert.alert("Success", "Health Connect connected successfully!")
      } else {
        Alert.alert(
          "Permission Required",
          "Please enable Health Connect permissions in your device settings."
        )
      }
    } catch (error) {
      console.error("Error connecting Health Connect:", error)
      Alert.alert("Error", "Failed to connect Health Connect.")
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

      // Get sleep data based on mode
      let sleepHours = 0
      let sleepSource = "Not tracked"
      let sleepConfidence = 0
      let sleepDetails = null

      if (sleepTrackingMode === "auto_tracking" && autoTrackingEnabled) {
        const lastNight = await sleepTrackingService.getLastNightSleep()
        if (lastNight) {
          sleepHours = lastNight.total_sleep_minutes / 60
          sleepSource = "Auto Tracking"
          sleepConfidence = lastNight.confidence_score
          sleepDetails = lastNight
        }
      } else if (sleepTrackingMode === "fitness_band" && fitnessConnected) {
        const fitnessData = await localStorageService.getFitnessSleepData(1)
        if (fitnessData && fitnessData.length > 0) {
          sleepHours = fitnessData[0].sleepHours || 0
          sleepSource = "Health Connect"
          sleepConfidence = fitnessData[0].confidence || 0.95
        }
      } else {
        const screenSleepData = await localStorageService.getScreenUsageSleepData(1)
        if (screenSleepData && screenSleepData.length > 0) {
          sleepHours = screenSleepData[0].estimatedSleepHours || 0
          sleepSource = "Screen Usage"
          sleepConfidence = screenSleepData[0].confidence || 0.6
        } else if (usageStats?.sleepData) {
          sleepHours = usageStats.sleepData.estimatedSleepMinutes / 60
          sleepSource = "Screen Usage"
          sleepConfidence = usageStats.sleepData.confidence || 0.6
        }
      }

      const formattedData = {
        todayStats: [
          {
            icon: "moon",
            value: sleepHours > 0
              ? `${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m`
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
          hours: sleepHours,
          source: sleepSource,
          confidence: sleepConfidence,
          details: sleepDetails,
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
      Alert.alert("Error", "Failed to fetch tracker data.")
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

  const openManualSleepLog = (date = null) => {
    setManualSleepDate(date || new Date().toISOString().split("T")[0])
    setManualSleepModalVisible(true)
  }

  const saveManualSleep = async () => {
    try {
      await sleepTrackingService.logManualSleep(
        manualSleepDate,
        manualSleepStart.toISOString(),
        manualSleepEnd.toISOString(),
        isNap
      )

      Alert.alert("Success", "Sleep logged successfully!")
      setManualSleepModalVisible(false)
      setIsNap(false)
      await fetchData()
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to log sleep")
    }
  }

  const handleBootstrapSkip = async () => {
    await sleepTrackingService.markBootstrapComplete()
    setShowBootstrapPrompt(false)
  }

  const handleBootstrapLog = () => {
    setShowBootstrapPrompt(false)
    openManualSleepLog()
  }

  const handleMissingSkip = async () => {
    await sleepTrackingService.markMissingPromptShown(missingDate)
    setShowMissingPrompt(false)
  }

  const handleMissingLog = () => {
    setShowMissingPrompt(false)
    openManualSleepLog(missingDate)
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

          {/* Sleep Tracking */}
          <View style={styles.trackingCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleContainer}>
                <Ionicons name="moon" size={20} color="#6366f1" />
                <Text style={styles.cardTitle}>Sleep Patterns</Text>
                {sleepTrackingMode === "auto_tracking" && autoTrackingEnabled && (
                  <View style={[styles.sourceTag, { backgroundColor: "#6366f1" }]}>
                    <Text style={styles.sourceTagText}>Auto</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.cardContent}>
              {/* Auto-Tracking Toggle */}
              <View style={[styles.dataRow, { backgroundColor: "#f0f9ff" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dataLabel}>Auto-Tracking</Text>
                  <Text style={styles.dataSubtext}>
                    Automatically track sleep with sensors
                  </Text>
                </View>
                <Switch
                  value={autoTrackingEnabled}
                  onValueChange={toggleAutoTracking}
                  trackColor={{ false: "#cbd5e1", true: "#6366f1" }}
                  thumbColor={autoTrackingEnabled ? "#ffffff" : "#f4f3f4"}
                />
              </View>

              <View style={[styles.dataRow, { backgroundColor: "#e0e7ff" }]}>
                <Text style={styles.dataLabel}>Last night</Text>
                <Text style={[styles.dataValue, { color: "#6366f1" }]}>
                  {data.sleepData.hours > 0
                    ? `${Math.floor(data.sleepData.hours)}h ${Math.round((data.sleepData.hours % 1) * 60)}m`
                    : "Not tracked"}
                </Text>
              </View>

              {/* Show detailed sleep metrics if available */}
              {data.sleepData.details && (
                <>
                  <View style={[styles.dataRow, { backgroundColor: "#dbeafe" }]}>
                    <Text style={styles.dataLabel}>Deep Sleep</Text>
                    <Text style={[styles.dataValue, { color: "#3b82f6" }]}>
                      {formatDuration(data.sleepData.details.deep_sleep_minutes)}
                    </Text>
                  </View>
                  <View style={[styles.dataRow, { backgroundColor: "#e0f2fe" }]}>
                    <Text style={styles.dataLabel}>Light Sleep</Text>
                    <Text style={[styles.dataValue, { color: "#0ea5e9" }]}>
                      {formatDuration(data.sleepData.details.light_sleep_minutes)}
                    </Text>
                  </View>
                  <View style={[styles.dataRow, { backgroundColor: "#ede9fe" }]}>
                    <Text style={styles.dataLabel}>Sleep Efficiency</Text>
                    <Text style={[styles.dataValue, { color: "#8b5cf6" }]}>
                      {Math.round(data.sleepData.details.sleep_efficiency * 100)}%
                    </Text>
                  </View>
                </>
              )}

              <View style={[styles.dataRow, { backgroundColor: "#dbeafe" }]}>
                <Text style={styles.dataLabel}>Bedtime window</Text>
                <Text style={[styles.dataValue, { color: "#3b82f6" }]}>
                  {formatTime(sleepWindow.bedtime || new Date().setHours(23, 0, 0))}
                </Text>
              </View>
              <View style={[styles.dataRow, { backgroundColor: "#ede9fe" }]}>
                <Text style={styles.dataLabel}>Wake-up window</Text>
                <Text style={[styles.dataValue, { color: "#8b5cf6" }]}>
                  {formatTime(sleepWindow.wakeup || new Date().setHours(7, 0, 0))}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.logButton} onPress={() => setModalVisible(true)}>
                  <Ionicons name="time" size={16} color="#6366f1" />
                  <Text style={styles.logButtonText}>Adjust Window</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.logButton, { marginLeft: 8 }]} 
                  onPress={() => openManualSleepLog()}
                >
                  <Ionicons name="add-circle" size={16} color="#6366f1" />
                  <Text style={styles.logButtonText}>Log Sleep</Text>
                </TouchableOpacity>
              </View>
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
              Define your typical sleep schedule
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
              Manually record your sleep duration
            </Text>

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

            <View style={[styles.dataRow, { backgroundColor: "#f0f9ff", marginTop: 12 }]}>
              <Text style={styles.dataLabel}>This is a nap</Text>
              <Switch
                value={isNap}
                onValueChange={setIsNap}
                trackColor={{ false: "#cbd5e1", true: "#6366f1" }}
                thumbColor={isNap ? "#ffffff" : "#f4f3f4"}
              />
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
      <Modal visible={showBootstrapPrompt} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.promptContent}>
            <Ionicons name="moon" size={48} color="#6366f1" />
            <Text style={styles.promptTitle}>Did you sleep last night?</Text>
            <Text style={styles.promptSubtitle}>
              You can log your sleep to start tracking your sleep trends.
            </Text>
            <View style={styles.promptButtons}>
              <TouchableOpacity style={styles.promptSkipBtn} onPress={handleBootstrapSkip}>
                <Text style={styles.promptSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.promptLogBtn} onPress={handleBootstrapLog}>
                <Text style={styles.promptLogText}>Log Sleep</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Missing Sleep Prompt */}
      <Modal visible={showMissingPrompt} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.promptContent}>
            <Ionicons name="alert-circle" size={48} color="#f59e0b" />
            <Text style={styles.promptTitle}>Missing Sleep Data</Text>
            <Text style={styles.promptSubtitle}>
              We couldn't detect your sleep last night. Would you like to log it manually?
            </Text>
            <View style={styles.promptButtons}>
              <TouchableOpacity style={styles.promptSkipBtn} onPress={handleMissingSkip}>
                <Text style={styles.promptSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.promptLogBtn} onPress={handleMissingLog}>
                <Text style={styles.promptLogText}>Log Sleep</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  cardContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
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
  },
  dataLabel: { fontSize: 14, color: "#6b7280", fontWeight: "500" },
  dataSubtext: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  dataValue: { fontSize: 14, fontWeight: "500" },
  buttonRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  logButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "transparent",
  },
  logButtonText: { fontSize: 14, color: "#6366f1", fontWeight: "500" },
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
  promptContent: {
    width: "85%",
    maxWidth: 350,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
  },
  promptTitle: { fontSize: 20, fontWeight: "600", marginTop: 16, marginBottom: 8, color: "#374151", textAlign: "center" },
  promptSubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  promptButtons: { flexDirection: "row", gap: 12, width: "100%" },
  promptSkipBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb" },
  promptSkipText: { fontSize: 15, fontWeight: "600", color: "#6b7280", textAlign: "center" },
  promptLogBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: "#6366f1" },
  promptLogText: { fontSize: 15, fontWeight: "600", color: "#fff", textAlign: "center" },
})
