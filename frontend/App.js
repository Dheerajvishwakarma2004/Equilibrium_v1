"use client"

import 'react-native-get-random-values'; 
import { useState, useEffect, useRef } from "react"
import { NavigationContainer, useNavigation } from "@react-navigation/native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createStackNavigator } from "@react-navigation/stack"
import { StatusBar } from "expo-status-bar"
import { View, ActivityIndicator, Text, AppState, TouchableOpacity, Modal, Pressable, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { SafeAreaProvider } from "react-native-safe-area-context"

// Import screens
import Dashboard from "./screens/Dashboard"
import Journal from "./screens/Journal"
import Tracker from "./screens/Tracker"
import Community from "./screens/Community"
import Emergency from "./screens/Emergency"
import Reports from "./screens/Reports"
import AdvancedReports from "./screens/AdvancedReports"
import NotificationSettings from "./screens/NotificationSettings"
import LoginScreen from "./screens/auth/LoginScreen"
import RegisterScreen from "./screens/auth/RegisterScreen"
import WelcomeScreen from "./screens/auth/WelcomeScreen"
import ProfileScreen from "./screens/ProfileScreen"
import SettingsScreen from "./screens/SettingsScreen"
import HelpDirectoryScreen from "./screens/HelpDirectoryScreen"
import PrivacySettingsScreen from "./screens/PrivacySettingsScreen"
import ChangePasswordScreen from "./screens/ChangePasswordScreen"
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen"
import CreatePost from './screens/CreatePost';
import PostDetails from './screens/PostDetails';
// Import services
import authService from "./services/authService"
import behavioralTrackingService from "./services/behavioralTrackingService"
import notificationService from "./services/notificationService"
import localStorageService from './services/localStorageService';

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()
const AuthStack = createStackNavigator()

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f8fafc",
      }}
    >
      <ActivityIndicator size="large" color="#059669" />
      <Text
        style={{
          marginTop: 16,
          fontSize: 16,
          color: "#6b7280",
          fontWeight: "500",
        }}
      >
        Loading...
      </Text>
    </View>
  )
}

function HelpModalSheet({ visible, onClose }) {
  const navigation = useNavigation()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={tabStyles.modalOverlay} onPress={onClose}>
        <Pressable style={tabStyles.modalSheet} onPress={() => {}}>
          <View style={tabStyles.modalHandle} />
          <Text style={tabStyles.modalTitle}>How can we help?</Text>
          <Text style={tabStyles.modalSubtitle}>Choose the type of support you need</Text>

          {[
            { icon: "alert-circle", bg: "#fecaca", color: "#dc2626", title: "Crisis Support", sub: "Immediate help & emergency contacts", screen: "Emergency" },
            { icon: "book-outline", bg: "#dbeafe", color: "#3b82f6", title: "Help Directory", sub: "Therapists, hotlines & resources", screen: "HelpDirectory" },
            { icon: "settings-outline", bg: "#d1fae5", color: "#059669", title: "App Settings", sub: "Notifications, privacy & preferences", screen: "Settings" },
            { icon: "bar-chart-outline", bg: "#ede9fe", color: "#8b5cf6", title: "Wellness Reports", sub: "View your progress & insights", screen: "Reports" },
          ].map((item, i, arr) => (
            <TouchableOpacity
              key={item.screen}
              style={[tabStyles.helpOption, i === arr.length - 1 && { borderBottomWidth: 0 }]}
              activeOpacity={0.7}
              onPress={() => { onClose(); navigation.navigate(item.screen) }}
            >
              <View style={[tabStyles.helpOptionIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={tabStyles.helpOptionText}>
                <Text style={tabStyles.helpOptionTitle}>{item.title}</Text>
                <Text style={tabStyles.helpOptionSubtitle}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={tabStyles.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={tabStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function TabNavigator() {
  const [helpVisible, setHelpVisible] = useState(false)

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName
            if (route.name === "Home") iconName = focused ? "home" : "home-outline"
            else if (route.name === "Journal") iconName = focused ? "book" : "book-outline"
            else if (route.name === "Track") iconName = focused ? "analytics" : "analytics-outline"
            else if (route.name === "Support") iconName = focused ? "people" : "people-outline"
            return <Ionicons name={iconName} size={size} color={color} />
          },
          tabBarActiveTintColor: "#059669",
          tabBarInactiveTintColor: "#94a3b8",
          tabBarStyle: {
            backgroundColor: "#ffffff",
            borderTopColor: "#e2e8f0",
            paddingBottom: 5,
            paddingTop: 5,
            height: 60,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={Dashboard} options={{ tabBarLabel: "Home" }} />
        <Tab.Screen name="Journal" component={Journal} />
        <Tab.Screen
          name="Wellbeing"
          component={Dashboard}
          options={{
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View style={tabStyles.heartButtonOuter}>
                <View style={tabStyles.heartButtonInner}>
                  <Ionicons name="heart" size={26} color="#ffffff" />
                </View>
              </View>
            ),
            tabBarButton: (props) => (
              <TouchableOpacity
                {...props}
                activeOpacity={0.85}
                onPress={() => setHelpVisible(true)}
              />
            ),
          }}
        />
        <Tab.Screen name="Track" component={Tracker} />
        <Tab.Screen name="Support" component={Community} />
      </Tab.Navigator>

      <HelpModalSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />
    </>
  )
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  )
}

function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen name="Emergency" component={Emergency} />
      <Stack.Screen name="Community" component={Community} />
      <Stack.Screen name="Reports" component={Reports} />
      <Stack.Screen name="AdvancedReports" component={AdvancedReports} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
      <Stack.Screen name="HelpDirectory" component={HelpDirectoryScreen} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="CreatePost" component={CreatePost} />
<Stack.Screen name="PostDetails" component={PostDetails} />
    </Stack.Navigator>
  )
}

const tabStyles = StyleSheet.create({
  heartButtonOuter: {
    position: "absolute",
    bottom: 4,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  heartButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f472b6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f472b6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  helpOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 14,
  },
  helpOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  helpOptionText: {
    flex: 1,
  },
  helpOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  helpOptionSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
})

export default function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    initializeApp()

    // Listen for auth state changes
    const authStateListener = (authenticated) => {
      setIsAuthenticated(authenticated)
    }

    authService.addAuthStateListener(authStateListener)

    // Handle app state changes for behavioral tracking
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === "active") {
        // App became active - behavioral tracking will handle this
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        // App went to background - behavioral tracking will handle this
      }
    }

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    // Cleanup listeners on unmount
    return () => {
      authService.removeAuthStateListener(authStateListener)
      appStateSubscription?.remove()
    }
  }, [])

  const initializeApp = async () => {
    try {
      await localStorageService.initialize();
      const authInitialized = await authService.initializeAuth()
      setIsAuthenticated(authInitialized)

      // Initialize behavioral tracking if user is authenticated
      if (authInitialized) {
        await behavioralTrackingService.initializeTracking()
        // Initialize notification service
        await notificationService.initialize()
      }
    } catch (error) {
      console.error("App initialization error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>{isAuthenticated ? <MainNavigator /> : <AuthNavigator />}</NavigationContainer>
    </SafeAreaProvider>
  )
}