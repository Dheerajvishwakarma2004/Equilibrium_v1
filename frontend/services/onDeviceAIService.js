// File: frontend/services/onDeviceAIService.js

const AFINN_LEXICON = {
  "breathtaking": 5, "outstanding": 5, "superb": 5,
  "amazing": 4, "awesome": 4, "excellent": 4, "fantastic": 4, "incredible": 4,
  "love": 4, "loved": 4, "loving": 4, "wonderful": 4, "brilliant": 4,
  "ecstatic": 4, "thrilled": 4, "overjoyed": 4,
  "beautiful": 3, "best": 3, "blessed": 3, "bliss": 3, "cheerful": 3,
  "creative": 3, "delighted": 3, "enjoying": 3, "excited": 3, "fun": 3,
  "glad": 3, "good": 3, "great": 3, "happiest": 3, "happy": 3,
  "hopeful": 3, "joy": 3, "joyful": 3, "laugh": 3, "laughing": 3,
  "peaceful": 3, "perfect": 3, "pleased": 3, "positive": 3, "proud": 3,
  "refreshed": 3, "relaxed": 3, "relieved": 3, "smile": 3, "smiling": 3,
  "successful": 3, "thankful": 3, "yay": 3,
  "accomplish": 2, "accomplished": 2, "active": 2, "admire": 2, "agree": 2,
  "calm": 2, "caring": 2, "comfortable": 2, "content": 2, "cool": 2,
  "curious": 2, "easy": 2, "energetic": 2, "enjoy": 2, "fine": 2,
  "focused": 2, "friendly": 2, "fulfilled": 2, "generous": 2, "gentle": 2,
  "grateful": 2, "healthy": 2, "helpful": 2, "hope": 2, "kind": 2,
  "motivated": 2, "nice": 2, "ok": 2, "okay": 2, "optimistic": 2,
  "productive": 2, "safe": 2, "satisfied": 2, "secure": 2, "strong": 2,
  "supported": 2, "thoughtful": 2, "useful": 2, "warm": 2, "welcome": 2,
  "accept": 1, "accepted": 1, "adequate": 1, "alright": 1, "balanced": 1,
  "better": 1, "capable": 1, "certain": 1, "clear": 1, "decent": 1,
  "determined": 1, "fair": 1, "free": 1, "growing": 1, "improving": 1,
  "interesting": 1, "learning": 1, "manageable": 1, "neutral": 1, "normal": 1,
  "patient": 1, "progressing": 1, "reasonable": 1, "rested": 1, "stable": 1,
  "steady": 1, "understanding": 1,
  "bored": -1, "boring": -1, "concerned": -1, "confused": -1, "disappointed": -1,
  "distracted": -1, "doubtful": -1, "dull": -1, "eh": -1, "indifferent": -1,
  "meh": -1, "miss": -1, "missing": -1, "skeptical": -1, "sleepy": -1,
  "tired": -1, "uncertain": -1, "uncomfortable": -1, "uneasy": -1, "unsure": -1,
  "weird": -1, "worried": -1,
  "afraid": -2, "alone": -2, "annoyed": -2, "annoying": -2, "anxious": -2,
  "bad": -2, "blame": -2, "bothered": -2, "busy": -2, "careless": -2,
  "difficult": -2, "discouraged": -2, "dislike": -2, "doubt": -2, "down": -2,
  "drained": -2, "exhausted": -2, "failure": -2, "fear": -2, "frustrated": -2,
  "guilty": -2, "hard": -2, "impatient": -2, "irritated": -2, "jealous": -2,
  "lazy": -2, "lonely": -2, "lost": -2, "low": -2, "nervous": -2,
  "overwhelmed": -2, "pressure": -2, "regret": -2, "restless": -2, "sad": -2,
  "scared": -2, "stressed": -2, "struggle": -2, "struggling": -2, "stuck": -2,
  "tense": -2, "unhappy": -2, "upset": -2, "weak": -2, "worry": -2,
  "angry": -3, "anguish": -3, "awful": -3, "broken": -3, "crying": -3,
  "depressed": -3, "depressing": -3, "desperate": -3, "devastated": -3,
  "disgusted": -3, "dread": -3, "empty": -3, "enraged": -3, "failed": -3,
  "furious": -3, "grief": -3, "hate": -3, "hated": -3, "hating": -3,
  "helpless": -3, "hopeless": -3, "horrible": -3, "hurt": -3, "hurting": -3,
  "isolated": -3, "miserable": -3, "numb": -3, "pain": -3, "painful": -3,
  "panic": -3, "pathetic": -3, "rejected": -3, "resentful": -3, "ruined": -3,
  "sick": -3, "sobbing": -3, "sorrow": -3, "suffer": -3, "suffering": -3,
  "terrible": -3, "terrified": -3, "trauma": -3, "traumatic": -3, "ugly": -3,
  "useless": -3, "worthless": -3,
  "agony": -4, "crisis": -4, "crushed": -4, "destroyed": -4, "disaster": -4,
  "nightmare": -4, "suicidal": -4, "torture": -4, "tragic": -4, "worst": -4,
  "abuse": -5, "abused": -5, "death": -5, "die": -5, "dying": -5,
  "kill": -5, "killed": -5, "murder": -5, "suicide": -5, "violence": -5,
};

