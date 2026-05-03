/* global gcpLog, CONFIG, CONSTANTS */
/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module translate
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Google Translate API integration for VoteWise multilingual support.
 *              Handles translation of page content, AI responses, and UI elements.
 *              Supports: English, Hindi, Marathi, Tamil, Telugu, Bengali.
 */

'use strict';


// ============ LANGUAGE CONFIGURATION ============

/**
 * @typedef {Object} LanguageConfig
 * @property {string} code - BCP-47 language code
 * @property {string} label - Display name in English
 * @property {string} nativeLabel - Display name in native script
 * @property {string} flag - Emoji flag or abbreviation
 * @property {string} dir - Text direction ('ltr' or 'rtl')
 */

/** @type {LanguageConfig[]} */
const SUPPORTED_LANGUAGE_LIST = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇮🇳', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', flag: 'हिं', dir: 'ltr' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', flag: 'मर', dir: 'ltr' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', flag: 'தமி', dir: 'ltr' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', flag: 'తెలు', dir: 'ltr' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', flag: 'বাং', dir: 'ltr' }
];

/** @constant {string} TRANSLATE_CACHE_PREFIX - sessionStorage key prefix for cached translations */
const TRANSLATE_CACHE_PREFIX = 'vw_translate_cache_';

/** @constant {string} TRANSLATE_API_BASE - Google Translate API base URL */
const TRANSLATE_API_BASE = 'https://translation.googleapis.com/language/translate/v2';

// ============ CACHE UTILITIES ============

/**
 * Generates a consistent cache key for a text+language pair.
 * @param {string} text - The source text
 * @param {string} lang - The target language code
 * @returns {string} Cache key string
 */
function buildCacheKey(text, lang) {
  // Use a hash-like key: first 40 chars of text + lang code
  const textKey = text.replace(/\s+/g, '_').substring(0, 40);
  return `${TRANSLATE_CACHE_PREFIX}${lang}_${textKey}`;
}

/**
 * Retrieves a cached translation from sessionStorage.
 * @param {string} text - The source text to look up
 * @param {string} lang - The target language code
 * @returns {string|null} Cached translated text, or null if not found
 */
