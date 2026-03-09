// models/ForumPost.js
const mongoose = require('mongoose');

const ForumPostSchema = new mongoose.Schema({
    pseudonymId: {
        type: String,
        required: true,
        index: true, // Index for faster queries
    },
    title: {
        type: String,
        required: [true, 'Post title is required.'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Post content cannot be empty.'],
        trim: true,
        maxlength: [5000, 'Content cannot exceed 5000 characters']
    },
    category: {
        type: String,
        enum: ['general', 'daily-checkins', 'coping-tips', 'support', 'anxiety', 'depression', 'other'],
        default: 'general'
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
    commentsCount: {
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
    reports: [{
        pseudonymId: String,
        reason: String,
        reportedAt: {
            type: Date,
            default: Date.now
        }
    }],
    isHidden: {
        type: Boolean,
        default: false, // Admin can hide inappropriate posts
    },
}, { 
    timestamps: true 
});

// Index for sorting by recent posts
ForumPostSchema.index({ createdAt: -1 });

// Index for category-based queries
ForumPostSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('ForumPost', ForumPostSchema);