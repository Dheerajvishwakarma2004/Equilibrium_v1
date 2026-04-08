// screens/Community.js
"use client"

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Animated,
  Dimensions,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect, useRef } from "react"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import forumService from "../services/forumService"

const { width } = Dimensions.get("window")

export default function Community({ navigation }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [sortBy, setSortBy] = useState("recent")
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    loadPosts()
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
  }, [selectedCategory, sortBy])

  const loadPosts = async () => {
    try {
      setLoading(true)
      const result = await forumService.getAllPosts(1, 20, selectedCategory, sortBy)
      if (result.success && Array.isArray(result.posts)) {
        setPosts(result.posts)
      } else {
        setPosts([])
      }
    } catch (error) {
      console.error("Error loading posts:", error)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadPosts()
    setRefreshing(false)
  }

  const handleLikePost = async (postId) => {
    try {
      const result = await forumService.toggleLikePost(postId)
      if (result.success) {
        setPosts((prevPosts) =>
          prevPosts.map((post) =>
            post._id === postId
              ? { ...post, likesCount: result.data.likesCount, isLiked: result.data.liked }
              : post
          )
        )
      }
    } catch (error) {
      console.error("Error toggling like:", error)
    }
  }

  const handleReportPost = (postId) => {
    Alert.alert(
      "Report Post",
      "Why are you reporting this post?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Inappropriate Content", onPress: () => submitReport(postId, "Inappropriate Content") },
        { text: "Spam", onPress: () => submitReport(postId, "Spam") },
        { text: "Harassment", onPress: () => submitReport(postId, "Harassment") },
      ],
      { cancelable: true }
    )
  }

  const submitReport = async (postId, reason) => {
    try {
      const result = await forumService.reportPost(postId, reason)
      if (result.success) {
        Alert.alert("Reported", result.message)
      } else {
        Alert.alert("Error", result.message)
      }
    } catch (error) {
      Alert.alert("Error", "Failed to report post")
    }
  }

  const categories = [
    { icon: "apps-outline",            title: "All",            value: "all",           color: "#3a9e6e", bgColor: "#e6f7ef" },
    { icon: "sunny-outline",           title: "Daily Check-ins",value: "daily-checkins",color: "#d97706", bgColor: "#fef3c7" },
    { icon: "heart-outline",           title: "Coping Tips",    value: "coping-tips",   color: "#db2777", bgColor: "#fce7f3" },
    { icon: "people-outline",          title: "Community",      value: "community",     color: "#3a9e6e", bgColor: "#e6f7ef" },
    { icon: "warning-outline",         title: "Anxiety",        value: "anxiety",       color: "#ea580c", bgColor: "#ffedd5" },
    { icon: "rainy-outline",           title: "Depression",     value: "depression",    color: "#4f46e5", bgColor: "#e0e7ff" },
  ]

  const formatTimeAgo = (date) => {
    const now = new Date()
    const postDate = new Date(date)
    const diffInMs = now - postDate
    const diffInMins = Math.floor(diffInMs / 60000)
    const diffInHours = Math.floor(diffInMs / 3600000)
    const diffInDays = Math.floor(diffInMs / 86400000)

    if (diffInMins < 1) return "Just now"
    if (diffInMins < 60) return `${diffInMins}m ago`
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInDays < 7) return `${diffInDays}d ago`
    return postDate.toLocaleDateString()
  }

  const getCategoryColor = (category) => {
    const found = categories.find((c) => c.value === category)
    return found ? found.color : "#3a9e6e"
  }

  const getCategoryBgColor = (category) => {
    const found = categories.find((c) => c.value === category)
    return found ? found.bgColor : "#e6f7ef"
  }

  return (
    <SafeAreaWrapper backgroundColor="#f0faf4" statusBarStyle="dark-content">
      <View style={styles.mainBackground}>

        {/* ── HEADER ── */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={21} color="#1b4332" />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Community</Text>
              <Text style={styles.headerSubtitle}>A safe space to share & heal</Text>
            </View>

            <TouchableOpacity style={styles.searchButton} activeOpacity={0.7}>
              <Ionicons name="search-outline" size={21} color="#3a9e6e" />
            </TouchableOpacity>
          </View>

          {/* Privacy Badge */}
          <View style={styles.privacyBanner}>
            <View style={styles.privacyIconWrap}>
              <Ionicons name="shield-checkmark" size={15} color="#3a9e6e" />
            </View>
            <Text style={styles.privacyText}>
              All posts are{" "}
              <Text style={styles.privacyBold}>completely anonymous</Text>
              {" "}— your identity is never shared
            </Text>
          </View>
        </Animated.View>

        {/* ── SCROLL CONTENT ── */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3a9e6e"
              colors={["#3a9e6e"]}
            />
          }
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── CREATE POST CARD ── */}
            <TouchableOpacity
              style={styles.createPostCard}
              onPress={() => navigation.navigate("CreatePost")}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={["#3a9e6e", "#52b788", "#74c69d"]}
                style={styles.createPostGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />
                <View style={styles.createPostContent}>
                  <View style={styles.createPostIconWrap}>
                    <Ionicons name="create-outline" size={25} color="#ffffff" />
                  </View>
                  <View style={styles.createPostTextWrap}>
                    <Text style={styles.createPostTitle}>Share Your Story</Text>
                    <Text style={styles.createPostSubtitle}>
                      Your words might be someone's hope today
                    </Text>
                  </View>
                  <View style={styles.createPostArrow}>
                    <Ionicons name="arrow-forward" size={17} color="rgba(255,255,255,0.9)" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* ── BROWSE TOPICS ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Browse Topics</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesScroll}
              >
                {categories.map((category, index) => {
                  const isActive = selectedCategory === category.value
                  return (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedCategory(category.value)}
                      activeOpacity={0.75}
                      style={styles.categoryPill}
                    >
                      <View
                        style={[
                          styles.categoryChip,
                          isActive
                            ? { backgroundColor: category.color, borderColor: category.color }
                            : { backgroundColor: "#ffffff", borderColor: "#b7e4c7" },
                        ]}
                      >
                        <View
                          style={[
                            styles.categoryIconWrap,
                            {
                              backgroundColor: isActive
                                ? "rgba(255,255,255,0.22)"
                                : category.bgColor,
                            },
                          ]}
                        >
                          <Ionicons
                            name={category.icon}
                            size={17}
                            color={isActive ? "#ffffff" : category.color}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryChipText,
                            { color: isActive ? "#ffffff" : "#2d6a4f" },
                          ]}
                        >
                          {category.title}
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

            {/* ── SORT TABS ── */}
            <View style={styles.sortSection}>
              <View style={styles.sortBar}>
                {[
                  { key: "recent",       icon: "time-outline",        label: "Recent"  },
                  { key: "popular",      icon: "flame-outline",       label: "Popular" },
                  { key: "mostCommented",icon: "chatbubbles-outline",  label: "Active"  },
                ].map((tab) => {
                  const isActive = sortBy === tab.key
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.sortTab, isActive && styles.sortTabActive]}
                      onPress={() => setSortBy(tab.key)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={tab.icon}
                        size={14}
                        color={isActive ? "#ffffff" : "#3a9e6e"}
                      />
                      <Text style={[styles.sortTabText, isActive && styles.sortTabTextActive]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* ── POSTS FEED ── */}
            <View style={styles.postsSection}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingRing}>
                    <Ionicons name="leaf-outline" size={34} color="#52b788" />
                  </View>
                  <Text style={styles.loadingText}>Fetching posts...</Text>
                  <Text style={styles.loadingSubText}>Taking a moment to load</Text>
                </View>
              ) : posts.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="chatbubbles-outline" size={48} color="#95d5b2" />
                  </View>
                  <Text style={styles.emptyTitle}>Nothing here yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Be the first to open up. Your story matters here.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => navigation.navigate("CreatePost")}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={["#3a9e6e", "#52b788"]}
                      style={styles.emptyButtonInner}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons name="add" size={17} color="#ffffff" />
                      <Text style={styles.emptyButtonText}>Start the Conversation</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                posts.map((post) => (
                  <TouchableOpacity
                    key={post._id}
                    style={styles.postCardWrapper}
                    onPress={() => navigation.navigate("PostDetails", { postId: post._id })}
                    activeOpacity={0.92}
                  >
                    <View style={styles.postCard}>
                      {/* Left accent stripe */}
                      <View
                        style={[
                          styles.postAccentStripe,
                          { backgroundColor: getCategoryColor(post.category) },
                        ]}
                      />

                      {/* Post Header */}
                      <View style={styles.postHeader}>
                        <View
                          style={[
                            styles.postAvatar,
                            { backgroundColor: getCategoryBgColor(post.category) },
                          ]}
                        >
                          <Ionicons
                            name="person"
                            size={17}
                            color={getCategoryColor(post.category)}
                          />
                        </View>

                        <View style={styles.postMeta}>
                          <Text style={styles.postAuthor}>Anonymous</Text>
                          <View style={styles.postMetaRow}>
                            <Ionicons name="time-outline" size={11} color="#95d5b2" />
                            <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
                            {post.category && post.category !== "general" && (
                              <>
                                <Text style={styles.postMetaDot}>·</Text>
                                <View
                                  style={[
                                    styles.postCategoryBadge,
                                    { backgroundColor: getCategoryBgColor(post.category) },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.postCategoryText,
                                      { color: getCategoryColor(post.category) },
                                    ]}
                                  >
                                    {post.category}
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.postMenuBtn}
                          onPress={(e) => {
                            e.stopPropagation()
                            handleReportPost(post._id)
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={17} color="#b7e4c7" />
                        </TouchableOpacity>
                      </View>

                      {/* Title */}
                      {post.title ? (
                        <Text style={styles.postTitle}>{post.title}</Text>
                      ) : null}

                      {/* Body */}
                      <Text style={styles.postContent} numberOfLines={4}>
                        {post.content}
                      </Text>

                      {/* Divider */}
                      <View style={styles.postDivider} />

                      {/* Actions */}
                      <View style={styles.postActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={(e) => {
                            e.stopPropagation()
                            handleLikePost(post._id)
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={post.isLiked ? "heart" : "heart-outline"}
                            size={18}
                            color={post.isLiked ? "#e05c6a" : "#52b788"}
                          />
                          <Text
                            style={[
                              styles.actionText,
                              post.isLiked && styles.actionTextLiked,
                            ]}
                          >
                            {post.likesCount || 0}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                          <Ionicons name="chatbubble-outline" size={17} color="#52b788" />
                          <Text style={styles.actionText}>{post.commentsCount || 0}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                          <Ionicons name="share-social-outline" size={17} color="#52b788" />
                          <Text style={styles.actionText}>Share</Text>
                        </TouchableOpacity>

                        <View style={styles.readMoreWrap}>
                          <Text style={styles.readMoreText}>Read more</Text>
                          <Ionicons name="chevron-forward" size={12} color="#52b788" />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={{ height: 120 }} />
          </Animated.View>
        </ScrollView>
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
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: "#f7fdf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d0ead9",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
    marginHorizontal: 13,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1b4332",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: "#52796f",
    marginTop: 2,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  privacyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e6f7ef",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#b7e4c7",
  },
  privacyIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#d8f3dc",
    justifyContent: "center",
    alignItems: "center",
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: "#2d6a4f",
    lineHeight: 17,
  },
  privacyBold: {
    fontWeight: "700",
  },

  // ── SCROLL ──────────────────────────────────────────────
  content: {
    flex: 1,
  },

  // ── CREATE POST ─────────────────────────────────────────
  createPostCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  createPostGradient: {
    padding: 18,
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.07)",
    top: -25,
    right: -15,
  },
  decorCircle2: {
    position: "absolute",
    width: 75,
    height: 75,
    borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -18,
    left: 35,
  },
  createPostContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  createPostIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  createPostTextWrap: {
    flex: 1,
  },
  createPostTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 3,
  },
  createPostSubtitle: {
    fontSize: 12.5,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 17,
  },
  createPostArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  // ── CATEGORIES ──────────────────────────────────────────
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1b4332",
    marginHorizontal: 16,
    marginBottom: 10,
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  categoryPill: {
    marginRight: 9,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 50,
    borderWidth: 1.5,
    gap: 6,
  },
  categoryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: "600",
  },

  // ── SORT TABS ───────────────────────────────────────────
  sortSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sortBar: {
    flexDirection: "row",
    backgroundColor: "#d8f3dc",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  sortTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  sortTabActive: {
    backgroundColor: "#3a9e6e",
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  sortTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3a9e6e",
  },
  sortTabTextActive: {
    color: "#ffffff",
  },

  // ── POSTS ────────────────────────────────────────────────
  postsSection: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2d6a4f",
  },
  loadingSubText: {
    fontSize: 12.5,
    color: "#74c69d",
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 7,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: "#52796f",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 4,
  },
  emptyButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyButtonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#ffffff",
  },

  // ── POST CARD ────────────────────────────────────────────
  postCardWrapper: {
    marginBottom: 13,
  },
  postCard: {
    backgroundColor: "#ffffff",
    borderRadius: 15,
    paddingTop: 16,
    paddingBottom: 13,
    paddingHorizontal: 16,
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#d8f3dc",
    overflow: "hidden",
  },
  postAccentStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
    paddingLeft: 6,
  },
  postAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  postMeta: {
    flex: 1,
  },
  postAuthor: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 2,
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  postTime: {
    fontSize: 11.5,
    color: "#74c69d",
    fontWeight: "500",
  },
  postMetaDot: {
    fontSize: 13,
    color: "#b7e4c7",
    lineHeight: 13,
  },
  postCategoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  postCategoryText: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  postMenuBtn: {
    padding: 4,
  },
  postTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 6,
    paddingLeft: 6,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  postContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 21,
    paddingLeft: 6,
    marginBottom: 13,
  },
  postDivider: {
    height: 1,
    backgroundColor: "#e6f7ef",
    marginBottom: 11,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    gap: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#52b788",
  },
  actionTextLiked: {
    color: "#e05c6a",
  },
  readMoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    gap: 2,
  },
  readMoreText: {
    fontSize: 11.5,
    color: "#3a9e6e",
    fontWeight: "600",
  },
})