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
    { value: "general", label: "General", icon: "apps", color: "#8b5cf6", bgColor: "#f5f3ff" },
    { value: "daily-checkins", label: "Daily Check-in", icon: "sunny", color: "#f59e0b", bgColor: "#fef3c7" },
    { value: "coping-tips", label: "Coping Tips", icon: "heart", color: "#ec4899", bgColor: "#fce7f3" },
    { value: "support", label: "Support", icon: "people", color: "#10b981", bgColor: "#d1fae5" },
    { value: "anxiety", label: "Anxiety", icon: "warning", color: "#f97316", bgColor: "#ffedd5" },
    { value: "depression", label: "Depression", icon: "rainy", color: "#6366f1", bgColor: "#e0e7ff" },
    { value: "other", label: "Other", icon: "ellipsis-horizontal", color: "#64748b", bgColor: "#f1f5f9" },
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
        Alert.alert("✓ Published", "Your post has been shared anonymously", [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
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

  const selectedCategoryData = categories.find((c) => c.value === selectedCategory)

  return (
    <SafeAreaWrapper backgroundColor="#f8fafc" statusBarStyle="dark-content">
      <LinearGradient colors={["#ffffff", "#f8fafc"]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={26} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Post</Text>
          <TouchableOpacity
            style={styles.publishButton}
            onPress={handleSubmit}
            disabled={!title.trim() || !content.trim() || isSubmitting}
          >
            {!isSubmitting ? (
              <LinearGradient 
                colors={title.trim() && content.trim() ? ["#10b981", "#059669"] : ["#e2e8f0", "#cbd5e1"]} 
                style={styles.publishGradient}
              >
                <Text style={[
                  styles.publishText, 
                  (!title.trim() || !content.trim()) && styles.publishTextDisabled
                ]}>
                  Publish
                </Text>
              </LinearGradient>
            ) : (
              <View style={[styles.publishGradient, { backgroundColor: "#e2e8f0" }]}>
                <Text style={styles.publishTextDisabled}>Publishing...</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {/* Privacy Notice */}
              <View style={styles.privacyNotice}>
                <View style={styles.privacyIconContainer}>
                  <Ionicons name="shield-checkmark" size={28} color="#10b981" />
                </View>
                <View style={styles.privacyTextContainer}>
                  <Text style={styles.privacyTitle}>Anonymous Posting</Text>
                  <Text style={styles.privacySubtitle}>Your identity is completely protected. Share freely.</Text>
                </View>
              </View>

              {/* Category Selection */}
              <View style={styles.section}>
                <Text style={styles.label}>
                  <Ionicons name="pricetag" size={16} color="#10b981" /> Select Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.value}
                      style={styles.categoryOption}
                      onPress={() => setSelectedCategory(category.value)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.categoryCard,
                          {
                            backgroundColor: selectedCategory === category.value ? category.color : "#ffffff",
                            borderColor: selectedCategory === category.value ? category.color : "#e2e8f0",
                          },
                        ]}
                      >
                        <View style={[
                          styles.categoryIconBg,
                          { backgroundColor: selectedCategory === category.value ? "rgba(255,255,255,0.25)" : category.bgColor }
                        ]}>
                          <Ionicons 
                            name={category.icon} 
                            size={20} 
                            color={selectedCategory === category.value ? "#ffffff" : category.color} 
                          />
                        </View>
                        <Text style={[
                          styles.categoryLabel,
                          { color: selectedCategory === category.value ? "#ffffff" : "#1e293b" }
                        ]}>
                          {category.label}
                        </Text>
                        {selectedCategory === category.value && (
                          <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={styles.checkmark} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Title Input */}
              <View style={styles.section}>
                <Text style={styles.label}>
                  <Ionicons name="text" size={16} color="#10b981" /> Post Title
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.titleInput}
                    placeholder="What's on your mind?"
                    placeholderTextColor="#94a3b8"
                    value={title}
                    onChangeText={setTitle}
                    maxLength={200}
                  />
                  <View style={styles.charCountContainer}>
                    <Text style={[styles.charCount, title.length > 180 && styles.charCountWarning]}>
                      {title.length}/200
                    </Text>
                  </View>
                </View>
              </View>

              {/* Content Input */}
              <View style={styles.section}>
                <Text style={styles.label}>
                  <Ionicons name="create" size={16} color="#10b981" /> Share Your Thoughts
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.contentInput}
                    placeholder="Express yourself freely. This is a safe space where your voice matters. Share your story, ask for support, or offer encouragement to others..."
                    placeholderTextColor="#94a3b8"
                    value={content}
                    onChangeText={setContent}
                    multiline
                    numberOfLines={12}
                    textAlignVertical="top"
                    maxLength={5000}
                  />
                  <View style={styles.charCountContainer}>
                    <Text style={[styles.charCount, content.length > 4500 && styles.charCountWarning]}>
                      {content.length}/5000
                    </Text>
                  </View>
                </View>
              </View>

              {/* Community Guidelines */}
              <View style={styles.guidelinesCard}>
                <View style={styles.guidelinesHeader}>
                  <Ionicons name="information-circle" size={24} color="#10b981" />
                  <Text style={styles.guidelinesTitle}>Community Guidelines</Text>
                </View>
                <View style={styles.guidelinesList}>
                  <View style={styles.guidelineItem}>
                    <View style={styles.guidelineIconContainer}>
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    </View>
                    <Text style={styles.guidelineText}>Be kind, supportive, and empathetic to others</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <View style={styles.guidelineIconContainer}>
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    </View>
                    <Text style={styles.guidelineText}>Respect everyone's privacy and confidentiality</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <View style={styles.guidelineIconContainer}>
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    </View>
                    <Text style={styles.guidelineText}>No hate speech, harassment, or discrimination</Text>
                  </View>
                  <View style={styles.guidelineItem}>
                    <View style={styles.guidelineIconContainer}>
                      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    </View>
                    <Text style={styles.guidelineText}>Seek professional help for mental health crises</Text>
                  </View>
                </View>
              </View>

              <View style={{ height: 60 }} />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  publishButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  publishGradient: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  publishText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  publishTextDisabled: {
    color: "#94a3b8",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  privacyNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  privacyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#d1fae5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#047857",
    marginBottom: 4,
  },
  privacySubtitle: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "500",
    lineHeight: 20,
  },
  section: {
    marginBottom: 28,
  },
  label: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
  },
  categoriesScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  categoryOption: {
    marginRight: 12,
  },
  categoryCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  categoryIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  checkmark: {
    marginLeft: 4,
  },
  inputContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  titleInput: {
    padding: 18,
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
  },
  contentInput: {
    padding: 18,
    fontSize: 16,
    color: "#1e293b",
    minHeight: 240,
    lineHeight: 24,
  },
  charCountContainer: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  charCount: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "600",
    textAlign: "right",
  },
  charCountWarning: {
    color: "#f59e0b",
  },
  guidelinesCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  guidelinesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  guidelinesTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  guidelinesList: {
    gap: 14,
  },
  guidelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  guidelineIconContainer: {
    marginTop: 2,
  },
  guidelineText: {
    flex: 1,
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
  },
})