const NEGATION_WORDS = [
  "not", "no", "never", "neither", "nobody", "nothing", "nowhere",
  "don't", "dont", "doesn't", "doesnt", "didn't", "didnt",
  "won't", "wont", "wouldn't", "wouldnt", "can't", "cant", "cannot",
  "couldn't", "couldnt", "shouldn't", "shouldnt", "isn't", "isnt",
  "aren't", "arent", "wasn't", "wasnt", "weren't", "werent",
  "haven't", "havent", "hasn't", "hasnt", "hadn't", "hadnt",
  "barely", "hardly", "rarely", "seldom", "without",
];

const INTENSITY_MODIFIERS = {
  "very": 1.5, "really": 1.5, "extremely": 2.0, "incredibly": 2.0,
  "absolutely": 2.0, "completely": 1.8, "totally": 1.8, "so": 1.5,
  "too": 1.3, "super": 1.8, "deeply": 1.7, "truly": 1.5, "highly": 1.5,
  "intensely": 1.8, "utterly": 2.0, "exceptionally": 1.8, "particularly": 1.3,
  "slightly": 0.5, "somewhat": 0.6, "a bit": 0.5, "a little": 0.5,
  "kind of": 0.6, "kinda": 0.6, "sort of": 0.6, "sorta": 0.6,
  "fairly": 0.7, "rather": 0.7, "pretty": 0.8, "quite": 0.9,
  "almost": 0.7, "barely": 0.4, "hardly": 0.4,
};

// Emoji scores — JS surrogate pair escapes, Hermes-safe, no raw emoji bytes
const EMOJI_SCORES = {
  "\uD83D\uDE00": 4, "\uD83E\uDD70": 4, "\uD83D\uDE3B": 4,
  "\uD83D\uDC95": 4, "\uD83D\uDC96": 4, "\uD83D\uDC97": 4,
  "\uD83D\uDC93": 4, "\uD83D\uDC98": 4, "\uD83E\uDD29": 4,
  "\uD83C\uDF89": 4, "\uD83C\uDF8A": 4, "\u2728": 3,
  "\uD83C\uDF1F": 3, "\u2B50": 3,
  "\uD83D\uDE0A": 3, "\uD83D\uDE04": 3, "\uD83D\uDE01": 3,
  "\uD83D\uDE42": 2, "\uD83D\uDE03": 3, "\uD83D\uDE3A": 3,
  "\uD83D\uDC4D": 2, "\uD83D\uDC4F": 2, "\uD83D\uDE4C": 3,
  "\uD83D\uDCAA": 2, "\u2764\uFE0F": 3, "\uD83E\uDDE1": 3,
  "\uD83D\uDC9B": 3, "\uD83D\uDC9A": 3, "\uD83D\uDC99": 3,
  "\uD83D\uDC9C": 3, "\uD83E\uDD0D": 2, "\uD83D\uDDA4": 1,
  "\u2665\uFE0F": 3, "\uD83D\uDE0C": 2, "\uD83D\uDE07": 3,
  "\uD83E\uDD73": 4, "\uD83D\uDE0E": 2, "\uD83E\uDD17": 3,
  "\uD83D\uDE0B": 2,
  "\uD83D\uDE10": 0, "\uD83D\uDE11": 0, "\uD83E\uDD14": 0,
  "\uD83D\uDE36": 0, "\uD83D\uDE44": -1, "\uD83D\uDE0F": 0,
  "\uD83E\uDD37": 0, "\uD83D\uDCAD": 0,
  "\uD83D\uDE15": -1, "\uD83D\uDE1F": -1, "\uD83D\uDE41": -1,
  "\uD83D\uDE2E": 0, "\uD83D\uDE2F": 0, "\uD83D\uDE32": 0,
  "\uD83D\uDE34": -1, "\uD83E\uDD71": -1, "\uD83D\uDE2A": -1,
  "\uD83D\uDE13": -2, "\uD83D\uDE22": -2, "\uD83D\uDE25": -2,
  "\uD83D\uDE14": -2, "\uD83D\uDE1E": -2, "\uD83D\uDE16": -2,
  "\uD83D\uDE23": -2, "\uD83D\uDE29": -3, "\uD83D\uDE2B": -3,
  "\uD83D\uDE24": -2, "\uD83D\uDE20": -3, "\uD83D\uDE21": -3,
  "\uD83E\uDD2C": -4, "\uD83D\uDE30": -2, "\uD83D\uDE28": -3,
  "\uD83D\uDE31": -3, "\uD83D\uDE2D": -3, "\uD83D\uDC94": -3,
  "\uD83D\uDE3F": -2, "\uD83D\uDE40": -2, "\uD83D\uDE3E": -2,
  "\uD83D\uDC4E": -2,
  "\u2620\uFE0F": -4, "\uD83D\uDC80": -3, "\uD83E\uDD2E": -3,
  "\uD83E\uDD22": -2, "\uD83D\uDE35": -3, "\uD83E\uDD7A": -2,
};

