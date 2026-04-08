// screens/CreatePost.js
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useState, useRef, useEffect } from "react"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import forumService from "../services/forumService"

export default function CreatePost({ navigation }) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("general")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [titleFocused, setTitleFocused] = useState(false)
  const [contentFocused, setContentFocused] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const categories = [
    { value: "general",       label: "General",       icon: "apps-outline",           color: "#3a9e6e", bgColor: "#e6f7ef" },
    { value: "daily-checkins",label: "Daily Check-in", icon: "sunny-outline",          color: "#d97706", bgColor: "#fef3c7" },
    { value: "coping-tips",   label: "Coping Tips",    icon: "heart-outline",          color: "#db2777", bgColor: "#fce7f3" },
    { value: "support",       label: "Support",        icon: "people-outline",         color: "#3a9e6e", bgColor: "#e6f7ef" },
    { value: "anxiety",       label: "Anxiety",        icon: "warning-outline",        color: "#ea580c", bgColor: "#ffedd5" },
    { value: "depression",    label: "Depression",     icon: "rainy-outline",          color: "#4f46e5", bgColor: "#e0e7ff" },
    { value: "other",         label: "Other",          icon: "ellipsis-horizontal-circle-outline", color: "#52796f", bgColor: "#e6f7ef" },
  ]

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please enter a title for your post")
      return
    }
    if (!content.trim()) {
      Alert.alert("Missing Content", "Please write something in your post")
      return
    }
    if (title.length > 200) {
      Alert.alert("Title Too Long", "Title must be less than 200 characters")
      return
    }
    if (content.length > 5000) {
      Alert.alert("Content Too Long", "Content must be less than 5000 characters")
      return
    }

    try {
      setIsSubmitting(true)
      const result = await forumService.createPost({
        title: title.trim(),
        content: content.trim(),
        category: selectedCategory,
      })

      if (result.success) {
        Alert.alert("Posted", "Your post has been shared anonymously", [
          { text: "OK", onPress: () => navigation.goBack() },
        ])
      } else {
        Alert.alert("Error", result.message || "Failed to create post")
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isReady = title.trim() && content.trim()

  return (
    <SafeAreaWrapper backgroundColor="#f0faf4" statusBarStyle="dark-content">
      <View style={styles.mainBackground}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={21} color="#1b4332" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>New Post</Text>
            <Text style={styles.headerSub}>Share anonymously</Text>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!isReady || isSubmitting}
            activeOpacity={0.8}
            style={styles.publishWrapper}
          >
            <LinearGradient
              colors={isReady && !isSubmitting ? ["#3a9e6e", "#52b788"] : ["#c8e6c9", "#c8e6c9"]}
              style={styles.publishButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isSubmitting ? (
                <Text style={[styles.publishText, { color: "#ffffff" }]}>Posting...</Text>
              ) : (
                <>
                  <Ionicons
                    name="send"
                    size={14}
                    color={isReady ? "#ffffff" : "#a5c8b0"}
                  />
                  <Text style={[styles.publishText, !isReady && styles.publishTextDisabled]}>
                    Post
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

              {/* ── PRIVACY NOTICE ── */}
              <View style={styles.privacyNotice}>
                <View style={styles.privacyIconWrap}>
                  <Ionicons name="shield-checkmark" size={24} color="#3a9e6e" />
                </View>
                <View style={styles.privacyTextWrap}>
                  <Text style={styles.privacyTitle}>You're posting anonymously</Text>
                  <Text style={styles.privacySubtitle}>
                    Your identity is fully protected. Share freely and openly.
                  </Text>
                </View>
              </View>

              {/* ── CATEGORY SELECTION ── */}
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <Ionicons name="pricetag-outline" size={14} color="#3a9e6e" />
                  <Text style={styles.sectionLabel}>Choose a Topic</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoriesScroll}
                >
                  {categories.map((cat) => {
                    const isActive = selectedCategory === cat.value
                    return (
                      <TouchableOpacity
                        key={cat.value}
                        onPress={() => setSelectedCategory(cat.value)}
                        activeOpacity={0.78}
                        style={styles.categoryPill}
                      >
                        <View
                          style={[
                            styles.categoryChip,
                            isActive
                              ? { backgroundColor: cat.color, borderColor: cat.color }
                              : { backgroundColor: "#ffffff", borderColor: "#b7e4c7" },
                          ]}
                        >
                          <View
                            style={[
                              styles.categoryIconWrap,
                              {
                                backgroundColor: isActive
                                  ? "rgba(255,255,255,0.22)"
                                  : cat.bgColor,
                              },
                            ]}
                          >
                            <Ionicons
                              name={cat.icon}
                              size={16}
                              color={isActive ? "#ffffff" : cat.color}
                            />
                          </View>
                          <Text
                            style={[
                              styles.categoryChipText,
                              { color: isActive ? "#ffffff" : "#2d6a4f" },
                            ]}
                          >
                            {cat.label}
                          </Text>
                          {isActive && (
                            <Ionicons
                              name="checkmark"
                              size={13}
                              color="#ffffff"
                              style={{ marginLeft: 2 }}
                            />
                          )}
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              {/* ── TITLE INPUT ── */}
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <Ionicons name="text-outline" size={14} color="#3a9e6e" />
                  <Text style={styles.sectionLabel}>Title</Text>
                </View>
                <View style={[styles.inputBox, titleFocused && styles.inputBoxFocused]}>
                  <TextInput
                    style={styles.titleInput}
                    placeholder="What's on your mind?"
                    placeholderTextColor="#95d5b2"
                    value={title}
                    onChangeText={setTitle}
                    maxLength={200}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    returnKeyType="next"
                  />
                  <Text style={[styles.charCount, title.length > 180 && styles.charCountWarn]}>
                    {title.length}/200
                  </Text>
                </View>
              </View>

              {/* ── CONTENT INPUT ── */}
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <Ionicons name="create-outline" size={14} color="#3a9e6e" />
                  <Text style={styles.sectionLabel}>Your Message</Text>
                </View>
                <View style={[styles.inputBox, styles.contentInputBox, contentFocused && styles.inputBoxFocused]}>
                  <TextInput
                    style={styles.contentInput}
                    placeholder={
                      "Express yourself freely. This is a safe space where your voice matters.\n\nShare your story, ask for support, or offer encouragement to others..."
                    }
                    placeholderTextColor="#95d5b2"
                    value={content}
                    onChangeText={setContent}
                    multiline
                    textAlignVertical="top"
                    maxLength={5000}
                    onFocus={() => setContentFocused(true)}
                    onBlur={() => setContentFocused(false)}
                  />
                  <Text style={[styles.charCount, content.length > 4500 && styles.charCountWarn]}>
                    {content.length}/5000
                  </Text>
                </View>
              </View>

              {/* ── GUIDELINES ── */}
              <View style={styles.guidelinesCard}>
                <View style={styles.guidelinesHeader}>
                  <View style={styles.guidelinesIconWrap}>
                    <Ionicons name="information-circle-outline" size={20} color="#3a9e6e" />
                  </View>
                  <Text style={styles.guidelinesTitle}>Community Guidelines</Text>
                </View>
                <View style={styles.guidelinesList}>
                  {[
                    "Be kind, supportive, and empathetic to others",
                    "Respect everyone's privacy and confidentiality",
                    "No hate speech, harassment, or discrimination",
                    "Seek professional help for mental health crises",
                  ].map((text, i) => (
                    <View key={i} style={styles.guidelineItem}>
                      <Ionicons name="checkmark-circle" size={17} color="#52b788" style={{ marginTop: 1 }} />
                      <Text style={styles.guidelineText}>{text}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── SUBMIT BUTTON (bottom) ── */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!isReady || isSubmitting}
                activeOpacity={0.85}
                style={styles.submitBtn}
              >
                <LinearGradient
                  colors={isReady && !isSubmitting ? ["#3a9e6e", "#52b788"] : ["#c8e6c9", "#c8e6c9"]}
                  style={styles.submitBtnInner}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons
                    name={isSubmitting ? "hourglass-outline" : "send-outline"}
                    size={18}
                    color={isReady ? "#ffffff" : "#a5c8b0"}
                  />
                  <Text style={[styles.submitBtnText, !isReady && styles.submitBtnTextDisabled]}>
                    {isSubmitting ? "Posting..." : "Publish Anonymously"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={{ height: 60 }} />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  mainBackground: {
    flex: 1,
    backgroundColor: "#f0faf4",
  },

  // ── HEADER ──────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "#f7fdf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d0ead9",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 13,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1b4332",
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 11.5,
    color: "#52796f",
    marginTop: 1,
  },
  publishWrapper: {
    borderRadius: 10,
    overflow: "hidden",
  },
  publishButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  publishText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  publishTextDisabled: {
    color: "#a5c8b0",
  },

  // ── SCROLL ──────────────────────────────────────────────
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // ── PRIVACY NOTICE ──────────────────────────────────────
  privacyNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#e6f7ef",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b7e4c7",
    gap: 13,
  },
  privacyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#d8f3dc",
    justifyContent: "center",
    alignItems: "center",
  },
  privacyTextWrap: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 3,
  },
  privacySubtitle: {
    fontSize: 12.5,
    color: "#2d6a4f",
    lineHeight: 18,
  },

  // ── SECTION ─────────────────────────────────────────────
  section: {
    marginBottom: 20,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1b4332",
  },

  // ── CATEGORIES ──────────────────────────────────────────
  categoriesScroll: {
    paddingBottom: 4,
  },
  categoryPill: {
    marginRight: 9,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 50,
    borderWidth: 1.5,
    gap: 6,
  },
  categoryIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: "600",
  },

  // ── INPUT BOXES ─────────────────────────────────────────
  inputBox: {
    backgroundColor: "#ffffff",
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#d0ead9",
    overflow: "hidden",
  },
  inputBoxFocused: {
    borderColor: "#3a9e6e",
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  contentInputBox: {
    minHeight: 200,
  },
  titleInput: {
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 6,
    fontSize: 16,
    fontWeight: "600",
    color: "#1b4332",
  },
  contentInput: {
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 6,
    fontSize: 14.5,
    color: "#374151",
    lineHeight: 22,
    minHeight: 180,
  },
  charCount: {
    fontSize: 11.5,
    color: "#95d5b2",
    fontWeight: "500",
    textAlign: "right",
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  charCountWarn: {
    color: "#d97706",
  },

  // ── GUIDELINES ──────────────────────────────────────────
  guidelinesCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#d0ead9",
  },
  guidelinesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  guidelinesIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  guidelinesTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#1b4332",
  },
  guidelinesList: {
    gap: 11,
  },
  guidelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13.5,
    color: "#374151",
    lineHeight: 20,
  },

  // ── SUBMIT BUTTON ────────────────────────────────────────
  submitBtn: {
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 10,
  },
  submitBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 13,
  },
  submitBtnText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#ffffff",
  },
  submitBtnTextDisabled: {
    color: "#a5c8b0",
  },
})