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
        Alert.alert("✓ Reported", result.message)
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
        Alert.alert("✓ Reported", result.message)
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
      "general": "#8b5cf6",
      "daily-checkins": "#f59e0b",
      "coping-tips": "#ec4899",
      "support": "#10b981",
      "anxiety": "#f97316",
      "depression": "#6366f1",
    }
    return colors[category] || "#8b5cf6"
  }

  const getCategoryBgColor = (category) => {
    const colors = {
      "general": "#f5f3ff",
      "daily-checkins": "#fef3c7",
      "coping-tips": "#fce7f3",
      "support": "#d1fae5",
      "anxiety": "#ffedd5",
      "depression": "#e0e7ff",
    }
    return colors[category] || "#f5f3ff"
  }

  if (loading) {
    return (
      <SafeAreaWrapper backgroundColor="#f8fafc" statusBarStyle="dark-content">
        <LinearGradient colors={["#ffffff", "#f8fafc"]} style={[styles.gradient, styles.loadingContainer]}>
          <Ionicons name="refresh-circle" size={64} color="#10b981" />
          <Text style={styles.loadingText}>Loading post...</Text>
        </LinearGradient>
      </SafeAreaWrapper>
    )
  }

  if (!post) {
    return null
  }

  return (
    <SafeAreaWrapper backgroundColor="#f8fafc" statusBarStyle="dark-content">
      <LinearGradient colors={["#ffffff", "#f8fafc"]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Details</Text>
          <TouchableOpacity style={styles.menuButton} onPress={handleReportPost}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#64748b" />
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          >
            <Animated.View style={{ opacity: fadeAnim }}>
              {/* Post Card */}
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
                            styles.categoryBadge,
                            { backgroundColor: getCategoryBgColor(post.category) }
                          ]}>
                            <Text style={[styles.categoryBadgeText, { color: getCategoryColor(post.category) }]}>
                              {post.category}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                </View>

                {/* Post Content */}
                {post.title && <Text style={styles.postTitle}>{post.title}</Text>}
                <Text style={styles.postContent}>{post.content}</Text>

                {/* Post Stats */}
                <View style={styles.postStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="heart" size={18} color="#ef4444" />
                    <Text style={styles.statText}>{post.likesCount || 0} likes</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubble" size={18} color="#10b981" />
                    <Text style={styles.statText}>{post.commentsCount || 0} comments</Text>
                  </View>
                </View>

                {/* Post Actions */}
                <View style={styles.postActions}>
                  <TouchableOpacity style={styles.postActionButton} onPress={handleLikePost}>
                    <LinearGradient
                      colors={post.isLiked ? ["#ef4444", "#dc2626"] : ["#f8fafc", "#f1f5f9"]}
                      style={styles.actionButtonGradient}
                    >
                      <Ionicons 
                        name={post.isLiked ? "heart" : "heart-outline"} 
                        size={20} 
                        color={post.isLiked ? "#ffffff" : "#64748b"} 
                      />
                      <Text style={[
                        styles.actionButtonText,
                        { color: post.isLiked ? "#ffffff" : "#64748b" }
                      ]}>
                        {post.isLiked ? "Liked" : "Like"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.postActionButton}>
                    <LinearGradient colors={["#f8fafc", "#f1f5f9"]} style={styles.actionButtonGradient}>
                      <Ionicons name="share-social-outline" size={20} color="#64748b" />
                      <Text style={styles.actionButtonText}>Share</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Comments Section */}
              <View style={styles.commentsSection}>
                <View style={styles.commentsSectionHeader}>
                  <Ionicons name="chatbubbles" size={22} color="#10b981" />
                  <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
                </View>

                {comments.length === 0 ? (
                  <View style={styles.emptyComments}>
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconContainer}>
                        <Ionicons name="chatbubbles-outline" size={56} color="#cbd5e1" />
                      </View>
                      <Text style={styles.emptyText}>No comments yet</Text>
                      <Text style={styles.emptySubtext}>Be the first to share your thoughts</Text>
                    </View>
                  </View>
                ) : (
                  comments.map((comment, index) => (
                    <View key={comment._id} style={styles.commentCard}>
                      <View style={styles.commentHeader}>
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>A</Text>
                        </View>
                        <View style={styles.commentMeta}>
                          <View style={styles.commentMetaRow}>
                            <Text style={styles.commentAuthor}>Anonymous</Text>
                            <Text style={styles.commentTime}>{formatTimeAgo(comment.createdAt)}</Text>
                          </View>
                          <Text style={styles.commentContent}>{comment.content}</Text>
                          <View style={styles.commentActions}>
                            <TouchableOpacity
                              style={styles.commentActionButton}
                              onPress={() => handleLikeComment(comment._id)}
                            >
                              <Ionicons
                                name={comment.isLiked ? "heart" : "heart-outline"}
                                size={16}
                                color={comment.isLiked ? "#ef4444" : "#94a3b8"}
                              />
                              <Text
                                style={[
                                  styles.commentActionText,
                                  comment.isLiked && styles.commentActionTextActive
                                ]}
                              >
                                {comment.likesCount || 0}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.commentActionButton}
                              onPress={() => handleReportComment(comment._id)}
                            >
                              <Ionicons name="flag-outline" size={16} color="#94a3b8" />
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

          {/* Comment Input */}
          <View style={styles.commentInputContainer}>
            <View style={styles.commentInputWrapper}>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Share your thoughts..."
                  placeholderTextColor="#94a3b8"
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
                  colors={newComment.trim() && !isSubmitting ? ["#10b981", "#059669"] : ["#e2e8f0", "#cbd5e1"]}
                  style={styles.sendButtonGradient}
                >
                  <Ionicons 
                    name="send" 
                    size={20} 
                    color={newComment.trim() && !isSubmitting ? "#ffffff" : "#94a3b8"} 
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  loadingText: {
    fontSize: 17,
    color: "#64748b",
    fontWeight: "700",
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
  backButton: {
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
    flex: 1,
    textAlign: "center",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  postCard: {
    margin: 20,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  postAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  postAvatarText: {
    fontSize: 22,
    fontWeight: "800",
  },
  postMeta: {
    flex: 1,
  },
  postAuthor: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postTime: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  postMetaDot: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  postTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  postContent: {
    fontSize: 16,
    color: "#475569",
    lineHeight: 26,
    marginBottom: 20,
  },
  postStats: {
    flexDirection: "row",
    gap: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
    marginBottom: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statText: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "700",
  },
  postActions: {
    flexDirection: "row",
    gap: 12,
  },
  postActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  actionButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748b",
  },
  commentsSection: {
    paddingHorizontal: 20,
  },
  commentsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  commentsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  emptyComments: {
    marginBottom: 20,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#64748b",
  },
  commentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  commentHeader: {
    flexDirection: "row",
    gap: 12,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#d1fae5",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#10b981",
  },
  commentMeta: {
    flex: 1,
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  commentTime: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },
  commentContent: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
    marginBottom: 12,
  },
  commentActions: {
    flexDirection: "row",
    gap: 20,
  },
  commentActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },
  commentActionTextActive: {
    color: "#ef4444",
  },
  commentInputContainer: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  commentInputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  inputBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  commentInput: {
    fontSize: 15,
    color: "#0f172a",
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