const CRISIS_KEYWORDS = [
  "suicide", "suicidal", "end my life", "kill myself", "want to die",
  "don't want to be here", "can't go on", "self harm", "hurt myself",
  "cutting myself", "no reason to live", "better off dead",
];

const PAST_TENSE_MARKERS = [
  "used to", "used to be", "was feeling", "had been", "felt like",
  "yesterday i", "last week", "last month", "before i",
];

const MOOD_DEFINITIONS = {
  ecstatic:   { emoji: "\uD83E\uDD29", label: "Ecstatic",   text: "I'm feeling absolutely amazing and ecstatic!", baseScore: 95, color: "#10b981", gradient: ["#10b981", "#34d399"] },
  happy:      { emoji: "\uD83D\uDE0A", label: "Happy",      text: "I'm feeling happy right now.",                baseScore: 80, color: "#22c55e", gradient: ["#22c55e", "#4ade80"] },
  grateful:   { emoji: "\uD83E\uDD70", label: "Grateful",   text: "I'm feeling grateful and loved.",             baseScore: 85, color: "#ec4899", gradient: ["#ec4899", "#f472b6"] },
  calm:       { emoji: "\uD83D\uDE0C", label: "Calm",       text: "I'm feeling calm and peaceful.",              baseScore: 70, color: "#06b6d4", gradient: ["#06b6d4", "#22d3ee"] },
  motivated:  { emoji: "\uD83D\uDCAA", label: "Motivated",  text: "I'm feeling motivated and energized!",        baseScore: 82, color: "#f59e0b", gradient: ["#f59e0b", "#fbbf24"] },
  neutral:    { emoji: "\uD83D\uDE10", label: "Neutral",    text: "I'm feeling okay, nothing particular.",       baseScore: 50, color: "#6b7280", gradient: ["#6b7280", "#9ca3af"] },
  low:        { emoji: "\uD83D\uDE14", label: "Low",        text: "I'm feeling a bit low right now.",            baseScore: 35, color: "#8b5cf6", gradient: ["#8b5cf6", "#a78bfa"] },
  sad:        { emoji: "\uD83D\uDE22", label: "Sad",        text: "I'm feeling sad at the moment.",              baseScore: 25, color: "#3b82f6", gradient: ["#3b82f6", "#60a5fa"] },
  devastated: { emoji: "\uD83D\uDE2D", label: "Devastated", text: "I'm feeling extremely sad and devastated.",   baseScore: 10, color: "#1e40af", gradient: ["#1e40af", "#3b82f6"] },
  anxious:    { emoji: "\uD83D\uDE30", label: "Anxious",    text: "I'm feeling anxious and worried.",            baseScore: 30, color: "#eab308", gradient: ["#eab308", "#facc15"] },
  scared:     { emoji: "\uD83D\uDE28", label: "Scared",     text: "I'm feeling scared and uneasy.",              baseScore: 25, color: "#f97316", gradient: ["#f97316", "#fb923c"] },
  frustrated: { emoji: "\uD83D\uDE24", label: "Frustrated", text: "I'm feeling frustrated and irritated.",       baseScore: 30, color: "#ef4444", gradient: ["#ef4444", "#f87171"] },
};

// Import the wellness insight engine
import wellnessInsightEngine from './wellnessInsightEngine';

class OnDeviceAIService {
  constructor() {
    this.initialized = false;
    this.moodDefinitions = MOOD_DEFINITIONS;
  }

  async initialize() {
    try {
      this.initialized = true;
      console.log("OnDeviceAIService initialized with enhanced sentiment analysis");
    } catch (error) {
      console.error("OnDeviceAIService initialization error:", error);
      throw error;
    }
  }

