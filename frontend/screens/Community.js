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
  const slideAnim = useRef(new Animated.Value(50)).current

  useEffect(() => {
    loadPosts()
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
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
            post._id === postId ? { ...post, likesCount: result.data.likesCount, isLiked: result.data.liked } : post
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
        {
          text: "Inappropriate Content",
          onPress: () => submitReport(postId, "Inappropriate Content"),
        },
        {
          text: "Spam",
          onPress: () => submitReport(postId, "Spam"),
        },
        {
          text: "Harassment",
          onPress: () => submitReport(postId, "Harassment"),
        },
      ],
      { cancelable: true }
    )
  }

  const submitReport = async (postId, reason) => {
    try {
      const result = await forumService.reportPost(postId, reason)
      if (result.success) {
        Alert.alert("✓ Reported", result.message)
      } else {
        Alert.alert("Error", result.message)
      }
    } catch (error) {
      Alert.alert("Error", "Failed to report post")
    }
  }

  const categories = [
    {
      icon: "apps",
      title: "All",
      value: "all",
      color: "#8b5cf6",
      bgColor: "#f5f3ff",
    },
    {
      icon: "sunny",
      title: "Daily Check-ins",
      value: "daily-checkins",
      color: "#f59e0b",
      bgColor: "#fef3c7",
    },
    {
      icon: "heart",
      title: "Coping Tips",
      value: "coping-tips",
      color: "#ec4899",
      bgColor: "#fce7f3",
    },
    {
      icon: "people",
      title: "Support",
      value: "support",
      color: "#10b981",
      bgColor: "#d1fae5",
    },
    {
      icon: "warning",
      title: "Anxiety",
      value: "anxiety",
      color: "#f97316",
      bgColor: "#ffedd5",
    },
    {
      icon: "rainy",
      title: "Depression",
      value: "depression",
      color: "#6366f1",
      bgColor: "#e0e7ff",
    },
  ]

  const formatTimeAgo = (date) => {
    const now = new Date()
    const postDate = new Date(date)
    const diffInMs = now - postDate
    const diffInMins = Math.floor(diffInMs / 60000)
    const diffInHours = Math.floor(diffInMs / 3600000)
    const diffInDays = Math.floor(diffInMs / 86400000)

    if (diffInMins < 1) return "Just now"
    if (diffInMins < 60) return `${diffInMins}m`
    if (diffInHours < 24) return `${diffInHours}h`
    if (diffInDays < 7) return `${diffInDays}d`
    return postDate.toLocaleDateString()
  }

  const getCategoryColor = (category) => {
    const found = categories.find((c) => c.value === category)
    return found ? found.color : "#8b5cf6"
  }

  const getCategoryBgColor = (category) => {
    const found = categories.find((c) => c.value === category)
    return found ? found.bgColor : "#f5f3ff"
  }

  return (
    <SafeAreaWrapper backgroundColor="#f8fafc" statusBarStyle="dark-content">
      <LinearGradient colors={["#ffffff", "#f8fafc", "#f1f5f9"]} style={styles.gradient}>
        {/* Animated Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#1e293b" />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Community</Text>
              <Text style={styles.headerSubtitle}>Share, support, connect</Text>
            </View>
            <TouchableOpacity style={styles.searchButton}>
              <Ionicons name="search" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Privacy Shield Banner */}
          <View style={styles.privacyBanner}>
            <View style={styles.privacyContent}>
              <View style={styles.privacyIconContainer}>
                <Ionicons name="shield-checkmark" size={20} color="#10b981" />
              </View>
              <Text style={styles.privacyText}>Your identity is protected • All posts are anonymous</Text>
            </View>
          </View>
        </Animated.View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {/* Create Post Card - Enhanced */}
            <TouchableOpacity
              style={styles.createPostCard}
              onPress={() => navigation.navigate("CreatePost")}
              activeOpacity={0.9}
            >
              <LinearGradient 
                colors={["#10b981", "#059669"]} 
                style={styles.createPostGradient} 
                start={{ x: 0, y: 0 }} 
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.createPostContent}>
                  <View style={styles.createPostIcon}>
                    <Ionicons name="add-circle-outline" size={32} color="#ffffff" />
                  </View>
                  <View style={styles.createPostText}>
                    <Text style={styles.createPostTitle}>Share Your Story</Text>
                    <Text style={styles.createPostSubtitle}>Your voice matters. Post anonymously.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.8)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Categories Carousel */}
            <View style={styles.categoriesSection}>
              <Text style={styles.sectionLabel}>Browse Topics</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                {categories.map((category, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.categoryCardWrapper}
                    onPress={() => setSelectedCategory(category.value)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.categoryCard,
                        { backgroundColor: selectedCategory === category.value ? category.color : "#ffffff" },
                        selectedCategory === category.value && styles.categoryCardActive,
                      ]}
                    >
                      <View style={[
                        styles.categoryIconContainer,
                        { backgroundColor: selectedCategory === category.value ? "rgba(255,255,255,0.25)" : category.bgColor }
                      ]}>
                        <Ionicons
                          name={category.icon}
                          size={24}
                          color={selectedCategory === category.value ? "#ffffff" : category.color}
                        />
                      </View>
                      <Text
                        style={[
                          styles.categoryTitle,
                          { color: selectedCategory === category.value ? "#ffffff" : "#1e293b" }
                        ]}
                      >
                        {category.title}
                      </Text>
                      {selectedCategory === category.value && (
                        <View style={styles.categoryCheckmark}>
                          <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Sort Tabs - Clean Design */}
            <View style={styles.sortSection}>
              <View style={styles.sortContainer}>
                <TouchableOpacity
                  style={[styles.sortTab, sortBy === "recent" && styles.sortTabActive]}
                  onPress={() => setSortBy("recent")}
                >
                  <View style={styles.sortTabContent}>
                    <Ionicons 
                      name="time" 
                      size={18} 
                      color={sortBy === "recent" ? "#ffffff" : "#64748b"} 
                    />
                    <Text style={[
                      styles.sortTabText,
                      sortBy === "recent" && styles.sortTabTextActive
                    ]}>
                      Recent
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortTab, sortBy === "popular" && styles.sortTabActive]}
                  onPress={() => setSortBy("popular")}
                >
                  <View style={styles.sortTabContent}>
                    <Ionicons 
                      name="flame" 
                      size={18} 
                      color={sortBy === "popular" ? "#ffffff" : "#64748b"} 
                    />
                    <Text style={[
                      styles.sortTabText,
                      sortBy === "popular" && styles.sortTabTextActive
                    ]}>
                      Popular
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortTab, sortBy === "mostCommented" && styles.sortTabActive]}
                  onPress={() => setSortBy("mostCommented")}
                >
                  <View style={styles.sortTabContent}>
                    <Ionicons 
                      name="chatbubbles" 
                      size={18} 
                      color={sortBy === "mostCommented" ? "#ffffff" : "#64748b"} 
                    />
                    <Text style={[
                      styles.sortTabText,
                      sortBy === "mostCommented" && styles.sortTabTextActive
                    ]}>
                      Active
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Posts Feed */}
            <View style={styles.postsSection}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingSpinner}>
                    <Ionicons name="refresh-circle" size={48} color="#10b981" />
                  </View>
                  <Text style={styles.loadingText}>Loading posts...</Text>
                </View>
              ) : posts.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Ionicons name="chatbubbles-outline" size={64} color="#cbd5e1" />
                    </View>
                    <Text style={styles.emptyTitle}>No posts yet</Text>
                    <Text style={styles.emptySubtitle}>Be the first to share your thoughts and start a conversation</Text>
                    <TouchableOpacity
                      style={styles.emptyButton}
                      onPress={() => navigation.navigate("CreatePost")}
                    >
                      <LinearGradient colors={["#10b981", "#059669"]} style={styles.emptyButtonGradient}>
                        <Ionicons name="add" size={20} color="#ffffff" />
                        <Text style={styles.emptyButtonText}>Create First Post</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                posts.map((post, index) => (
                  <TouchableOpacity
                    key={post._id}
                    style={styles.postCardWrapper}
                    onPress={() => navigation.navigate("PostDetails", { postId: post._id })}
                    activeOpacity={0.95}
                  >
                    <View style={styles.postCard}>
                      {/* Post Header */}
                      <View style={styles.postHeader}>
                        <View
                          style={[
                            styles.postAvatar,
                            { backgroundColor: getCategoryBgColor(post.category) }
                          ]}
                        >
                          <Text style={[styles.postAvatarText, { color: getCategoryColor(post.category) }]}>A</Text>
                        </View>
                        <View style={styles.postMeta}>
                          <Text style={styles.postAuthor}>Anonymous User</Text>
                          <View style={styles.postMetaRow}>
                            <Ionicons name="time-outline" size={14} color="#94a3b8" />
                            <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
                            {post.category && post.category !== "general" && (
                              <>
                                <Text style={styles.postMetaDot}>•</Text>
                                <View style={[
                                  styles.postCategoryBadge,
                                  { backgroundColor: getCategoryBgColor(post.category) }
                                ]}>
                                  <Text style={[styles.postCategoryText, { color: getCategoryColor(post.category) }]}>
                                    {post.category}
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.postMenuButton}
                          onPress={(e) => {
                            e.stopPropagation()
                            handleReportPost(post._id)
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>

                      {/* Post Content */}
                      {post.title && <Text style={styles.postTitle}>{post.title}</Text>}
                      <Text style={styles.postContent} numberOfLines={4}>
                        {post.content}
                      </Text>

                      {/* Post Actions */}
                      <View style={styles.postActions}>
                        <TouchableOpacity
                          style={styles.postActionButton}
                          onPress={(e) => {
                            e.stopPropagation()
                            handleLikePost(post._id)
                          }}
                        >
                          <View style={[
                            styles.actionIconContainer,
                            post.isLiked && styles.actionIconContainerLiked
                          ]}>
                            <Ionicons 
                              name={post.isLiked ? "heart" : "heart-outline"} 
                              size={18} 
                              color={post.isLiked ? "#ef4444" : "#64748b"} 
                            />
                          </View>
                          <Text style={[
                            styles.postActionText,
                            post.isLiked && styles.postActionTextLiked
                          ]}>
                            {post.likesCount || 0}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.postActionButton}>
                          <View style={styles.actionIconContainer}>
                            <Ionicons name="chatbubble-outline" size={18} color="#64748b" />
                          </View>
                          <Text style={styles.postActionText}>{post.commentsCount || 0}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.postActionButton}>
                          <View style={styles.actionIconContainer}>
                            <Ionicons name="share-social-outline" size={18} color="#64748b" />
                          </View>
                          <Text style={styles.postActionText}>Share</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={{ height: 120 }} />
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  privacyBanner: {
    backgroundColor: "#ecfdf5",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  privacyContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  privacyIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#d1fae5",
    justifyContent: "center",
    alignItems: "center",
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  content: {
    flex: 1,
  },
  createPostCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  createPostGradient: {
    padding: 20,
  },
  createPostContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  createPostIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  createPostText: {
    flex: 1,
  },
  createPostTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  createPostSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  categoriesSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    marginHorizontal: 20,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  categoriesScroll: {
    paddingLeft: 20,
  },
  categoryCardWrapper: {
    marginRight: 12,
  },
  categoryCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryCardActive: {
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  categoryCheckmark: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  sortSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sortContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  sortTab: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  sortTabActive: {
    backgroundColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sortTabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  sortTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  sortTabTextActive: {
    color: "#ffffff",
  },
  postsSection: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyState: {
    paddingVertical: 40,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  postCardWrapper: {
    marginBottom: 16,
  },
  postCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  postAvatarText: {
    fontSize: 18,
    fontWeight: "800",
  },
  postMeta: {
    flex: 1,
  },
  postAuthor: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postTime: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  postMetaDot: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  postCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  postCategoryText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  postMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  postTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  postContent: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 24,
    marginBottom: 16,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  postActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  actionIconContainerLiked: {
    backgroundColor: "#fee2e2",
  },
  postActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  postActionTextLiked: {
    color: "#ef4444",
  },
})