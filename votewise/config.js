/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module config
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Central configuration object for VoteWise application.
 *              Contains API keys, Firebase config, and app settings.
 *              This file is intentionally NOT in .gitignore per hackathon requirements.
 */

/**
 * @typedef {Object} FirebaseConfig
 * @property {string} apiKey - Firebase API key
 * @property {string} authDomain - Firebase auth domain
 * @property {string} projectId - Firebase project ID
 * @property {string} databaseURL - Firebase Realtime Database URL
 * @property {string} storageBucket - Firebase storage bucket
 * @property {string} messagingSenderId - Firebase messaging sender ID
 * @property {string} appId - Firebase app ID
 */

/**
 * @typedef {Object} AppConfig
 * @property {string} name - Application name
 * @property {string} version - Application version
 * @property {string} defaultLanguage - Default language code
 * @property {string[]} supportedLanguages - Array of supported language codes
 */

/**
 * @typedef {Object} VoteWiseConfig
 * @property {string} GEMINI_API_KEY - Gemini API key
 * @property {string} MAPS_API_KEY - Google Maps API key
 * @property {string} TRANSLATE_API_KEY - Google Translate API key
 * @property {FirebaseConfig} FIREBASE_CONFIG - Firebase configuration object
 * @property {string} CLOUD_FUNCTIONS_BASE_URL - Base URL for Cloud Functions
 * @property {string} CONFIG_VERSION - Configuration version
 * @property {boolean} DEBUG_MODE - Debug mode flag
 * @property {AppConfig} APP - Application metadata
 */

/** @type {VoteWiseConfig} */
const CONFIG = {
  GEMINI_API_KEY: 'AIzaSyCGNaJwGEVtiJu-Hxuo81EPrjKrOhp2qkA',
  MAPS_API_KEY: '', // Google Maps Static API — optional feature, key provisioned at deployment
  TRANSLATE_API_KEY: 'AIzaSyCOPPcQ4FzERvCFfAQKcmUHPXrQvKOTl9w',
  FIREBASE_CONFIG: {
    apiKey: 'AIzaSyDINj-jzvocknugDIn9g-rnnc59KDAwkTg',
    authDomain: 'promptwars-virtual-493517.firebaseapp.com',
    databaseURL: 'https://promptwars-virtual-493517-default-rtdb.firebaseio.com',
    projectId: 'promptwars-virtual-493517',
    storageBucket: 'promptwars-virtual-493517.firebasestorage.app',
    messagingSenderId: '1056518431797',
    appId: '1:1056518431797:web:fee8ff9ce41bb8ba82fd7c',
    measurementId: 'G-52XQC8NQGJ'
  },
  CLOUD_FUNCTIONS_BASE_URL: 'https://asia-south1-promptwars-virtual-493517.cloudfunctions.net',
  CONFIG_VERSION: '1.0.2',
  CONFIG_DESCRIPTION: 'VoteWise — AI-powered election literacy assistant. Gemini 2.5 Flash + Firebase + Cloud Functions.',
  DEBUG_MODE: false,
  APP: {
    name: 'VoteWise',
    version: '1.0.0',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'hi', 'mr', 'ta', 'te', 'bn']
  }
};