  /**
   * Get all available mood options
   */
  getMoodOptions() {
    return Object.entries(MOOD_DEFINITIONS).map(([key, mood]) => ({
      key,
      ...mood,
    }));
  }

  /**
   * Get mood definition by key
   */
  getMoodDefinition(moodKey) {
    return MOOD_DEFINITIONS[moodKey] || MOOD_DEFINITIONS.neutral;
  }

  /**
   * Extract emojis from text
   */
  extractEmojis(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    return text.match(emojiRegex) || [];
  }

  /**
   * Tokenize text into words
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Check if a word is negated (within 3-word window before it)
   */
  isNegated(words, index) {
    const windowStart = Math.max(0, index - 3);
    for (let i = windowStart; i < index; i++) {
      if (NEGATION_WORDS.includes(words[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get intensity modifier for a word (check previous word)
   */
  getIntensityModifier(words, index) {
    if (index === 0) return 1.0;
    
    const prevWord = words[index - 1];
    const twoWordPhrase = index >= 2 ? `${words[index - 2]} ${prevWord}` : "";
    
    // Check two-word phrases first
    if (INTENSITY_MODIFIERS[twoWordPhrase]) {
      return INTENSITY_MODIFIERS[twoWordPhrase];
    }
    
    // Check single word
    if (INTENSITY_MODIFIERS[prevWord]) {
      return INTENSITY_MODIFIERS[prevWord];
    }
    
    return 1.0;
  }

  /**
   * Analyze sentiment of text using enhanced AFINN-based analysis
   * Returns: { score: 0-100, sentiment: string, emoji: string, confidence: number, details: object }
   */
  analyzeSentiment(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return {
        score: 50,
        rawScore: 0,
        sentiment: "neutral",
        emoji: "\uD83D\uDE10",
        confidence: 0,
        details: {
          wordScores: [],
          emojiScores: [],
          totalWords: 0,
          sentimentWords: 0,
        },
      };
    }

    const words = this.tokenize(text);
    const emojis = this.extractEmojis(text);
    
    let totalScore = 0;
    let sentimentWordCount = 0;
    const wordScores = [];
    const emojiScoreList = [];

    // Analyze words
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (AFINN_LEXICON[word] !== undefined) {
        let wordScore = AFINN_LEXICON[word];
        
        // Apply negation
        if (this.isNegated(words, i)) {
          wordScore = -wordScore * 0.8; // Negation reverses but slightly dampens
        }
        
        // Apply intensity modifier
        const modifier = this.getIntensityModifier(words, i);
        wordScore = wordScore * modifier;
        
        totalScore += wordScore;
        sentimentWordCount++;
        
        wordScores.push({
          word,
          score: wordScore,
          negated: this.isNegated(words, i),
          modifier,
        });
      }
    }

    // Analyze emojis
    for (const emoji of emojis) {
      if (EMOJI_SCORES[emoji] !== undefined) {
        totalScore += EMOJI_SCORES[emoji];
        sentimentWordCount++;
        emojiScoreList.push({ emoji, score: EMOJI_SCORES[emoji] });
      }
    }

    // Calculate normalized score (0-100)
    // Raw score typically ranges from -10 to +10 for normal text
    // Map this to 0-100 scale with 50 as neutral
    const maxExpectedScore = Math.max(sentimentWordCount * 3, 5);
    const normalizedScore = Math.max(0, Math.min(100, 
      50 + (totalScore / maxExpectedScore) * 50
    ));

    // Determine sentiment label and emoji
    let sentiment, emoji;
    if (normalizedScore >= 80) {
      sentiment = "very_positive";
      emoji = "\uD83E\uDD29";
    } else if (normalizedScore >= 65) {
      sentiment = "positive";
      emoji = "\uD83D\uDE0A";
    } else if (normalizedScore >= 55) {
      sentiment = "slightly_positive";
      emoji = "\uD83D\uDE42";
    } else if (normalizedScore >= 45) {
      sentiment = "neutral";
      emoji = "\uD83D\uDE10";
    } else if (normalizedScore >= 35) {
      sentiment = "slightly_negative";
      emoji = "\uD83D\uDE15";
    } else if (normalizedScore >= 20) {
      sentiment = "negative";
      emoji = "\uD83D\uDE22";
    } else {
      sentiment = "very_negative";
      emoji = "\uD83D\uDE2D";
    }

    // Calculate confidence based on sentiment word density
    const confidence = Math.min(100, Math.round(
      (sentimentWordCount / Math.max(words.length, 1)) * 200
    ));

    // Crisis detection
    const textLower = text.toLowerCase();
    const crisisDetected = CRISIS_KEYWORDS.some(kw => textLower.includes(kw));

    // Past-tense dampening: "I used to be depressed" != "I am depressed"
    const isPastContext = PAST_TENSE_MARKERS.some(marker => textLower.includes(marker));
    let adjustedScore = normalizedScore;
    if (isPastContext && normalizedScore < 45) {
      adjustedScore = normalizedScore + (50 - normalizedScore) * 0.35;
    }
    const finalScore = Math.max(0, Math.min(100, Math.round(adjustedScore)));

    let adjustedSentiment = sentiment;
    let adjustedEmoji = emoji;
    if (isPastContext && finalScore !== Math.round(normalizedScore)) {
      if (finalScore >= 45) { adjustedSentiment = "neutral"; adjustedEmoji = "\uD83D\uDE10"; }
      else if (finalScore >= 35) { adjustedSentiment = "slightly_negative"; adjustedEmoji = "\uD83D\uDE15"; }
    }

    return {
      score: finalScore,
      rawScore: Math.round(totalScore * 100) / 100,
      sentiment: adjustedSentiment,
      emoji: adjustedEmoji,
      confidence,
      crisisDetected,
      isPastContext,
      details: {
        wordScores,
        emojiScores: emojiScoreList,
        totalWords: words.length,
        sentimentWords: sentimentWordCount,
      },
    };
  }

  /**
   * Analyze a mood selection
   * Returns same structure as analyzeSentiment for consistency
   */
  analyzeMood(moodKey) {
    const mood = this.getMoodDefinition(moodKey);
    return {
      score: mood.baseScore,
      rawScore: (mood.baseScore - 50) / 5, // Convert to AFINN-like scale
      sentiment: moodKey,
      emoji: mood.emoji,
      confidence: 100, // Direct mood selection is 100% confident
      details: {
        source: "mood_selection",
        moodKey,
        moodLabel: mood.label,
      },
    };
  }

  /**
   * Calculate combined score for a journal with multiple logs
   * Mood entries have 1.5x weight
   */
  calculateJournalScore(logs) {
    if (!logs || logs.length === 0) {
      return {
        score: 50,
        sentiment: "neutral",
        emoji: "\uD83D\uDE10",
        trend: "stable",
      };
    }

    // Filter out deleted logs
    const activeLogs = logs.filter(log => !log.deleted);
    
    if (activeLogs.length === 0) {
      return {
        score: 50,
        sentiment: "neutral",
        emoji: "\uD83D\uDE10",
        trend: "stable",
      };
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;
    const scores = [];

    for (const log of activeLogs) {
      let logScore, weight;

      if (log.type === "mood") {
        const moodAnalysis = this.analyzeMood(log.moodKey);
        logScore = moodAnalysis.score;
        weight = 1.5; // Mood entries have higher weight
      } else {
        const textAnalysis = this.analyzeSentiment(log.text);
        logScore = textAnalysis.score;
        weight = 1.0;
      }

      totalWeightedScore += logScore * weight;
      totalWeight += weight;
      scores.push(logScore);
    }

    const finalScore = Math.round(totalWeightedScore / totalWeight);

    // Determine overall sentiment
    let sentiment, emoji;
    if (finalScore >= 80) {
      sentiment = "very_positive";
      emoji = "\uD83E\uDD29";
    } else if (finalScore >= 65) {
      sentiment = "positive";
      emoji = "\uD83D\uDE0A";
    } else if (finalScore >= 55) {
      sentiment = "slightly_positive";
      emoji = "\uD83D\uDE42";
    } else if (finalScore >= 45) {
      sentiment = "neutral";
      emoji = "\uD83D\uDE10";
    } else if (finalScore >= 35) {
      sentiment = "slightly_negative";
      emoji = "\uD83D\uDE15";
    } else if (finalScore >= 20) {
      sentiment = "negative";
      emoji = "\uD83D\uDE22";
    } else {
      sentiment = "very_negative";
      emoji = "\uD83D\uDE2D";
    }

    // Calculate trend
    let trend = "stable";
    if (scores.length >= 2) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      if (avgSecond - avgFirst > 10) trend = "improving";
      else if (avgFirst - avgSecond > 10) trend = "declining";
    }

    return {
      score: finalScore,
      sentiment,
      emoji,
      trend,
      logCount: activeLogs.length,
    };
  }

  /**
   * Get sentiment label for display
   */
  getSentimentLabel(sentiment) {
    const labels = {
      "very_positive": "Feeling Great!",
      "positive": "Feeling Good",
      "slightly_positive": "Doing Okay",
      "neutral": "Feeling Neutral",
      "slightly_negative": "Feeling Low",
      "negative": "Feeling Down",
      "very_negative": "Struggling",
    };
    return labels[sentiment] || "Feeling Neutral";
  }

  /**
   * Get color for score
   */
  getScoreColor(score) {
    if (score >= 80) return "#10b981"; // Emerald
    if (score >= 65) return "#22c55e"; // Green
    if (score >= 55) return "#84cc16"; // Lime
    if (score >= 45) return "#6b7280"; // Gray
    if (score >= 35) return "#f59e0b"; // Amber
    if (score >= 20) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  /**
   * Get gradient colors for score
   */
  getScoreGradient(score) {
    if (score >= 80) return ["#10b981", "#34d399"];
    if (score >= 65) return ["#22c55e", "#4ade80"];
    if (score >= 55) return ["#84cc16", "#a3e635"];
    if (score >= 45) return ["#6b7280", "#9ca3af"];
    if (score >= 35) return ["#f59e0b", "#fbbf24"];
    if (score >= 20) return ["#f97316", "#fb923c"];
    return ["#ef4444", "#f87171"];
  }

  // ========================================
  // Enhanced analysis methods
  // ========================================

  /**
   * Detect if a text entry contains crisis signals.
   * Returns { detected: bool, keywords: string[] }
   */
  detectCrisisSignals(text) {
    if (!text || typeof text !== "string") return { detected: false, keywords: [] };
    const textLower = text.toLowerCase();
    const matched = CRISIS_KEYWORDS.filter(kw => textLower.includes(kw));
    return { detected: matched.length > 0, keywords: matched };
  }

  /**
   * Summarize sentiment trend across multiple days of journals.
   * Uses linear regression slope. Used by Dashboard/Reports.
   */
  getSentimentTrendSummary(journals) {
    if (!journals || journals.length < 2) {
      return { trend: "stable", direction: 0, label: "Not enough data yet" };
    }
    const scores = journals
      .filter(j => j.currentScore !== undefined)
      .map(j => j.finalScore || j.currentScore)
      .reverse();
    if (scores.length < 2) return { trend: "stable", direction: 0, label: "Not enough data yet" };
    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const xMean = (n - 1) / 2;
    let num = 0, denom = 0;
    scores.forEach((score, i) => {
      num += (i - xMean) * (score - mean);
      denom += (i - xMean) ** 2;
    });
    const slope = denom !== 0 ? num / denom : 0;
    let trend, label;
    if (slope > 1.5)       { trend = "improving"; label = "Your mood is trending upward \uD83D\uDCC8"; }
    else if (slope < -1.5) { trend = "declining"; label = "Your mood has been dipping recently \uD83D\uDCC9"; }
    else                   { trend = "stable";    label = "Your mood has been fairly steady \u3030\uFE0F"; }
    return { trend, direction: Math.round(slope * 10) / 10, label };
  }

  /**
   * Analyze a batch of text entries — returns aggregate stats.
   * More accurate than averaging individual scores.
   */
  analyzeBatch(texts) {
    if (!texts || texts.length === 0) return { avgScore: 50, distribution: {}, topWords: [] };
    const results = texts.map(t => this.analyzeSentiment(t));
    const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    const distribution = { very_positive: 0, positive: 0, slightly_positive: 0, neutral: 0, slightly_negative: 0, negative: 0, very_negative: 0 };
    results.forEach(r => { if (distribution[r.sentiment] !== undefined) distribution[r.sentiment]++; });
    const wordFreq = {};
    results.forEach(r => {
      r.details.wordScores.forEach(({ word, score }) => {
        if (!wordFreq[word]) wordFreq[word] = { count: 0, totalScore: 0 };
        wordFreq[word].count++;
        wordFreq[word].totalScore += score;
      });
    });
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([word, { count, totalScore }]) => ({ word, count, avgScore: Math.round(totalScore / count * 10) / 10 }));
    return { avgScore, distribution, topWords };
  }

  // ========================================
  // Legacy methods (keeping for compatibility)
  // ========================================

  calculateWellnessScore(metrics) {
    try {
      const { sleepHours = 7, moodScore = 3, screenTimeMinutes = 240, activityMinutes = 0 } = metrics;

      // Sleep score (0-25 points)
      let sleepScore = 0;
      if (sleepHours >= 7 && sleepHours <= 9) sleepScore = 25;
      else if (sleepHours >= 6 && sleepHours <= 10) sleepScore = 20;
      else if (sleepHours >= 5 && sleepHours <= 11) sleepScore = 15;
      else sleepScore = 10;

      // Mood score (0-25 points)
      const moodScoreNormalized = Math.max(0, Math.min(5, moodScore));
      const moodPoints = (moodScoreNormalized / 5) * 25;

      // Screen time score (0-25 points)
      let screenTimeScore = 0;
      if (screenTimeMinutes <= 120) screenTimeScore = 25;
      else if (screenTimeMinutes <= 240) screenTimeScore = 20;
      else if (screenTimeMinutes <= 360) screenTimeScore = 15;
      else if (screenTimeMinutes <= 480) screenTimeScore = 10;
      else screenTimeScore = 5;

      // Activity score (0-25 points)
      let activityScore = 0;
      if (activityMinutes >= 60) activityScore = 25;
      else if (activityMinutes >= 30) activityScore = 20;
      else if (activityMinutes >= 15) activityScore = 15;
      else if (activityMinutes >= 5) activityScore = 10;
      else activityScore = 5;

      const totalScore = sleepScore + moodPoints + screenTimeScore + activityScore;
      return Math.round(totalScore);
    } catch (error) {
      console.error("Calculate wellness score error:", error);
      return 50;
    }
  }

  generateWellnessInsights(wellnessData) {
    try {
      if (!wellnessData || wellnessData.length === 0) {
        return [
          {
            type: "info",
            title: "Start Your Wellness Journey",
            message: "Begin tracking your wellness to get personalized insights.",
            recommendation: "Log your mood and activities daily for better insights.",
            icon: "information-circle",
            color: "#6b7280",
          },
        ];
      }

      const insights = [];
      const recentData = wellnessData.slice(0, 7);

      const avgWellness = recentData.reduce((sum, day) => sum + (day.wellnessScore || 0), 0) / recentData.length;
      const avgMood = recentData.reduce((sum, day) => sum + (day.moodScore || 3), 0) / recentData.length;
      const avgSleep = recentData.reduce((sum, day) => sum + (day.sleepHours || 7), 0) / recentData.length;

      if (avgWellness < 60) {
        insights.push({
          type: "warning",
          title: "Wellness Attention Needed",
          message: "Your wellness score has been below average this week.",
          recommendation: "Consider focusing on sleep, reducing screen time, or talking to someone.",
          icon: "alert-triangle",
          color: "#f59e0b",
        });
      } else if (avgWellness > 80) {
        insights.push({
          type: "positive",
          title: "Excellent Wellness!",
          message: "Great job! Your wellness score has been consistently high.",
          recommendation: "Keep up the good habits that are working for you.",
          icon: "trending-up",
          color: "#10b981",
        });
      }

      if (avgSleep < 6.5) {
        insights.push({
          type: "warning",
          title: "Sleep Improvement Needed",
          message: "You've been getting less sleep than recommended.",
          recommendation: "Try to get 7-9 hours of sleep for better mental health.",
          icon: "moon",
          color: "#8b5cf6",
        });
      }

      if (avgMood < 2.5) {
        insights.push({
          type: "concern",
          title: "Mood Support Recommended",
          message: "Your mood has been consistently low this week.",
          recommendation: "Consider reaching out to a mental health professional or trusted friend.",
          icon: "heart",
          color: "#ef4444",
        });
      }

      return insights.length > 0
        ? insights
        : [
            {
              type: "info",
              title: "Wellness Patterns Look Stable",
              message: "Your wellness patterns appear consistent.",
              recommendation: "Continue your current routine and track daily for more insights.",
              icon: "checkmark-circle",
              color: "#10b981",
            },
          ];
    } catch (error) {
      console.error("Generate wellness insights error:", error);
      return [
        {
          type: "error",
          title: "Insights Unavailable",
          message: "Unable to generate insights at this time.",
          recommendation: "Please try again later.",
          icon: "alert-circle",
          color: "#ef4444",
        },
      ];
    }
  }

  /**
   * ✅ NEW: Generate advanced insights using deterministic insight engine
   * Returns structured insights with causes, effects, and suggestions
   */
  async generateAdvancedInsights() {
    try {
      // Get insights from the engine
      const engineInsights = await wellnessInsightEngine.generateInsights();

      if (!engineInsights || engineInsights.length === 0) {
        return [
          {
            type: "info",
            title: "Keep Tracking",
            message: "Continue logging your wellness for personalized insights.",
            observation: "Not enough data yet.",
            cause: "More data helps identify patterns.",
            suggestion: "Log your mood, sleep, and activities daily.",
            icon: "information-circle",
            color: "#6b7280",
          },
        ];
      }

      // Format insights for UI display
      return engineInsights.map(insight => ({
        type: this.mapInsightType(insight.type, insight.category),
        title: this.generateTitle(insight.category),
        message: insight.observation,
        observation: insight.observation,
        cause: insight.cause,
        suggestion: insight.suggestion,
        icon: this.mapInsightIcon(insight.category),
        color: this.mapInsightColor(insight.severity),
        severity: insight.severity,
        confidence: insight.confidence,
      }));
    } catch (error) {
      console.error("Advanced insights generation error:", error);
      return [];
    }
  }

  /**
   * Map engine insight types to UI types
   */
  mapInsightType(engineType, category) {
    const typeMap = {
      sleep: 'warning',
      behavior: 'info',
      mood: 'warning',
      correlation: 'warning',
      warning: 'warning',
      trend: 'info',
    };
    return typeMap[engineType] || 'info';
  }

  /**
   * Generate human-readable titles
   */
  generateTitle(category) {
    const titleMap = {
      sleep_deficit: '😴 Sleep Deficit',
      sleep_recovery: '😴 Catching Up on Sleep',
      severe_sleep_deficit: '⚠️ Severe Sleep Loss',
      poor_efficiency: '😴 Restless Sleep',
      good_efficiency: '✨ Great Sleep Quality',
      irregular_schedule: '📅 Irregular Sleep Schedule',
      circadian_disruption: '🕐 Circadian Shift',
      sleep_mood_link: '🧠 Sleep Affecting Mood',
      trend_correlation: '📊 Sleep & Mood Declining',
      sleep_declining: '📉 Sleep Declining',
      sleep_improving: '📈 Sleep Improving',
      anomaly: '⚠️ Unusual Sleep Pattern',
    };
    return titleMap[category] || 'Wellness Insight';
  }

  /**
   * Map categories to icons
   */
  mapInsightIcon(category) {
    const iconMap = {
      sleep_deficit: 'alert-triangle',
      sleep_recovery: 'trending-up',
      severe_sleep_deficit: 'alert-circle',
      poor_efficiency: 'alert-triangle',
      good_efficiency: 'checkmark-circle',
      irregular_schedule: 'calendar',
      circadian_disruption: 'time',
      sleep_mood_link: 'heart',
      trend_correlation: 'trending-down',
      sleep_declining: 'trending-down',
      sleep_improving: 'trending-up',
      anomaly: 'alert',
    };
    return iconMap[category] || 'information-circle';
  }

  /**
   * Map severity to colors
   */
  mapInsightColor(severity) {
    const colorMap = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
    };
    return colorMap[severity] || '#6b7280';
  }

  detectAnomalies(wellnessData) {
    try {
      if (!wellnessData || wellnessData.length < 3) return [];

      const anomalies = [];
      const recentData = wellnessData.slice(0, 7);

      for (let i = 0; i < recentData.length - 1; i++) {
        const current = recentData[i].wellness_score || 0;
        const previous = recentData[i + 1].wellness_score || 0;

        if (previous - current > 20) {
          anomalies.push({
            type: "wellness_drop",
            date: recentData[i].date,
            severity: "medium",
            message: "Significant drop in wellness score detected.",
          });
        }
      }

      const lowMoodDays = recentData.filter((day) => (day.mood_score || 3) < 2).length;
      if (lowMoodDays >= 3) {
        anomalies.push({
          type: "low_mood_pattern",
          severity: "high",
          message: "Consistently low mood detected over multiple days.",
        });
      }

      return anomalies;
    } catch (error) {
      console.error("Detect anomalies error:", error);
      return [];
    }
  }

  generateRecommendations(userProfile, wellnessData) {
    try {
      const recommendations = [];

      if (!wellnessData || wellnessData.length === 0) {
        return [
          "Start by tracking your daily mood and activities",
          "Set a consistent sleep schedule",
          "Take short breaks from screens throughout the day",
        ];
      }

      const recentData = wellnessData.slice(0, 7);
      const avgSleep = recentData.reduce((sum, day) => sum + (day.sleep_hours || 7), 0) / recentData.length;
      const avgMood = recentData.reduce((sum, day) => sum + (day.mood_score || 3), 0) / recentData.length;

      if (avgSleep < 7) {
        recommendations.push("Try to get 7-9 hours of sleep each night for better mental health");
      }

      if (avgMood < 3) {
        recommendations.push("Consider practicing mindfulness or talking to someone you trust");
      }

      recommendations.push("Take regular breaks from screens to reduce digital fatigue");
      recommendations.push("Engage in physical activity, even a short walk can help");

      return recommendations;
    } catch (error) {
      console.error("Generate recommendations error:", error);
      return ["Focus on getting enough sleep and staying connected with others"];
    }
  }
}

export default new OnDeviceAIService();