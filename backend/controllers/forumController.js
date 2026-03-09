// controllers/forumController.js
const ForumPost = require('../models/ForumPost');
const ForumComment = require('../models/ForumComment');

// @desc    Create a new forum post
// @route   POST /api/v1/forum/posts
// @access  Private
exports.createPost = async (req, res) => {
    try {
        const { title, content, category } = req.body;
        
        // Validation
        if (!title || !content) {
            return res.status(400).json({ 
                success: false, 
                message: 'Title and content are required' 
            });
        }

        // Use the pseudonymId from the authenticated user
        const pseudonymId = req.user.pseudonymId;

        const post = await ForumPost.create({
            title,
            content,
            category: category || 'general',
            pseudonymId,
            isAnonymous: true, // Always anonymous for privacy
        });

        res.status(201).json({ 
            success: true, 
            data: post,
            message: 'Post created successfully' 
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(400).json({ 
            success: false, 
            message: error.message || 'Failed to create post' 
        });
    }
};

// @desc    Get all forum posts with pagination and filtering
// @route   GET /api/v1/forum/posts
// @access  Public (but we check if user is authenticated to show like state)
exports.getAllPosts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, sortBy = 'recent' } = req.query;
        
        // Get user's pseudonymId if authenticated (for like state)
        const userPseudonymId = req.user ? req.user.pseudonymId : null;
        
        // Build query
        const query = { isHidden: false }; // Don't show hidden posts
        if (category && category !== 'all') {
            query.category = category;
        }

        // Build sort
        let sort = {};
        switch (sortBy) {
            case 'popular':
                sort = { likesCount: -1, createdAt: -1 };
                break;
            case 'mostCommented':
                sort = { commentsCount: -1, createdAt: -1 };
                break;
            case 'recent':
            default:
                sort = { createdAt: -1 };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute query with pagination
        const posts = await ForumPost.find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip(skip)
            .select('-reports'); // Don't send reports data to frontend

        // Add isLiked field based on current user
        const postsWithLikeState = posts.map(post => {
            const postObj = post.toObject();
            postObj.isLiked = userPseudonymId ? post.likes.includes(userPseudonymId) : false;
            return postObj;
        });

        // Get total count for pagination
        const total = await ForumPost.countDocuments(query);

        res.status(200).json({ 
            success: true, 
            count: postsWithLikeState.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            posts: postsWithLikeState // Changed from 'data' to 'posts' to match frontend
        });
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch posts' 
        });
    }
};

// @desc    Get a single post with all its comments
// @route   GET /api/v1/forum/posts/:postId
// @access  Public (but we check if user is authenticated to show like state)
exports.getPostWithComments = async (req, res) => {
    try {
        const { postId } = req.params;
        
        // Get user's pseudonymId if authenticated
        const userPseudonymId = req.user ? req.user.pseudonymId : null;

        // Validate postId
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid post ID' 
            });
        }

        // Fetch the post and its comments
        const post = await ForumPost.findById(postId).select('-reports');
        
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        if (post.isHidden) {
            return res.status(403).json({ 
                success: false, 
                message: 'This post is no longer available' 
            });
        }

        const comments = await ForumComment.find({ 
            postId,
            isHidden: false 
        }).sort({ createdAt: 1 });

        // Add isLiked state to post
        const postWithLikeState = post.toObject();
        postWithLikeState.isLiked = userPseudonymId ? post.likes.includes(userPseudonymId) : false;

        // Add isLiked state to comments
        const commentsWithLikeState = comments.map(comment => {
            const commentObj = comment.toObject();
            commentObj.isLiked = userPseudonymId ? comment.likes.includes(userPseudonymId) : false;
            return commentObj;
        });

        res.status(200).json({ 
            success: true, 
            data: { 
                post: postWithLikeState, 
                comments: commentsWithLikeState 
            } 
        });
    } catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch post' 
        });
    }
};

