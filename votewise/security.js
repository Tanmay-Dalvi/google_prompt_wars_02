/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module security
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Security utilities for VoteWise: input sanitization, validation,
 *              rate limiting, XSS prevention, and configuration validation.
 */

'use strict';

// ============ SECURITY CONSTANTS ============

/** @constant {string[]} VALID_LANGUAGE_CODES - Supported language codes */
const VALID_LANGUAGE_CODES = ['en', 'hi', 'mr', 'ta', 'te', 'bn'];

/** @constant {string[]} VALID_INDIAN_STATES - All Indian states and UTs */
const VALID_INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
  'Puducherry'
];

/** @constant {string[]} VALID_ELECTION_TYPES - Supported election types */
const VALID_ELECTION_TYPES = ['Lok Sabha', 'Vidhan Sabha', 'Local Body'];

/** @constant {number} MAX_INPUT_LENGTH - Maximum allowed input length */
const SEC_MAX_INPUT_LENGTH = 500;

/** @constant {number} MAX_RESPONSE_LENGTH - Maximum allowed response length */
const MAX_RESPONSE_LENGTH = 3000;

// ============ INPUT SANITIZATION ============

/**
 * Sanitizes user input by stripping HTML tags, limiting length, and removing XSS vectors.
 * @param {string} str - The raw input string to sanitize
 * @returns {string} Sanitized string safe for processing
 * @throws {TypeError} If input is not a string
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') {
    return '';
  }
  // Remove all HTML tags
  let sanitized = str.replace(/<[^>]*>/g, '');
  // Remove dangerous script patterns
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  sanitized = sanitized.replace(/data:/gi, '');
  sanitized = sanitized.replace(/vbscript:/gi, '');
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  // Trim whitespace
  sanitized = sanitized.trim();
  // Enforce length limit
  if (sanitized.length > SEC_MAX_INPUT_LENGTH) {
    sanitized = sanitized.substring(0, SEC_MAX_INPUT_LENGTH);
  }
  return sanitized;
}

/**
 * Escapes HTML entities to prevent XSS when inserting user content into the DOM.
 * @param {string} str - The string to escape
 * @returns {string} HTML-entity-escaped string safe for innerHTML insertion
 */
function escapeHtml(str) {
  if (typeof str !== 'string') {
    return '';
  }
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return str.replace(/[&<>"'`=/]/g, (char) => escapeMap[char] || char);
}

// ============ VALIDATION FUNCTIONS ============

/**
 * Validates that a language code is in the supported languages list.
 * @param {string} code - Language code to validate (e.g., 'en', 'hi')
 * @returns {boolean} True if valid, false otherwise
 */
function validateLanguageCode(code) {
  if (typeof code !== 'string') { return false; }
  return VALID_LANGUAGE_CODES.includes(code.toLowerCase().trim());
}

/**
 * Validates that a state name is a recognized Indian state or UT.
 * @param {string} code - State name to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateStateCode(code) {
  if (typeof code !== 'string') { return false; }
  const trimmed = code.trim();
  return VALID_INDIAN_STATES.some(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );
}

/**
 * Validates a date of birth string: must be valid date and not in the future.
 * @param {string} dob - Date of birth in YYYY-MM-DD format
 * @returns {{ valid: boolean, reason: string }} Validation result with reason
 */
function validateDOB(dob) {
  if (!dob || typeof dob !== 'string') {
    return { valid: false, reason: 'Date of birth is required.' };
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dob)) {
    return { valid: false, reason: 'Invalid date format. Use YYYY-MM-DD.' };
  }
  const date = new Date(dob);
  if (isNaN(date.getTime())) {
    return { valid: false, reason: 'Invalid date value.' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date >= today) {
    return { valid: false, reason: 'Date of birth cannot be today or in the future.' };
  }
  // Check reasonable range (not before 1900)
  if (date.getFullYear() < 1900) {
    return { valid: false, reason: 'Date of birth is too far in the past.' };
  }
  return { valid: true, reason: '' };
}

/**
 * Validates that an election type is one of the recognized types.
 * @param {string} type - Election type to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateElectionType(type) {
  if (typeof type !== 'string') { return false; }
  return VALID_ELECTION_TYPES.includes(type.trim());
}

/**
 * Validates a Gemini API response: must be non-empty string under max length.
 * @param {*} res - The response to validate
 * @returns {boolean} True if valid Gemini response, false otherwise
 */
function validateGeminiResponse(res) {
  if (typeof res !== 'string') { return false; }
  if (res.trim().length === 0) { return false; }
  if (res.length > MAX_RESPONSE_LENGTH) { return false; }
  return true;
}

/**
 * Validates and sanitizes a Cloud Function response object.
 * @param {Object} data - Response data from Cloud Function
 * @returns {{ valid: boolean, sanitized: Object|null }} Validation result
 */
function sanitizeCloudFunctionResponse(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, sanitized: null };
  }
  if (typeof data.answer !== 'string' || data.answer.trim().length === 0) {
    return { valid: false, sanitized: null };
  }
  const sanitized = {
    answer: sanitizeInput(data.answer.substring(0, MAX_RESPONSE_LENGTH)),
    language: validateLanguageCode(data.language) ? data.language : 'en',
    confidence: (typeof data.confidence === 'number' && data.confidence >= 0 && data.confidence <= 1)
      ? data.confidence
      : 0.8
  };
  return { valid: true, sanitized };
}

