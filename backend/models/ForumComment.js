// models/ForumComment.js
const mongoose = require('mongoose');

const ForumCommentSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ForumPost',
        required: true,
        index: true,
    },
    pseudonymId: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: [true, 'Comment content cannot be empty.'],
        trim: true,
        maxlength: [2000, 'Comment cannot exceed 2000 characters']
    },
    isAnonymous: {
        type: Boolean,
        default: true,
    },
    likes: [{
        type: String, // Store pseudonymIds of users who liked
    }],
    likesCount: {
        type: Number,
        default: 0,
    },
    isReported: {
        type: Boolean,
        default: false,
    },
    reportCount: {
        type: Number,
        default: 0,
    },
    isHidden: {
        type: Boolean,
        default: false,
    },
}, { 
    timestamps: true 
});

// Index for fetching comments by post
ForumCommentSchema.index({ postId: 1, createdAt: 1 });

module.exports = mongoose.model('ForumComment', ForumCommentSchema);