// @desc    Add a comment to a post
// @route   POST /api/v1/forum/posts/:postId/comments
// @access  Private
exports.addComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const { content } = req.body;
        const pseudonymId = req.user.pseudonymId;

        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Comment content is required' 
            });
        }

        // Validate postId
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid post ID' 
            });
        }

        // Check if the post exists
        const post = await ForumPost.findById(postId);
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        if (post.isHidden) {
            return res.status(403).json({ 
                success: false, 
                message: 'Cannot comment on this post' 
            });
        }

        // Create comment
        const comment = await ForumComment.create({
            postId,
            content: content.trim(),
            pseudonymId,
            isAnonymous: true,
        });

        // Update post's comment count
        post.commentsCount = (post.commentsCount || 0) + 1;
        await post.save();

        // Add isLiked state to the newly created comment
        const commentWithLikeState = comment.toObject();
        commentWithLikeState.isLiked = false; // New comment, user hasn't liked it yet

        res.status(201).json({ 
            success: true, 
            data: commentWithLikeState,
            message: 'Comment added successfully' 
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(400).json({ 
            success: false, 
            message: error.message || 'Failed to add comment' 
        });
    }
};

// @desc    Toggle like on a post
// @route   POST /api/v1/forum/posts/:postId/like
// @access  Private
exports.toggleLikePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const pseudonymId = req.user.pseudonymId;

        // Validate postId
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid post ID' 
            });
        }

        const post = await ForumPost.findById(postId);
        
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        // Check if user already liked
        const likeIndex = post.likes.indexOf(pseudonymId);
        let liked = false;

        if (likeIndex > -1) {
            // Unlike - remove from array
            post.likes.splice(likeIndex, 1);
            post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
            liked = false;
        } else {
            // Like - add to array
            post.likes.push(pseudonymId);
            post.likesCount = (post.likesCount || 0) + 1;
            liked = true;
        }

        await post.save();

        res.status(200).json({ 
            success: true, 
            data: {
                liked,
                likesCount: post.likesCount
            },
            message: liked ? 'Post liked' : 'Post unliked'
        });
    } catch (error) {
        console.error('Toggle like error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to toggle like' 
        });
    }
};

// @desc    Toggle like on a comment
// @route   POST /api/v1/forum/comments/:commentId/like
// @access  Private
exports.toggleLikeComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const pseudonymId = req.user.pseudonymId;

        // Validate commentId
        if (!commentId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid comment ID' 
            });
        }

        const comment = await ForumComment.findById(commentId);
        
        if (!comment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Comment not found' 
            });
        }

        // Check if user already liked
        const likeIndex = comment.likes.indexOf(pseudonymId);
        let liked = false;

        if (likeIndex > -1) {
            // Unlike
            comment.likes.splice(likeIndex, 1);
            comment.likesCount = Math.max(0, (comment.likesCount || 0) - 1);
            liked = false;
        } else {
            // Like
            comment.likes.push(pseudonymId);
            comment.likesCount = (comment.likesCount || 0) + 1;
            liked = true;
        }

        await comment.save();

        res.status(200).json({ 
            success: true, 
            data: {
                liked,
                likesCount: comment.likesCount
            },
            message: liked ? 'Comment liked' : 'Comment unliked'
        });
    } catch (error) {
        console.error('Toggle comment like error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to toggle like' 
        });
    }
};

// @desc    Report a post
// @route   POST /api/v1/forum/posts/:postId/report
// @access  Private
exports.reportPost = async (req, res) => {
    try {
        const { postId } = req.params;
        const { reason } = req.body;
        const pseudonymId = req.user.pseudonymId;

        // Validation
        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Report reason is required' 
            });
        }

        // Validate postId
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid post ID' 
            });
        }

        const post = await ForumPost.findById(postId);
        
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        // Check if user already reported this post
        const alreadyReported = post.reports.some(
            report => report.pseudonymId === pseudonymId
        );

        if (alreadyReported) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already reported this post' 
            });
        }

        // Add report
        post.reports.push({
            pseudonymId,
            reason: reason.trim(),
            reportedAt: new Date()
        });
        post.reportCount = (post.reportCount || 0) + 1;
        post.isReported = true;

        // Auto-hide if too many reports (e.g., 5+)
        if (post.reportCount >= 5) {
            post.isHidden = true;
        }

        await post.save();

        res.status(200).json({ 
            success: true, 
            message: 'Post reported successfully. Our team will review it.' 
        });
    } catch (error) {
        console.error('Report post error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to report post' 
        });
    }
};

