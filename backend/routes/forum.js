// routes/forum.js
const express = require('express');
const router = express.Router();
const { 
    createPost, 
    getAllPosts,
    getPostWithComments,
    addComment,
    toggleLikePost,
    toggleLikeComment,
    reportPost,
    reportComment,
    deletePost,
    deleteComment,
    getPostsByCategory
} = require('../controllers/forumController');
const { protect } = require('../middleware/authMiddleware');

// --- Middleware for optional authentication ---
// This middleware tries to authenticate the user, but doesn't fail if no token
const optionalAuth = async (req, res, next) => {
    try {
        const authMiddleware = require('../middleware/authMiddleware');
        // Try to run protect middleware
        await authMiddleware.protect(req, res, () => {
            // If successful, user is authenticated
            next();
        });
    } catch (error) {
        // If authentication fails, continue anyway (user not authenticated)
        req.user = null;
        next();
    }
};

// --- ROUTES WITH OPTIONAL AUTH (show like state if logged in) ---
// Anyone can view all posts, but logged-in users see their like state
router.get('/posts', optionalAuth, getAllPosts);

// Anyone can view a single post with its comments
router.get('/posts/:postId', optionalAuth, getPostWithComments);

// Get posts by category
router.get('/posts/category/:category', optionalAuth, getPostsByCategory);

// --- PRIVATE ROUTES (require authentication) ---
// Create a new post
router.post('/posts', protect, createPost);

// Delete own post
router.delete('/posts/:postId', protect, deletePost);

// Add a comment to a post
router.post('/posts/:postId/comments', protect, addComment);

// Delete own comment
router.delete('/comments/:commentId', protect, deleteComment);

// Like/unlike a post
router.post('/posts/:postId/like', protect, toggleLikePost);

// Like/unlike a comment
router.post('/comments/:commentId/like', protect, toggleLikeComment);

// Report a post
router.post('/posts/:postId/report', protect, reportPost);

// Report a comment
router.post('/comments/:commentId/report', protect, reportComment);

module.exports = router;