function getCachedTranslation(text, lang) {
  try {
    const key = buildCacheKey(text, lang);
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * Saves a translation to sessionStorage for future retrieval.
 * @param {string} text - The original source text
 * @param {string} lang - The target language code
 * @param {string} result - The translated text to cache
 * @returns {void}
 */
function setCachedTranslation(text, lang, result) {
  try {
    const key = buildCacheKey(text, lang);
    sessionStorage.setItem(key, result);
  } catch (e) {
    // sessionStorage may be full or unavailable — fail silently
  }
}

// ============ CORE TRANSLATION FUNCTIONS ============

/**
 * Translates a single text string to the target language using Google Translate API.
 * Uses sessionStorage cache to avoid redundant API calls.
 * Falls back to the original text if translation fails.
 * @param {string} text - The text to translate
 * @param {string} targetLang - BCP-47 language code (e.g., 'hi', 'ta')
 * @param {string} apiKey - Google Translate API key
 * @returns {Promise<string>} Translated text, or original text on failure
 */
async function translateText(text, targetLang, apiKey) {
  if (!text || typeof text !== 'string' || text.trim() === '') { return text; }
  if (targetLang === 'en') { return text; } // No translation needed for English

  // Check cache first
  const cached = getCachedTranslation(text, targetLang);
  if (cached) { return cached; }

  if (!apiKey || apiKey === 'YOUR_TRANSLATE_API_KEY') {
    // Simulation mode: return original text with language indicator
    return text;
  }

  try {
    const response = await fetch(`${TRANSLATE_API_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        format: 'text',
        source: 'en'
      })
    });

    if (!response.ok) {
      throw new Error(`Translate API error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data?.data?.translations?.[0]?.translatedText;

    if (translated) {
      setCachedTranslation(text, targetLang, translated);
      return translated;
    }
    return text;
  } catch (err) {
    // Fallback to English on error
    return text;
  }
}

/**
 * Translates all DOM elements marked with data-translate="true" attribute.
 * Shows a loading spinner during translation and restores on completion.
 * @param {string} targetLang - BCP-47 language code to translate into
 * @param {string} apiKey - Google Translate API key
 * @returns {Promise<void>}
 */
async function translatePage(targetLang, apiKey) {
  // Target specific marked elements OR common text containers that aren't excluded
  const elements = document.querySelectorAll('[data-translate="true"], h1, h2, h3, h4, h5, p, li, .card-title, .stat-label, .timeline-date, .step-title');
  if (!elements.length) { return; }
  gcpLog('INFO', 'Google Translate API: translating page', { targetLang, elementCount: elements.length });

  // Show translation loading state
  const langBtn = document.getElementById('lang-loading-indicator');
  if (langBtn) { langBtn.style.display = 'inline-block'; }

  const translationPromises = Array.from(elements).map(async (el) => {
    const originalText = el.getAttribute('data-original') || el.textContent.trim();
    // Store original text for future language switches
    if (!el.getAttribute('data-original')) {
      el.setAttribute('data-original', originalText);
    }

    if (targetLang === 'en') {
      // Restore original English text
      requestAnimationFrame(() => { el.textContent = originalText; });
      return;
    }

    const translated = await translateText(originalText, targetLang, apiKey);
    requestAnimationFrame(() => { el.textContent = translated; });
  });

  await Promise.allSettled(translationPromises);

  // Update document language attribute with BCP-47 code for screen readers
  const langMap = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN' };
  document.documentElement.lang = langMap[targetLang] || targetLang;
  document.documentElement.setAttribute('xml:lang', langMap[targetLang] || targetLang);

  // Hide loading indicator
  if (langBtn) { langBtn.style.display = 'none'; }
  gcpLog('INFO', 'Google Translate API: page translation complete', { targetLang });
}

/**
 * Translates an AI-generated response to the specified target language.
 * Used to localize Gemini responses when user has selected a non-English language.
 * @param {string} text - The AI response text in English
 * @param {string} targetLang - Target language code
 * @param {string} apiKey - Google Translate API key
 * @returns {Promise<string>} Translated AI response text
 */
async function translateAIResponse(text, targetLang, apiKey) {
  if (!text || targetLang === 'en') { return text; }
  return translateText(text, targetLang, apiKey);
}

// ============ LANGUAGE METADATA UTILITIES ============

/**
 * Returns the full array of supported language configuration objects.
 * @returns {LanguageConfig[]} Array of supported language config objects
 */
function getSupportedLanguages() {
  return SUPPORTED_LANGUAGE_LIST;
}

/**
 * Returns the display label for a given language code.
 * @param {string} code - Language code (e.g., 'hi')
 * @returns {string} Display name in English, or 'Unknown' if not found
 */
function getLanguageLabel(code) {
  const lang = SUPPORTED_LANGUAGE_LIST.find((l) => l.code === code);
  return lang ? lang.label : 'Unknown';
}

/**
 * Detects the user's browser language and maps it to a supported VoteWise language.
 * Falls back to 'en' if the browser language is not supported.
 * @returns {string} Supported language code ('en', 'hi', 'mr', 'ta', 'te', 'bn')
 */
function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  const langCode = browserLang.split('-')[0].toLowerCase();
  const supported = SUPPORTED_LANGUAGE_LIST.map((l) => l.code);
  return supported.includes(langCode) ? langCode : 'en';
}

// ============ EXPORTS ============

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translateText,
    translatePage,
    translateAIResponse,
    getCachedTranslation,
    setCachedTranslation,
    getSupportedLanguages,
    getLanguageLabel,
    detectBrowserLanguage,
    SUPPORTED_LANGUAGE_LIST,
    TRANSLATE_CACHE_PREFIX
  };
}
