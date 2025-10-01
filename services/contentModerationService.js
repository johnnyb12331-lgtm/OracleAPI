const fs = require('fs');
const path = require('path');

class ContentModerationService {
  constructor() {
    // Rule-based filtering configuration
    this.blacklistedWords = [
      'spam', 'scam', 'phishing', 'malware', 'virus', 'hack', 'exploit',
      'nsfw', 'porn', 'adult', 'xxx', 'sex', 'nude', 'naked',
      'hate', 'discrimination', 'offensive',
      'violence', 'kill', 'murder', 'attack', 'threat',
      'drugs', 'cocaine', 'heroin', 'meth', 'weed',
      'pussy', 'bitch', 'dick'
    ];

    this.suspiciousPatterns = [
      /(\b\w+\b\s*){10,}/, // Excessive repeated words
      /[A-Z]{5,}/, // Excessive caps
      /(.)\1{4,}/, // Repeated characters
      /\b\d{10,}\b/, // Long numbers (potentially phone numbers)
      /https?:\/\/[^\s]{10,}/gi, // Long URLs
      /@[\w\d_]{50,}/, // Long usernames
    ];
  }

  /**
   * Moderate text content using rule-based filtering
   * @param {string} text - The text content to moderate
   * @returns {Promise<Object>} Moderation result with flagged status and categories
   */
  async moderateText(text) {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { flagged: false, categories: {}, category_scores: {} };
      }

      const normalizedText = text.toLowerCase().trim();
      const flaggedCategories = {};
      let overallScore = 0;

      // Check for blacklisted words
      const foundBlacklisted = this.blacklistedWords.filter(word =>
        normalizedText.includes(word.toLowerCase())
      );

      if (foundBlacklisted.length > 0) {
        flaggedCategories.blacklisted_words = true;
        overallScore += 0.8;
      }

      // Check for suspicious patterns
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(text)) {
          flaggedCategories.suspicious_patterns = true;
          overallScore += 0.6;
          break; // Only flag once for patterns
        }
      }

      // Check content length (too short or too long)
      if (text.length < 3) {
        flaggedCategories.too_short = true;
        overallScore += 0.3;
      } else if (text.length > 10000) {
        flaggedCategories.too_long = true;
        overallScore += 0.5;
      }

      // Check for excessive caps (more than 70% caps)
      const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
      if (capsRatio > 0.7 && text.length > 10) {
        flaggedCategories.excessive_caps = true;
        overallScore += 0.4;
      }

      // Check for potential spam (repeated phrases)
      const words = text.split(/\s+/);
      const uniqueWords = new Set(words.map(w => w.toLowerCase()));
      const repetitionRatio = uniqueWords.size / words.length;
      if (repetitionRatio < 0.3 && words.length > 20) {
        flaggedCategories.repetitive_content = true;
        overallScore += 0.5;
      }

      const flagged = overallScore >= 0.5;

      return {
        flagged,
        categories: flaggedCategories,
        category_scores: { overall: Math.min(overallScore, 1) },
        found_blacklisted: foundBlacklisted,
        raw_response: { rule_based: true, score: overallScore }
      };
    } catch (error) {
      console.error('Error in rule-based text moderation:', error);
      // In case of error, allow content but log the error
      return {
        flagged: false,
        categories: {},
        category_scores: {},
        error: error.message
      };
    }
  }

  /**
   * Moderate image content using rule-based checks
   * @param {string} imagePath - Path to the image file
   * @param {string} imageUrl - Optional URL if image is accessible via URL
   * @returns {Promise<Object>} Moderation result
   */
  async moderateImage(imagePath, imageUrl = null) {
    try {
      let fileStats = null;
      let filePath = imagePath;

      if (imageUrl) {
        // For URLs, we can't check file size locally, so we'll do basic URL validation
        const flaggedCategories = {};

        // Check for suspicious URL patterns
        if (imageUrl.includes('spam') || imageUrl.includes('scam') ||
            imageUrl.match(/\d{8,}/) || imageUrl.length > 500) {
          flaggedCategories.suspicious_url = true;
        }

        return {
          flagged: Object.keys(flaggedCategories).length > 0,
          categories: flaggedCategories,
          category_scores: { overall: Object.keys(flaggedCategories).length > 0 ? 0.8 : 0 },
          reason: Object.keys(flaggedCategories).length > 0 ? 'Suspicious image URL detected' : '',
          raw_response: { rule_based: true, url_check: true }
        };
      }

      if (!imagePath || !fs.existsSync(imagePath)) {
        return {
          flagged: false,
          categories: {},
          category_scores: {},
          reason: 'Image file not found'
        };
      }

      // Get file stats
      fileStats = fs.statSync(imagePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      const flaggedCategories = {};

      // Check file size (too large)
      if (fileSizeMB > 10) {
        flaggedCategories.file_too_large = true;
      }

      // Check file extension
      const ext = path.extname(imagePath).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!allowedExtensions.includes(ext)) {
        flaggedCategories.invalid_extension = true;
      }

      // Check filename for suspicious patterns
      const fileName = path.basename(imagePath).toLowerCase();
      if (fileName.includes('spam') || fileName.includes('scam') ||
          fileName.match(/\d{8,}/) || fileName.length > 100) {
        flaggedCategories.suspicious_filename = true;
      }

      const flagged = Object.keys(flaggedCategories).length > 0;

      return {
        flagged,
        categories: flaggedCategories,
        category_scores: { overall: flagged ? 0.7 : 0 },
        reason: flagged ? 'Image failed rule-based checks' : '',
        file_info: {
          size_mb: fileSizeMB,
          extension: ext,
          filename: fileName
        },
        raw_response: { rule_based: true, file_checks: true }
      };
    } catch (error) {
      console.error('Error in rule-based image moderation:', error);
      return {
        flagged: false,
        categories: [],
        category_scores: {},
        error: error.message
      };
    }
  }

  /**
   * Get MIME type from file extension
   * @param {string} filePath - Path to the file
   * @returns {string} MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Moderate both text and image content using rule-based filtering
   * @param {string} text - Text content
   * @param {string} imagePath - Path to image file
   * @param {string} imageUrl - Optional image URL
   * @returns {Promise<Object>} Combined moderation result
   */
  async moderateContent(text, imagePath = null, imageUrl = null) {
    const results = {
      text: null,
      image: null,
      overall_flagged: false,
      blocked_categories: [],
      action_required: false,
      rule_based: true
    };

    // Moderate text if provided
    if (text) {
      results.text = await this.moderateText(text);
      if (results.text.flagged) {
        results.overall_flagged = true;
        results.blocked_categories.push(...Object.keys(results.text.categories));
      }
    }

    // Moderate image if provided
    if (imagePath || imageUrl) {
      results.image = await this.moderateImage(imagePath, imageUrl);
      if (results.image.flagged) {
        results.overall_flagged = true;
        results.blocked_categories.push(...Object.keys(results.image.categories));
      }
    }

    // Determine if action is required based on rule violations
    results.action_required = results.overall_flagged;

    return results;
  }
}

module.exports = new ContentModerationService();