// ============ CRYPTO & TOKEN UTILITIES ============

/**
 * Generates a cryptographically random 16-character alphanumeric nonce.
 * @returns {string} A 16-character alphanumeric nonce string
 */
function generateNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    array.forEach((byte) => {
      nonce += chars[byte % chars.length];
    });
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 16; i++) {
      nonce += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return nonce;
}

// ============ RATE LIMITER ============

/**
 * @typedef {Object} RateLimiterState
 * @property {number} lastCallTime - Timestamp of the last API call
 * @property {number} sessionCallCount - Total calls made this session
 * @property {number} cooldownMs - Minimum milliseconds between calls
 * @property {number} maxSessionCalls - Maximum allowed calls per session
 */

/**
 * Rate limiter object to prevent API abuse.
 * Enforces a 2-second cooldown and a 30-call session maximum.
 * @type {Object}
 */
const rateLimiter = {
  lastCallTime: 0,
  sessionCallCount: 0,
  cooldownMs: 2000,
  maxSessionCalls: 30,

  /**
   * Checks whether a new API call is currently allowed.
   * @returns {{ allowed: boolean, reason: string }} Result with reason if blocked
   */
  checkAllowed() {
    const now = Date.now();
    if (this.sessionCallCount >= this.maxSessionCalls) {
      return { allowed: false, reason: `Session limit of ${this.maxSessionCalls} questions reached. Please refresh to continue.` };
    }
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.cooldownMs) {
      const wait = Math.ceil((this.cooldownMs - elapsed) / 1000);
      return { allowed: false, reason: `Please wait ${wait} second(s) before asking another question.` };
    }
    return { allowed: true, reason: '' };
  },

  /**
   * Records that an API call was made, updating internal counters.
   * @returns {void}
   */
  recordCall() {
    this.lastCallTime = Date.now();
    this.sessionCallCount++;
  },

  /**
   * Resets the rate limiter state (e.g., on session refresh).
   * @returns {void}
   */
  reset() {
    this.lastCallTime = 0;
    this.sessionCallCount = 0;
  }
};

// ============ CONFIG VALIDATION ============

/**
 * Validates that the CONFIG object contains all required fields.
 * @param {Object} config - The configuration object to validate
 * @returns {{ valid: boolean, missing: string[] }} Validation result with missing keys
 */
function validateConfig(config) {
  const requiredFields = [
    'GEMINI_API_KEY', 'TRANSLATE_API_KEY', 'FIREBASE_CONFIG',
    'CLOUD_FUNCTIONS_BASE_URL', 'APP'
  ];
  const requiredFirebaseFields = ['apiKey', 'authDomain', 'projectId', 'databaseURL'];
  const missing = [];

  requiredFields.forEach((field) => {
    if (!config[field]) {
      missing.push(field);
    }
  });

  if (config.FIREBASE_CONFIG) {
    requiredFirebaseFields.forEach((field) => {
      if (!config.FIREBASE_CONFIG[field]) {
        missing.push(`FIREBASE_CONFIG.${field}`);
      }
    });
  }

  return { valid: missing.length === 0, missing };
}

// ============ EXPORTS ============

// Export for both module environments and browser global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeInput,
    escapeHtml,
    validateLanguageCode,
    validateStateCode,
    validateDOB,
    validateElectionType,
    validateGeminiResponse,
    sanitizeCloudFunctionResponse,
    generateNonce,
    rateLimiter,
    validateConfig,
    VALID_LANGUAGE_CODES,
    VALID_INDIAN_STATES,
    VALID_ELECTION_TYPES
  };
}
