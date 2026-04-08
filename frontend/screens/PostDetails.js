// screens/PostDetails.js
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
  Animated,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect, useRef } from "react"
import SafeAreaWrapper from "../components/SafeAreaWrapper"
import forumService from "../services/forumService"

export default function PostDetails({ route, navigation }) {
  const { postId } = route.params
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    loadPostDetails()
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start()
  }, [postId])

  const loadPostDetails = async () => {
    try {
      setLoading(true)
      const result = await forumService.getPostWithComments(postId)
      if (result.success) {
        setPost(result.post)
        setComments(result.comments || [])
      } else {
        Alert.alert("Error", result.message)
        navigation.goBack()
      }
    } catch (error) {
      console.error("Error loading post:", error)
      Alert.alert("Error", "Failed to load post")
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadPostDetails()
    setRefreshing(false)
  }

  const handleLikePost = async () => {
    try {
      const result = await forumService.toggleLikePost(postId)
      if (result.success) {
        setPost((prev) => ({
          ...prev,
          likesCount: result.data.likesCount,
          isLiked: result.data.liked,
        }))
      }
    } catch (error) {
      console.error("Error toggling like:", error)
    }
  }

  const handleLikeComment = async (commentId) => {
    try {
      const result = await forumService.toggleLikeComment(commentId)
      if (result.success) {
        setComments((prevComments) =>
          prevComments.map((comment) =>
            comment._id === commentId
              ? { ...comment, likesCount: result.data.likesCount, isLiked: result.data.liked }
              : comment
          )
        )
      }
    } catch (error) {
      console.error("Error toggling comment like:", error)
    }
  }

  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      Alert.alert("Empty Comment", "Please write something before posting")
      return
    }

    try {
      setIsSubmitting(true)
      const result = await forumService.addComment(postId, { content: newComment.trim() })
      if (result.success) {
        setComments((prev) => [...prev, result.comment])
        setNewComment("")
        setPost((prev) => ({
          ...prev,
          commentsCount: (prev.commentsCount || 0) + 1,
        }))
      } else {
        Alert.alert("Error", result.message)
      }
    } catch (error) {
      Alert.alert("Error", "Failed to post comment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReportPost = () => {
    Alert.alert("Report Post", "Why are you reporting this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Inappropriate Content",
        onPress: () => submitPostReport("Inappropriate Content"),
      },
      {
        text: "Spam",
        onPress: () => submitPostReport("Spam"),
      },
      {
        text: "Harassment",
        onPress: () => submitPostReport("Harassment"),
      },
    ])
  }

  const submitPostReport = async (reason) => {
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

  const handleReportComment = (commentId) => {
    Alert.alert("Report Comment", "Why are you reporting this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Inappropriate Content",
        onPress: () => submitCommentReport(commentId, "Inappropriate Content"),
      },
      {
        text: "Spam",
        onPress: () => submitCommentReport(commentId, "Spam"),
      },
      {
        text: "Harassment",
        onPress: () => submitCommentReport(commentId, "Harassment"),
      },
    ])
  }

  const submitCommentReport = async (commentId, reason) => {
    try {
      const result = await forumService.reportComment(commentId, reason)
      if (result.success) {
        Alert.alert("Reported", result.message)
      } else {
        Alert.alert("Error", result.message)
      }
    } catch (error) {
      Alert.alert("Error", "Failed to report comment")
    }
  }

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
    const colors = {
      "general":          "#3a9e6e",
      "daily-checkins":   "#d97706",
      "coping-tips":      "#db2777",
      "support":          "#3a9e6e",
      "anxiety":          "#ea580c",
      "depression":       "#4f46e5",
    }
    return colors[category] || "#3a9e6e"
  }

  const getCategoryBgColor = (category) => {
    const colors = {
      "general":          "#e6f7ef",
      "daily-checkins":   "#fef3c7",
      "coping-tips":      "#fce7f3",
      "support":          "#e6f7ef",
      "anxiety":          "#ffedd5",
      "depression":       "#e0e7ff",
    }
    return colors[category] || "#e6f7ef"
  }

  // ── LOADING ──────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaWrapper backgroundColor="#f0faf4" statusBarStyle="dark-content">
        <LinearGradient
          colors={["#f7fdf9", "#f0faf4"]}
          style={[styles.gradient, styles.loadingContainer]}
        >
          <View style={styles.loadingRing}>
            <Ionicons name="leaf-outline" size={36} color="#52b788" />
          </View>
          <Text style={styles.loadingText}>Loading post...</Text>
        </LinearGradient>
      </SafeAreaWrapper>
    )
  }

  if (!post) {
    return null
  }

  return (
    <SafeAreaWrapper backgroundColor="#f0faf4" statusBarStyle="dark-content">
      <LinearGradient colors={["#f7fdf9", "#f0faf4"]} style={styles.gradient}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#1b4332" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Details</Text>
          <TouchableOpacity style={styles.menuButton} onPress={handleReportPost}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#52796f" />
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#3a9e6e"
                colors={["#3a9e6e"]}
              />
            }
          >
            <Animated.View style={{ opacity: fadeAnim }}>

              {/* ── POST CARD ── */}
              <View style={styles.postCard}>
                {/* Accent stripe */}
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
                      size={22}
                      color={getCategoryColor(post.category)}
                    />
                  </View>
                  <View style={styles.postMeta}>
                    <Text style={styles.postAuthor}>Anonymous</Text>
                    <View style={styles.postMetaRow}>
                      <Ionicons name="time-outline" size={13} color="#74c69d" />
                      <Text style={styles.postTime}>{formatTimeAgo(post.createdAt)}</Text>
                      {post.category && post.category !== "general" && (
                        <>
                          <Text style={styles.postMetaDot}>•</Text>
                          <View
                            style={[
                              styles.categoryBadge,
                              { backgroundColor: getCategoryBgColor(post.category) },
                            ]}
                          >
                            <Text
                              style={[
                                styles.categoryBadgeText,
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
                </View>

                {/* Post Content */}
                {post.title && (
                  <Text style={styles.postTitle}>{post.title}</Text>
                )}
                <Text style={styles.postContent}>{post.content}</Text>

                {/* Post Stats */}
                <View style={styles.postStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="heart" size={17} color="#e05c6a" />
                    <Text style={styles.statText}>{post.likesCount || 0} likes</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubble" size={17} color="#3a9e6e" />
                    <Text style={styles.statText}>{post.commentsCount || 0} comments</Text>
                  </View>
                </View>

                {/* Post Actions */}
                <View style={styles.postActions}>
                  <TouchableOpacity
                    style={styles.postActionButton}
                    onPress={handleLikePost}
                  >
                    <LinearGradient
                      colors={
                        post.isLiked
                          ? ["#e05c6a", "#c94b58"]
                          : ["#f0faf4", "#e6f7ef"]
                      }
                      style={styles.actionButtonGradient}
                    >
                      <Ionicons
                        name={post.isLiked ? "heart" : "heart-outline"}
                        size={19}
                        color={post.isLiked ? "#ffffff" : "#3a9e6e"}
                      />
                      <Text
                        style={[
                          styles.actionButtonText,
                          { color: post.isLiked ? "#ffffff" : "#2d6a4f" },
                        ]}
                      >
                        {post.isLiked ? "Liked" : "Like"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.postActionButton}>
                    <LinearGradient
                      colors={["#f0faf4", "#e6f7ef"]}
                      style={styles.actionButtonGradient}
                    >
                      <Ionicons name="share-social-outline" size={19} color="#3a9e6e" />
                      <Text style={[styles.actionButtonText, { color: "#2d6a4f" }]}>
                        Share
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── COMMENTS SECTION ── */}
              <View style={styles.commentsSection}>
                <View style={styles.commentsSectionHeader}>
                  <View style={styles.commentsIconWrap}>
                    <Ionicons name="chatbubbles-outline" size={18} color="#3a9e6e" />
                  </View>
                  <Text style={styles.commentsTitle}>
                    Comments{" "}
                    <Text style={styles.commentsCountText}>({comments.length})</Text>
                  </Text>
                </View>

                {comments.length === 0 ? (
                  <View style={styles.emptyComments}>
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconContainer}>
                        <Ionicons name="chatbubbles-outline" size={52} color="#95d5b2" />
                      </View>
                      <Text style={styles.emptyText}>No comments yet</Text>
                      <Text style={styles.emptySubtext}>
                        Be the first to share your thoughts
                      </Text>
                    </View>
                  </View>
                ) : (
                  comments.map((comment) => (
                    <View key={comment._id} style={styles.commentCard}>
                      <View style={styles.commentStripe} />
                      <View style={styles.commentHeader}>
                        <View style={styles.commentAvatar}>
                          <Ionicons name="person" size={16} color="#3a9e6e" />
                        </View>
                        <View style={styles.commentMeta}>
                          <View style={styles.commentMetaRow}>
                            <Text style={styles.commentAuthor}>Anonymous</Text>
                            <View style={styles.commentTimeRow}>
                              <Ionicons name="time-outline" size={11} color="#95d5b2" />
                              <Text style={styles.commentTime}>
                                {formatTimeAgo(comment.createdAt)}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.commentContent}>{comment.content}</Text>
                          <View style={styles.commentActions}>
                            <TouchableOpacity
                              style={styles.commentActionButton}
                              onPress={() => handleLikeComment(comment._id)}
                            >
                              <Ionicons
                                name={comment.isLiked ? "heart" : "heart-outline"}
                                size={15}
                                color={comment.isLiked ? "#e05c6a" : "#74c69d"}
                              />
                              <Text
                                style={[
                                  styles.commentActionText,
                                  comment.isLiked && styles.commentActionTextActive,
                                ]}
                              >
                                {comment.likesCount || 0}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.commentActionButton}
                              onPress={() => handleReportComment(comment._id)}
                            >
                              <Ionicons name="flag-outline" size={15} color="#74c69d" />
                              <Text style={styles.commentActionText}>Report</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <View style={{ height: 120 }} />
            </Animated.View>
          </ScrollView>

          {/* ── COMMENT INPUT ── exact same structure as original ── */}
          <View style={styles.commentInputContainer}>
            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#74c69d" />
              <Text style={styles.privacyRowText}>Replying anonymously</Text>
            </View>
            <View style={styles.commentInputWrapper}>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Share your thoughts..."
                  placeholderTextColor="#95d5b2"
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={2000}
                />
              </View>
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSubmitComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                <LinearGradient
                  colors={
                    newComment.trim() && !isSubmitting
                      ? ["#3a9e6e", "#52b788"]
                      : ["#d0ead9", "#d0ead9"]
                  }
                  style={styles.sendButtonGradient}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={newComment.trim() && !isSubmitting ? "#ffffff" : "#95d5b2"}
                  />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaWrapper>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },

  // ── LOADING ──────────────────────────────────────────────
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#2d6a4f",
    fontWeight: "600",
  },

  // ── HEADER ──────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#f7fdf9",
    borderBottomWidth: 1,
    borderBottomColor: "#d0ead9",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1b4332",
    flex: 1,
    textAlign: "center",
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── SCROLL ──────────────────────────────────────────────
  content: {
    flex: 1,
  },

  // ── POST CARD ───────────────────────────────────────────
  postCard: {
    margin: 16,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#3a9e6e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
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
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    paddingLeft: 6,
  },
  postAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },
  postMeta: {
    flex: 1,
  },
  postAuthor: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 4,
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postTime: {
    fontSize: 12.5,
    color: "#74c69d",
    fontWeight: "500",
  },
  postMetaDot: {
    fontSize: 13,
    color: "#b7e4c7",
  },
  categoryBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
  },
  categoryBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  postTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 12,
    paddingLeft: 6,
    lineHeight: 29,
    letterSpacing: -0.4,
  },
  postContent: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 25,
    marginBottom: 18,
    paddingLeft: 6,
  },
  postStats: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e6f7ef",
    marginBottom: 14,
    paddingLeft: 6,
  },
  statDivider: {
    width: 1,
    height: 14,
    backgroundColor: "#c8e6c9",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statText: {
    fontSize: 14,
    color: "#52796f",
    fontWeight: "600",
  },
  postActions: {
    flexDirection: "row",
    gap: 10,
    paddingLeft: 6,
  },
  postActionButton: {
    flex: 1,
    borderRadius: 11,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d0ead9",
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 11,
  },
  actionButtonText: {
    fontSize: 14.5,
    fontWeight: "700",
  },

  // ── COMMENTS ────────────────────────────────────────────
  commentsSection: {
    paddingHorizontal: 16,
  },
  commentsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
  },
  commentsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1b4332",
  },
  commentsCountText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#52796f",
  },

  // Empty comments
  emptyComments: {
    marginBottom: 20,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 36,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d8f3dc",
  },
  emptyIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1b4332",
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 13.5,
    color: "#52796f",
    textAlign: "center",
  },

  // Comment cards
  commentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 0,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: "#d8f3dc",
    flexDirection: "row",
    overflow: "hidden",
  },
  commentStripe: {
    width: 3,
    backgroundColor: "#b7e4c7",
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  commentHeader: {
    flexDirection: "row",
    gap: 11,
    flex: 1,
    padding: 14,
  },
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#e6f7ef",
    justifyContent: "center",
    alignItems: "center",
  },
  commentMeta: {
    flex: 1,
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1b4332",
  },
  commentTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  commentTime: {
    fontSize: 11.5,
    color: "#74c69d",
    fontWeight: "500",
  },
  commentContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 21,
    marginBottom: 10,
  },
  commentActions: {
    flexDirection: "row",
    gap: 18,
  },
  commentActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  commentActionText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#74c69d",
  },
  commentActionTextActive: {
    color: "#e05c6a",
  },

  // ── COMMENT INPUT ── same structure as original ──────────
  commentInputContainer: {
    backgroundColor: "#f7fdf9",
    borderTopWidth: 1,
    borderTopColor: "#d0ead9",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 12,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  privacyRowText: {
    fontSize: 11,
    color: "#74c69d",
    fontWeight: "500",
  },
  commentInputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 11,
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#d0ead9",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  commentInput: {
    fontSize: 14.5,
    color: "#1b4332",
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 24,
    overflow: "hidden",
  },
  sendButtonGradient: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 24,
  },
})