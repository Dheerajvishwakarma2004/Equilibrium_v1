// services/forumService.js
import api from "../config/api"

class ForumService {
  // Create a new post
  async createPost(postData) {
    try {
      const response = await api.post("/forum/posts", {
        title: postData.title,
        content: postData.content,
        category: postData.category || "general",
        isAnonymous: true, // Always anonymous for privacy
      })
      return { 
        success: true, 
        post: response.data.data,
        message: response.data.message 
      }
    } catch (error) {
      console.error("Create post error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to create post",
      }
    }
  }

  // Get all posts with pagination and filtering
  async getAllPosts(page = 1, limit = 20, category = 'all', sortBy = 'recent') {
    try {
      const response = await api.get(`/forum/posts`, {
        params: { page, limit, category, sortBy }
      })
      return { 
        success: true, 
        posts: response.data.posts || [],
        total: response.data.total || 0,
        totalPages: response.data.totalPages || 1,
        currentPage: response.data.currentPage || 1
      }
    } catch (error) {
      console.error("Get posts error:", error)
      return {
        success: false,
        posts: [],
        message: error.response?.data?.message || "Failed to fetch posts",
      }
    }
  }

  // Get single post with comments
  async getPostWithComments(postId) {
    try {
      const response = await api.get(`/forum/posts/${postId}`)
      return { 
        success: true, 
        post: response.data.data.post,
        comments: response.data.data.comments || []
      }
    } catch (error) {
      console.error("Get post error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to fetch post",
      }
    }
  }

  // Add comment to post
  async addComment(postId, commentData) {
    try {
      const response = await api.post(`/forum/posts/${postId}/comments`, {
        content: commentData.content,
        isAnonymous: true, // Always anonymous for privacy
      })
      return { 
        success: true, 
        comment: response.data.data,
        message: response.data.message 
      }
    } catch (error) {
      console.error("Add comment error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to add comment",
      }
    }
  }

  // Like/unlike a post
  async toggleLikePost(postId) {
    try {
      const response = await api.post(`/forum/posts/${postId}/like`)
      return { 
        success: true, 
        data: response.data.data,
        message: response.data.message 
      }
    } catch (error) {
      console.error("Toggle post like error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to toggle like",
      }
    }
  }

  // Like/unlike a comment
  async toggleLikeComment(commentId) {
    try {
      const response = await api.post(`/forum/comments/${commentId}/like`)
      return { 
        success: true, 
        data: response.data.data,
        message: response.data.message 
      }
    } catch (error) {
      console.error("Toggle comment like error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to toggle like",
      }
    }
  }

  // Report a post
  async reportPost(postId, reason) {
    try {
      const response = await api.post(`/forum/posts/${postId}/report`, {
        reason: reason,
      })
      return { 
        success: true, 
        message: response.data.message 
      }
    } catch (error) {
      console.error("Report post error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to report post",
      }
    }
  }

  // Report a comment
  async reportComment(commentId, reason) {
    try {
      const response = await api.post(`/forum/comments/${commentId}/report`, {
        reason: reason,
      })
      return { 
        success: true, 
        message: response.data.message 
      }
    } catch (error) {
      console.error("Report comment error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to report comment",
      }
    }
  }

  // Delete own post
  async deletePost(postId) {
    try {
      const response = await api.delete(`/forum/posts/${postId}`)
      return { 
        success: true, 
        message: response.data.message 
      }
    } catch (error) {
      console.error("Delete post error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to delete post",
      }
    }
  }

  // Delete own comment
  async deleteComment(commentId) {
    try {
      const response = await api.delete(`/forum/comments/${commentId}`)
      return { 
        success: true, 
        message: response.data.message 
      }
    } catch (error) {
      console.error("Delete comment error:", error)
      return {
        success: false,
        message: error.response?.data?.message || "Failed to delete comment",
      }
    }
  }

  // Get posts by category
  async getPostsByCategory(category, page = 1, limit = 20) {
    try {
      const response = await api.get(`/forum/posts/category/${category}`, {
        params: { page, limit }
      })
      return { 
        success: true, 
        posts: response.data.posts || [],
        total: response.data.total || 0,
        totalPages: response.data.totalPages || 1,
        currentPage: response.data.currentPage || 1
      }
    } catch (error) {
      console.error("Get posts by category error:", error)
      return {
        success: false,
        posts: [],
        message: error.response?.data?.message || "Failed to fetch posts",
      }
    }
  }
}

export default new ForumService()