// @desc    Report a comment
// @route   POST /api/v1/forum/comments/:commentId/report
// @access  Private
exports.reportComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { reason } = req.body;
        const pseudonymId = req.user.pseudonymId;

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Report reason is required' 
            });
        }

        // Validate commentId
        if (!commentId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid comment ID' 
            });
        }

        const comment = await ForumComment.findById(commentId);
        
        if (!comment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Comment not found' 
            });
        }

        // Initialize reports array if it doesn't exist
        if (!comment.reports) {
            comment.reports = [];
        }

        // Check if already reported
        const alreadyReported = comment.reports && comment.reports.some(
            report => report.pseudonymId === pseudonymId
        );

        if (alreadyReported) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already reported this comment' 
            });
        }

        comment.reports.push({
            pseudonymId,
            reason: reason.trim(),
            reportedAt: new Date()
        });
        comment.reportCount = (comment.reportCount || 0) + 1;
        comment.isReported = true;

        // Auto-hide if too many reports
        if (comment.reportCount >= 3) {
            comment.isHidden = true;
        }

        await comment.save();

        res.status(200).json({ 
            success: true, 
            message: 'Comment reported successfully' 
        });
    } catch (error) {
        console.error('Report comment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to report comment' 
        });
    }
};

// @desc    Delete own post
// @route   DELETE /api/v1/forum/posts/:postId
// @access  Private
exports.deletePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const pseudonymId = req.user.pseudonymId;

        // Validate postId
        if (!postId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid post ID' 
            });
        }

        const post = await ForumPost.findById(postId);
        
        if (!post) {
            return res.status(404).json({ 
                success: false, 
                message: 'Post not found' 
            });
        }

        // Only allow user to delete their own post
        if (post.pseudonymId !== pseudonymId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to delete this post' 
            });
        }

        // Delete all comments associated with this post
        await ForumComment.deleteMany({ postId });

        // Delete the post
        await post.deleteOne();

        res.status(200).json({ 
            success: true, 
            message: 'Post deleted successfully' 
        });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete post' 
        });
    }
};

// @desc    Delete own comment
// @route   DELETE /api/v1/forum/comments/:commentId
// @access  Private
exports.deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const pseudonymId = req.user.pseudonymId;

        // Validate commentId
        if (!commentId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid comment ID' 
            });
        }

        const comment = await ForumComment.findById(commentId);
        
        if (!comment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Comment not found' 
            });
        }

        // Only allow user to delete their own comment
        if (comment.pseudonymId !== pseudonymId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to delete this comment' 
            });
        }

        // Update post's comment count
        const post = await ForumPost.findById(comment.postId);
        if (post) {
            post.commentsCount = Math.max(0, (post.commentsCount || 0) - 1);
            await post.save();
        }

        // Delete the comment
        await comment.deleteOne();

        res.status(200).json({ 
            success: true, 
            message: 'Comment deleted successfully' 
        });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete comment' 
        });
    }
};

// @desc    Get posts by category
// @route   GET /api/v1/forum/posts/category/:category
// @access  Public
exports.getPostsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        // Get user's pseudonymId if authenticated
        const userPseudonymId = req.user ? req.user.pseudonymId : null;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const posts = await ForumPost.find({ 
            category, 
            isHidden: false 
        })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip)
            .select('-reports');

        // Add isLiked state
        const postsWithLikeState = posts.map(post => {
            const postObj = post.toObject();
            postObj.isLiked = userPseudonymId ? post.likes.includes(userPseudonymId) : false;
            return postObj;
        });

        const total = await ForumPost.countDocuments({ 
            category, 
            isHidden: false 
        });

        res.status(200).json({ 
            success: true, 
            count: postsWithLikeState.length,
            total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            posts: postsWithLikeState
        });
    } catch (error) {
        console.error('Get posts by category error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch posts' 
        });
    }
};