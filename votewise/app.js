/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module app
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Core application logic for VoteWise. Orchestrates all features:
 *              election guide, AI assistant, timeline, eligibility checker,
 *              multilingual support, dashboard, and glossary.
 */

'use strict';

// ============ PERFORMANCE — START MARK ============
performance.mark('votewise-init-start');

// ============ CONSTANTS ============

/**
 * @constant {Object} CONSTANTS - Global application constants
 * @property {number} MAX_INPUT_LENGTH - Maximum user input characters
 * @property {number} GEMINI_MAX_CALLS - Maximum Gemini calls per session
 * @property {number} GEMINI_RATE_LIMIT_MS - Minimum ms between Gemini calls
 * @property {number} CACHE_TTL_MS - Cache time-to-live in milliseconds (5 min)
 * @property {number} CHAT_HISTORY_LIMIT - Max messages kept in chat history
 * @property {number} ELECTION_STEPS_COUNT - Total election guide steps
 * @property {number} GLOSSARY_TERMS_COUNT - Total glossary terms
 * @property {string[]} SUPPORTED_LANGUAGES - Supported language codes
 * @property {string} TRANSLATE_CACHE_KEY - sessionStorage key for translation cache
 * @property {string} TEST_SHORTCUT_KEY - Keyboard key to trigger test runner
 * @property {string} FIREBASE_SESSION_KEY - localStorage key for session ID
 */
const CONSTANTS = {
  MAX_INPUT_LENGTH: 500,
  GEMINI_MAX_CALLS: 30,
  GEMINI_RATE_LIMIT_MS: 2000,
  CACHE_TTL_MS: 300000,
  CHAT_HISTORY_LIMIT: 15,
  ELECTION_STEPS_COUNT: 7,
  GLOSSARY_TERMS_COUNT: 30,
  SUPPORTED_LANGUAGES: ['en', 'hi', 'mr', 'ta', 'te', 'bn'],
  TRANSLATE_CACHE_KEY: 'vw_translate_cache',
  TEST_SHORTCUT_KEY: 'T',
  FIREBASE_SESSION_KEY: 'vw_session_id'
};

// ============ GCP STRUCTURED LOGGING ============

/**
 * Emits a GCP-compatible structured JSON log entry to the console.
 * Used throughout the app instead of plain console.log for observability.
 * @param {string} severity - Log severity level: 'DEBUG'|'INFO'|'WARNING'|'ERROR'
 * @param {string} message - Human-readable log message
 * @param {Object} [data={}] - Additional structured data to attach to the log entry
 * @returns {void}
 */
function gcpLog(severity, message, data = {}) {
  const entry = JSON.stringify({
    severity,
    message,
    timestamp: new Date().toISOString(),
    component: 'votewise-frontend',
    labels: {
      service: 'votewise',
      version: '1.0.0'
    },
    ...data
  });
  if (severity === 'ERROR') {
    console.error(entry); // eslint-disable-line no-console -- structured GCP log fallback
  } else if (severity === 'WARNING') {
    console.warn(entry); // eslint-disable-line no-console -- structured GCP log fallback
  } else {
    console.info(entry); // eslint-disable-line no-console -- structured GCP log fallback
  }
}

// ============ GLOBAL ERROR BOUNDARY ============

/**
 * Global uncaught error handler. Logs errors via gcpLog and shows
 * a user-friendly notice without exposing internal stack traces.
 * @param {ErrorEvent} event - The uncaught error event
 * @returns {void}
 */
window.addEventListener('error', (event) => {
  gcpLog('ERROR', 'Uncaught application error', {
    errorMessage: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
  // Show non-intrusive toast — do not expose stack trace to user
  showToast('Something went wrong. Please refresh the page if the issue persists.', 'error');
});

/**
 * Global unhandled promise rejection handler.
 * @param {PromiseRejectionEvent} event - The rejection event
 * @returns {void}
 */
window.addEventListener('unhandledrejection', (event) => {
  gcpLog('ERROR', 'Unhandled promise rejection', {
    reason: event.reason ? String(event.reason).substring(0, 200) : 'unknown'
  });
  event.preventDefault();
});

// ============ FIREBASE DATA LAYER ============

/**
 * Stores Firebase listener unsubscribe functions for cleanup on page unload.
 * @type {Function[]}
 */
window._firebaseUnsubscribers = [];

/**
 * Initializes Firebase using CONFIG.FIREBASE_CONFIG.
 * Validates config fields before initialization, sets up disconnect handler.
 * @returns {boolean} True if initialization succeeded, false on failure
 */
function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      gcpLog('WARNING', 'Firebase SDK not loaded', {});
      return false;
    }
    const { valid, missing } = typeof validateConfig === 'function'
      ? validateConfig(CONFIG)
      : { valid: true, missing: [] };

    if (!valid) {
      gcpLog('WARNING', 'Firebase config incomplete', { missing });
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
    }

    const db = firebase.database();
    const sessionId = getOrCreateSessionId();
    const sessionRef = db.ref(`/sessions/${sessionId}`);

    // Set disconnect handler to mark session end
    sessionRef.onDisconnect().update({
      disconnectedAt: firebase.database.ServerValue.TIMESTAMP,
      active: false
    });

    gcpLog('INFO', 'Firebase initialized successfully', { sessionId });
    return true;
  } catch (err) {
    gcpLog('ERROR', 'Firebase initialization failed', { error: err.message });
    return false;
  }
}

/**
 * Gets the current session ID from localStorage, or creates a new one.
 * @returns {string} The session ID string
 */
function getOrCreateSessionId() {
  let sessionId = localStorage.getItem(CONSTANTS.FIREBASE_SESSION_KEY);
  if (!sessionId) {
    sessionId = `vw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(CONSTANTS.FIREBASE_SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Increments aggregate usage counters in Firebase Realtime Database /stats/ node.
 * @param {string} event - Event name: 'session_start'|'question_asked'|'language_switch'|'section_viewed'
 * @param {Object} [data={}] - Additional event metadata (e.g., { topic: 'registration' })
 * @returns {Promise<void>}
 */
async function updateFirebaseStats(event, data = {}) {
  if (typeof firebase === 'undefined') { return; }
  try {
    const db = firebase.database();
    const statsRef = db.ref('/stats');

    if (event === 'session_start') {
      await statsRef.child('totalSessions').transaction((c) => (c || 0) + 1);
    } else if (event === 'question_asked') {
      await statsRef.child('totalQuestions').transaction((c) => (c || 0) + 1);
      if (data.topic) {
        await statsRef.child(`popularTopics/${data.topic}`).transaction((c) => (c || 0) + 1);
      }
    } else if (event === 'language_switch') {
      if (data.language) {
        await statsRef.child(`languages/${data.language}`).transaction((c) => (c || 0) + 1);
      }
    } else if (event === 'section_viewed') {
      if (data.section) {
        await statsRef.child(`popularSections/${data.section}`).transaction((c) => (c || 0) + 1);
      }
    }
  } catch (err) {
    gcpLog('WARNING', 'Firebase stats update failed', { error: err.message, event });
  }
}

/**
 * Saves anonymous session analytics data to Firebase Realtime Database.
 * Data is anonymous — no PII is stored.
 * @param {Object} sessionData - Session metrics to persist
 * @param {number} sessionData.questionsAsked - Count of questions asked
 * @param {string} sessionData.language - Current UI language code
 * @param {string} sessionData.state - User's selected Indian state
 * @returns {Promise<void>}
 */
async function saveSessionToFirebase(sessionData) {
  if (typeof firebase === 'undefined') { return; }
  try {
    const db = firebase.database();
    const sessionId = getOrCreateSessionId();
    await db.ref(`/sessions/${sessionId}`).update({
      questionsAsked: sessionData.questionsAsked || 0,
      language: sessionData.language || 'en',
      state: sessionData.state || 'Unknown',
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      active: true
    });
    gcpLog('INFO', 'Session saved to Firebase', { sessionId });
  } catch (err) {
    gcpLog('WARNING', 'Firebase session save failed', { error: err.message });
  }
}

/**
 * Subscribes to the Firebase /stats/ node and calls the callback with live data.
 * Stores the unsubscribe function for cleanup on page unload.
 * @param {Function} callback - Called with the stats snapshot value on each update
 * @returns {void}
 */
function subscribeToStats(callback) {
  if (typeof firebase === 'undefined') { return; }
  try {
    const db = firebase.database();
    const statsRef = db.ref('/stats');
    const unsubscribe = statsRef.on('value', (snapshot) => {
      const data = snapshot.val() || {};
      callback(data);
    });
    // Store unsubscribe reference for cleanup
    window._firebaseUnsubscribers.push(() => statsRef.off('value', unsubscribe));
    gcpLog('INFO', 'Subscribed to Firebase /stats/', {});
  } catch (err) {
    gcpLog('WARNING', 'Firebase stats subscription failed', { error: err.message });
  }
}

/**
 * Cleans up all active Firebase real-time listeners.
 * Called on window.beforeunload to prevent memory leaks.
 * @returns {void}
 */
function cleanupFirebaseListeners() {
  if (window._firebaseUnsubscribers && window._firebaseUnsubscribers.length) {
    window._firebaseUnsubscribers.forEach((unsub) => {
      try { unsub(); } catch (e) { /* ignore cleanup errors */ }
    });
    window._firebaseUnsubscribers = [];
    gcpLog('INFO', 'Firebase listeners cleaned up', {});
  }
}

window.addEventListener('beforeunload', cleanupFirebaseListeners);

// ============ CLOUD FUNCTIONS CLIENT ============

/**
 * Calls the VoteWise Cloud Function `askElectionAI` to get a Gemini-powered
 * answer to an election question. Falls back to direct Gemini API call if
 * the Cloud Function endpoint is unavailable.
 * @param {string} question - The election question to ask
 * @param {string} [language='en'] - Target language code for the response
 * @param {string} [userState='India'] - User's Indian state for context
 * @returns {Promise<{answer: string, language: string, confidence: number}>}
 */
async function callAskElectionAI(question, language = 'en', userState = 'India') {
  const sanitized = (typeof sanitizeInput === 'function')
    ? sanitizeInput(question)
    : question.substring(0, CONSTANTS.MAX_INPUT_LENGTH);

  if (!sanitized || sanitized.length < 3) {
    return { answer: 'Please enter a valid question.', language, confidence: 0 };
  }

  gcpLog('INFO', 'Calling Cloud Function: askElectionAI', {
    questionLength: sanitized.length,
    language,
    userState
  });

  const baseUrl = (typeof CONFIG !== 'undefined' && CONFIG.CLOUD_FUNCTIONS_BASE_URL &&
    CONFIG.CLOUD_FUNCTIONS_BASE_URL !== 'YOUR_CLOUD_FUNCTIONS_URL')
    ? CONFIG.CLOUD_FUNCTIONS_BASE_URL
    : null;

  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/askElectionAI`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: sanitized, language, userState }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`Cloud Function returned ${response.status}`);
      }

      const data = await response.json();

      if (typeof sanitizeCloudFunctionResponse === 'function') {
        const { valid, sanitized: safeData } = sanitizeCloudFunctionResponse(data);
        if (valid) {
          gcpLog('INFO', 'Cloud Function response received', { confidence: safeData.confidence });
          return safeData;
        }
      } else if (data.answer) {
        return data;
      }
    } catch (err) {
      gcpLog('WARNING', 'Cloud Function unavailable, falling back to direct Gemini', {
        error: err.message
      });
    }
  }

  // Fallback: direct Gemini call
  const prompt = `User question about Indian elections (answer in language: ${language}, user state: ${userState}): ${sanitized}`;
  const answer = await callGeminiDirect(prompt, language);
  return { answer, language, confidence: 0.85 };
}

/**
 * Calls the VoteWise Cloud Function `getElectionTimeline` for state-specific
 * election schedule data. Returns a hardcoded fallback timeline if the
 * Cloud Function is unavailable.
 * @param {string} state - Indian state or UT name
 * @param {string} electionType - Election type: 'Lok Sabha'|'Vidhan Sabha'|'Local Body'
 * @returns {Promise<Object>} Election timeline data object
 */
async function callGetElectionTimeline(state, electionType) {
  gcpLog('INFO', 'Calling Cloud Function: getElectionTimeline', { state, electionType });

  const baseUrl = (typeof CONFIG !== 'undefined' && CONFIG.CLOUD_FUNCTIONS_BASE_URL &&
    CONFIG.CLOUD_FUNCTIONS_BASE_URL !== 'YOUR_CLOUD_FUNCTIONS_URL')
    ? CONFIG.CLOUD_FUNCTIONS_BASE_URL
    : null;

  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/getElectionTimeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, electionType }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) { throw new Error(`CF returned ${response.status}`); }
      const data = await response.json();
      if (data.success && data.data) {
        gcpLog('INFO', 'Timeline received from Cloud Function', { state });
        return data.data;
      }
    } catch (err) {
      gcpLog('WARNING', 'Timeline Cloud Function unavailable, using fallback', {
        error: err.message
      });
    }
  }

  // Hardcoded fallback timeline
  return {
    state,
    electionType,
    nextElection: { approximateYear: 2029, phases: electionType === 'Lok Sabha' ? 7 : 1 },
    keyDates: {
      registrationDeadline: 'January 2029 (approx)',
      nominationStart: 'March 2029 (approx)',
      pollingDate: 'April–May 2029 (approx)',
      resultDate: 'June 2029 (approx)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq',
    voterHelpline: '1950'
  };
}

// ============ GEMINI AI LAYER ============

/**
 * In-memory cache for Gemini API responses.
 * Key: first 50 chars of prompt + language. Value: { text, timestamp }
 * @type {Map<string, {text: string, timestamp: number}>}
 */
const geminiCache = new Map();

/**
 * Calls the Gemini API directly from the frontend as a fallback when
 * Cloud Functions are unavailable. Checks cache first, enforces rate limiting.
 * @param {string} prompt - The full prompt to send to Gemini
 * @param {string} [language='en'] - Language hint for the response
 * @returns {Promise<string>} Generated text response from Gemini
 */
async function callGeminiDirect(prompt, language = 'en') {
  // Check rate limiter
  if (typeof rateLimiter !== 'undefined') {
    const { allowed, reason } = rateLimiter.checkAllowed();
    if (!allowed) {
      return reason;
    }
    rateLimiter.recordCall();
  }

  // Check cache
  const cacheKey = `${language}_${prompt.substring(0, 50)}`;
  const cached = geminiCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CONSTANTS.CACHE_TTL_MS) {
    gcpLog('INFO', 'Gemini response served from cache', { cacheKey });
    return cached.text;
  }

  const apiKey = (typeof CONFIG !== 'undefined') ? CONFIG.GEMINI_API_KEY : '';
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    return 'AI assistant is not configured. Please add your Gemini API key to config.js. Visit eci.gov.in for official election information.';
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const systemPrompt = 'You are VoteWise, an expert on Indian elections and the Election Commission of India. Help citizens understand voting processes, their rights, registration steps, and election timelines. Answer in simple, clear language. If asked in Hindi or a regional language, respond in that language. Always cite ECI guidelines when relevant. Keep answers under 4 sentences unless a step-by-step is needed.';

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
      }),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (text) {
      geminiCache.set(cacheKey, { text, timestamp: Date.now() });
      gcpLog('INFO', 'Gemini direct call succeeded', { responseLength: text.length });
    }

    return text || 'I could not generate a response. Please try rephrasing your question.';
  } catch (err) {
    gcpLog('ERROR', 'Gemini direct call failed', { error: err.message });
    return 'AI assistant is temporarily unavailable. Please visit eci.gov.in or call Voter Helpline 1950 for assistance.';
  }
}

/**
 * Builds a context string reflecting the current app state.
 * Injected into Gemini prompts to personalise responses.
 * @returns {string} Context string with current language, state, and session info
 */
function buildElectionContext() {
  const lang = localStorage.getItem('vw_language') || 'en';
  const state = localStorage.getItem('vw_state') || 'India';
  const questionsAsked = parseInt(localStorage.getItem('vw_questions_count') || '0');
  return `[Context: UI language=${lang}, User state=${state}, Questions asked this session=${questionsAsked}]`;
}

/**
 * Calls Gemini to generate a personalised eligibility result message
 * based on the user's eligibility check results and form data.
 * @param {boolean} result - Whether the user is eligible to vote
 * @param {Object} userData - Form data from the eligibility checker
 * @param {string} userData.dob - Date of birth (YYYY-MM-DD)
 * @param {string} userData.state - User's state
 * @param {boolean} userData.isCitizen - Whether user is an Indian citizen
 * @returns {Promise<string>} Personalised message from Gemini
 */
async function generateEligibilityMessage(result, userData) {
  const status = result ? 'ELIGIBLE ✅' : 'NOT ELIGIBLE ❌';
  const context = buildElectionContext();
  const prompt = `${context}
A user just checked their voter eligibility on VoteWise.
Result: ${status}
DOB: ${userData.dob}, State: ${userData.state}, Citizen: ${userData.isCitizen}
Generate a short, encouraging 2-3 sentence personalised message for this result.
If eligible: congratulate them and give the single most important next step.
If not eligible: explain kindly why and what they can do (e.g., wait until 18, register address).
Keep it warm and civic-minded.`;

  return callGeminiDirect(prompt, localStorage.getItem('vw_language') || 'en');
}

// ============ ELECTION GUIDE LOGIC ============

/**
 * @typedef {Object} ElectionStep
 * @property {number} id - Step number (1-7)
 * @property {string} icon - Emoji icon for the step
 * @property {string} title - Step title
 * @property {string} summary - One-line summary
 * @property {string} content - Full HTML content string
 * @property {string} aiQuestion - Pre-filled question for AI assistant
 * @property {boolean} completed - Whether user has marked step as read
 */

/** @type {ElectionStep[]} */
const ELECTION_STEPS = [
  {
    id: 1, icon: '📋', title: 'Check Voter Eligibility',
    summary: 'Find out if you qualify to vote in Indian elections.',
    content: '<p>Before registering, confirm you meet all ECI eligibility criteria:</p><ul><li><strong>Age:</strong> You must be at least 18 years old as of the qualifying date (January 1 of the election year).</li><li><strong>Citizenship:</strong> You must be an Indian citizen. NRIs can also register under the Overseas Voter scheme.</li><li><strong>Residency:</strong> You must be an ordinary resident of the constituency where you wish to register.</li><li><strong>Mental capacity:</strong> You must not have been declared of unsound mind by a competent court.</li><li><strong>Criminal status:</strong> You must not be serving a sentence of imprisonment after conviction of a crime.</li><li><strong>Disqualification:</strong> You must not be disqualified under the Representation of the People Act, 1951.</li></ul><p>Use ECI\'s official eligibility checker at <a href="https://eci.gov.in" target="_blank" rel="noopener">eci.gov.in</a> or call Voter Helpline <strong>1950</strong>.</p>',
    aiQuestion: 'What are the eligibility criteria to vote in India?',
    completed: false
  },
  {
    id: 2, icon: '📝', title: 'Register to Vote — Form 6',
    summary: 'Complete Form 6 online or offline to get on the electoral roll.',
    content: '<p>If you are a first-time voter or have moved to a new constituency, you must register using <strong>Form 6</strong>:</p><ul><li><strong>Online:</strong> Visit <a href="https://www.nvsp.in" target="_blank" rel="noopener">nvsp.in</a> (National Voters\' Service Portal) and fill Form 6 digitally.</li><li><strong>Offline:</strong> Collect Form 6 from your local Electoral Registration Officer (ERO) or Booth Level Officer (BLO).</li><li><strong>Documents needed:</strong> Aadhaar card, address proof (utility bill, rent agreement), recent passport-size photograph.</li><li><strong>Deadline:</strong> Registration cutoff is typically 45 days before the election date — do not wait!</li><li><strong>Verification:</strong> After submission, a BLO may visit your address to verify residence details.</li><li><strong>Status check:</strong> Track your registration status on nvsp.in using your reference number.</li></ul><p>Once registered, your name appears on the Electoral Roll and you receive your EPIC (Voter ID card).</p>',
    aiQuestion: 'How do I register to vote in India using Form 6?',
    completed: false
  },
  {
    id: 3, icon: '🪪', title: 'Get Your Voter ID — EPIC',
    summary: 'Obtain or download your Electronic Photo Identity Card (EPIC).',
    content: '<p>Your <strong>EPIC (Electoral Photo Identity Card)</strong>, commonly called the Voter ID, is your primary proof of voter registration:</p><ul><li><strong>What is EPIC:</strong> It is a government-issued photo ID card issued by the Election Commission of India (ECI) to every registered voter.</li><li><strong>Download e-EPIC:</strong> Download a digital copy from <a href="https://voters.eci.gov.in" target="_blank" rel="noopener">voters.eci.gov.in</a> — it is legally valid and accepted at polling booths.</li><li><strong>Physical card:</strong> A physical EPIC card is posted to your registered address after verification is complete.</li><li><strong>Check Electoral Roll:</strong> Verify your name is on the electoral roll at electoralsearch.eci.gov.in before election day.</li><li><strong>Lost or damaged EPIC:</strong> Apply for a duplicate using Form 002 on the NVSP portal.</li><li><strong>Update details:</strong> Use Form 8 to correct errors or update address/photo on your existing EPIC.</li></ul><p>Even without EPIC, you can vote using 12 alternate government-approved IDs including Aadhaar, PAN card, or Passport.</p>',
    aiQuestion: 'How do I download my e-EPIC voter ID card?',
    completed: false
  },
  {
    id: 4, icon: '🗺️', title: 'Find Your Constituency and Polling Booth',
    summary: 'Locate your parliamentary or assembly constituency and your assigned booth.',
    content: '<p>Understanding your constituency and polling booth is essential for voting:</p><ul><li><strong>Lok Sabha constituency:</strong> India is divided into 543 parliamentary constituencies, each electing one Member of Parliament (MP).</li><li><strong>Vidhan Sabha constituency:</strong> Each state is divided into assembly segments, each electing one Member of Legislative Assembly (MLA).</li><li><strong>Find your constituency:</strong> Check your EPIC card — it shows your constituency name and part number.</li><li><strong>Find your polling booth:</strong> Visit electoralsearch.eci.gov.in, enter your details, and your exact booth number and address will appear.</li><li><strong>What to carry:</strong> Your EPIC card (or any approved alternate ID), booth slip (if issued by political parties), and a copy of your voter slip from ECI.</li><li><strong>Booth hours:</strong> Polling booths are typically open from 7:00 AM to 6:00 PM on election day. Hours may vary by state.</li></ul><p>Call Voter Helpline <strong>1950</strong> if you cannot find your booth or face any difficulty.</p>',
    aiQuestion: 'How do I find my polling booth and constituency in India?',
    completed: false
  },
  {
    id: 5, icon: '🗳️', title: 'How to Vote — EVM and VVPAT',
    summary: 'Step-by-step guide to casting your vote using the Electronic Voting Machine.',
    content: '<p>On election day, here is the complete voting process:</p><ul><li><strong>At the booth:</strong> Show your voter ID to the Presiding Officer. Your name is verified against the electoral roll and your finger is inked with indelible ink.</li><li><strong>Ballot unit:</strong> You will be directed to the EVM (Electronic Voting Machine) ballot unit. Press the blue button next to your chosen candidate\'s name and symbol.</li><li><strong>VVPAT verification:</strong> A VVPAT (Voter Verifiable Paper Audit Trail) machine prints a slip showing your chosen party\'s symbol. Verify it is correct — it is visible for 7 seconds before being cut and stored.</li><li><strong>NOTA option:</strong> If you wish to reject all candidates, press the NOTA (None of the Above) button at the bottom of the EVM ballot unit.</li><li><strong>Vote secrecy:</strong> Your vote is completely secret. Nobody — not even election officials — can know how you voted. This is guaranteed by the Representation of the People Act.</li><li><strong>Mistakes:</strong> If you accidentally press a wrong button before it registers, notify the Presiding Officer immediately. You may be issued a tendered ballot in exceptional cases.</li></ul><p>The entire process takes less than 2 minutes. EVMs are standalone machines with no internet connection — they cannot be hacked remotely.</p>',
    aiQuestion: 'How does the EVM voting machine work and what is VVPAT?',
    completed: false
  },
  {
    id: 6, icon: '📅', title: 'Election Timeline and Phases',
    summary: 'Understand the official election schedule from announcement to result.',
    content: '<p>Indian elections follow a strict constitutional timeline managed by the Election Commission of India:</p><ul><li><strong>Election Announcement:</strong> ECI announces the election schedule — this immediately triggers the <strong>Model Code of Conduct (MCC)</strong> for all political parties and governments.</li><li><strong>Nomination period:</strong> Candidates file nomination papers with the Returning Officer. Nominations are filed within 4–5 days of announcement.</li><li><strong>Scrutiny:</strong> The Returning Officer examines all nominations for eligibility (day after nomination deadline).</li><li><strong>Withdrawal deadline:</strong> Candidates may withdraw their nominations within 2 days after scrutiny.</li><li><strong>Campaign period:</strong> Campaigning runs from announcement to 48 hours before polling (silent period).</li><li><strong>Polling day(s):</strong> For large states, polling is conducted in multiple phases over several weeks. Phase dates are staggered to allow security forces to move between regions.</li><li><strong>Counting and results:</strong> Votes are counted on a single day, typically 1–2 weeks after the last polling phase. Results are usually declared the same day as counting.</li></ul><p>The entire general election process (Lok Sabha) typically spans 6–8 weeks from announcement to result declaration.</p>',
    aiQuestion: 'What is the complete timeline of an Indian election from announcement to result?',
    completed: false
  },
  {
    id: 7, icon: '⚖️', title: 'Your Voting Rights',
    summary: 'Know your legal rights as a voter — including paid holiday and ballot secrecy.',
    content: '<p>As a registered Indian voter, you have important rights protected by law:</p><ul><li><strong>Right to vote:</strong> Every registered citizen aged 18+ has the constitutional right to vote, guaranteed under Article 326 of the Indian Constitution.</li><li><strong>Paid holiday:</strong> Under the Negotiable Instruments Act, your employer is legally required to give you a paid holiday on election day in your constituency. This applies to all employees including contractual workers.</li><li><strong>Ballot secrecy:</strong> Your vote is absolutely secret. No one can compel you to reveal how you voted. Attempting to influence your vote through coercion is a criminal offence under Section 171C of the Indian Penal Code.</li><li><strong>NOTA — Right to reject:</strong> Under Form 49MA and ECI directives, you have the right to reject all candidates by pressing the NOTA button on the EVM. Your vote is still counted as a registered vote.</li><li><strong>Voter harassment:</strong> Booth capturing, voter impersonation, or intimidating voters is a cognizable offence under the Representation of the People Act, 1951. Report immediately to the Presiding Officer or call 1950.</li><li><strong>Right to information:</strong> Candidates must file affidavits disclosing their criminal records, assets, and liabilities. You can access these on the ECI website before voting.</li><li><strong>Grievance redressal:</strong> Lodge election complaints via the cVIGIL app (for MCC violations) or call the Voter Helpline 1950 for any election-related issues.</li></ul>',
    aiQuestion: 'What are my legal rights as a voter in India?',
    completed: false
  }
];

/**
 * Renders all 7 election step cards into the #election-steps-container element.
 * Each card is an expandable accordion with progress tracking and AI integration.
 * Uses requestAnimationFrame for smooth DOM updates and escapeHtml for security.
 * @returns {void}
 */
function renderElectionSteps() {
  const container = document.getElementById('election-steps-container');
  if (!container) { return; }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const html = ELECTION_STEPS.map((step) => `
    <div class="step-card ${step.completed ? 'step-completed' : ''}" id="step-card-${step.id}" role="article" aria-labelledby="step-title-${step.id}">
      <button class="step-header" id="step-btn-${step.id}" aria-expanded="false" aria-controls="step-content-${step.id}" onclick="toggleStep(${step.id})">
        <span class="step-badge" aria-hidden="true">${step.id}</span>
        <span class="step-icon" aria-hidden="true">${step.icon}</span>
        <div class="step-header-text">
          <span class="step-title" id="step-title-${step.id}" data-translate="true" data-original="${esc(step.title)}">${esc(step.title)}</span>
          <span class="step-summary" data-translate="true" data-original="${esc(step.summary)}">${esc(step.summary)}</span>
        </div>
        <span class="step-chevron" aria-hidden="true">▾</span>
        ${step.completed ? '<span class="step-done-badge" aria-label="Completed">✅</span>' : ''}
      </button>
      <div class="step-content" id="step-content-${step.id}" role="region" aria-labelledby="step-btn-${step.id}" hidden>
        <div class="step-content-inner">${step.content}</div>
        <div class="step-actions">
          <button class="btn btn-outline btn-sm" onclick="handleAskAIAboutStep(${step.id})" id="ask-ai-step-${step.id}" aria-label="Ask AI about ${esc(step.title)}">
            🤖 Ask AI about this step
          </button>
          <label class="step-complete-label">
            <input type="checkbox" id="step-check-${step.id}" ${step.completed ? 'checked' : ''} onchange="markStepComplete(${step.id})" aria-label="Mark step ${step.id} as complete">
            Mark as read
          </label>
        </div>
      </div>
    </div>
  `).join('');
  requestAnimationFrame(() => { container.innerHTML = html; });
  gcpLog('INFO', 'Election steps rendered', { count: ELECTION_STEPS.length });
}

/**
 * Toggles the expand/collapse state of a specific step card.
 * Updates aria-expanded, shows/hides content, and marks step as read after 2s.
 * @param {number} stepId - The ID of the step to toggle (1-7)
 * @returns {void}
 */
function toggleStep(stepId) {
  const btn = document.getElementById(`step-btn-${stepId}`);
  const content = document.getElementById(`step-content-${stepId}`);
  const card = document.getElementById(`step-card-${stepId}`);
  if (!btn || !content) { return; }
  const isExpanded = btn.getAttribute('aria-expanded') === 'true';
  requestAnimationFrame(() => {
    btn.setAttribute('aria-expanded', String(!isExpanded));
    if (isExpanded) {
      content.setAttribute('hidden', '');
      card.classList.remove('step-expanded');
    } else {
      content.removeAttribute('hidden');
      card.classList.add('step-expanded');
      // Auto-mark as read after 2 seconds of reading
      setTimeout(() => {
        const step = ELECTION_STEPS.find((s) => s.id === stepId);
        if (step && !step.completed) { markStepComplete(stepId); }
      }, 2000);
    }
  });
  gcpLog('INFO', 'Step toggled', { stepId, expanded: !isExpanded });
}

/**
 * Marks a step as completed, updates the progress bar, and persists to localStorage.
 * @param {number} stepId - The step ID to mark complete
 * @returns {void}
 */
function markStepComplete(stepId) {
  const step = ELECTION_STEPS.find((s) => s.id === stepId);
  if (!step) { return; }
  step.completed = true;
  const card = document.getElementById(`step-card-${stepId}`);
  const checkbox = document.getElementById(`step-check-${stepId}`);
  requestAnimationFrame(() => {
    if (card) { card.classList.add('step-completed'); }
    if (checkbox) { checkbox.checked = true; }
  });
  const progress = ELECTION_STEPS.map((s) => ({ id: s.id, completed: s.completed }));
  localStorage.setItem('vw_step_progress', JSON.stringify(progress));
  updateProgressBar();
  updateFirebaseStats('step_completed', { stepId });
  gcpLog('INFO', 'Step marked complete', { stepId });
}

/**
 * Recalculates and updates the progress bar showing how many steps the user has read.
 * @returns {void}
 */
function updateProgressBar() {
  const total = ELECTION_STEPS.length;
  const completed = ELECTION_STEPS.filter((s) => s.completed).length;
  const pct = Math.round((completed / total) * 100);
  requestAnimationFrame(() => {
    const bar = document.getElementById('progress-bar');
    const text = document.getElementById('progress-text');
    if (bar) { bar.style.width = `${pct}%`; bar.setAttribute('aria-valuenow', pct); }
    if (text) { text.textContent = `You've completed ${completed} of ${total} steps`; }
  });
}

/**
 * Loads saved step progress from localStorage and restores completed states.
 * @returns {void}
 */
function loadStepProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('vw_step_progress') || '[]');
    saved.forEach((s) => {
      const step = ELECTION_STEPS.find((es) => es.id === s.id);
      if (step && s.completed) { step.completed = true; }
    });
  } catch (e) {
    gcpLog('WARNING', 'Failed to load step progress', { error: e.message });
  }
}

/**
 * Opens the AI chat panel and pre-fills the input with a question about the given step.
 * @param {number} stepId - The step ID whose AI question to pre-fill
 * @returns {void}
 */
function handleAskAIAboutStep(stepId) {
  const step = ELECTION_STEPS.find((s) => s.id === stepId);
  if (!step) { return; }
  openChatPanel();
  const input = document.getElementById('chat-input');
  const panelInput = document.getElementById('panel-chat-input');
  if (input) {
    input.value = step.aiQuestion;
    input.focus();
  } else if (panelInput) {
    panelInput.value = step.aiQuestion;
    panelInput.focus();
  }
}

/**
 * Initializes the election guide: renders steps, loads progress, updates bar.
 * @returns {void}
 */
function initElectionGuide() {
  renderElectionSteps();
  loadStepProgress();
  updateProgressBar();
  gcpLog('INFO', 'Election guide initialized', {});
}

// ============ ELIGIBILITY CHECKER ============

/** @type {string[]} - All Indian states and UTs */
const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
  'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli',
  'Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
];

/**
 * Determines voter eligibility based on form data.
 * @param {Object} formData - Form values from eligibility checker
 * @param {string} formData.dob - Date of birth (YYYY-MM-DD)
 * @param {boolean} formData.isCitizen - Whether user is Indian citizen
 * @param {string} formData.state - User's state of residence
 * @param {boolean} formData.hasAddress - Whether user has registered address
 * @param {boolean} formData.isInPrison - Whether user is serving prison sentence
 * @returns {{eligible: boolean, reason: string, nextSteps: string[]}}
 */
function checkEligibility(formData) {
  const { dob, isCitizen, state, hasAddress, isInPrison } = formData;
  const dobValidation = typeof validateDOB === 'function' ? validateDOB(dob) : { valid: !!dob, reason: '' };
  if (!dobValidation.valid) {
    return { eligible: false, reason: dobValidation.reason, nextSteps: ['Please provide a valid date of birth.'] };
  }
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) { age--; }
  if (age < 18) {
    const eligible18 = new Date(birthDate);
    eligible18.setFullYear(birthDate.getFullYear() + 18);
    return {
      eligible: false,
      reason: `You must be 18 years old to vote. You will be eligible from ${eligible18.toDateString()}.`,
      nextSteps: ['Set a reminder to register when you turn 18.', 'Visit nvsp.in to register as soon as you are eligible.']
    };
  }
  if (!isCitizen) {
    return {
      eligible: false,
      reason: 'Only Indian citizens are eligible to vote in Indian elections.',
      nextSteps: ['If you are an OCI or PIO holder, you are not eligible for domestic elections.', 'For citizenship queries, contact the Ministry of Home Affairs.']
    };
  }
  if (!hasAddress) {
    return {
      eligible: false,
      reason: 'You must have a registered residential address in India to vote.',
      nextSteps: ['Establish a permanent address in your constituency.', 'Collect address proof (utility bill, rent agreement) and then register using Form 6.']
    };
  }
  if (isInPrison) {
    return {
      eligible: false,
      reason: 'Persons serving a prison sentence after conviction are not eligible to vote.',
      nextSteps: ['Your voting rights are restored upon completion of your sentence.', 'Re-register on the electoral roll after release.']
    };
  }
  return {
    eligible: true,
    reason: `You are eligible to vote in ${state || 'your state'}! 🎉`,
    nextSteps: [
      'Register on the electoral roll at nvsp.in using Form 6.',
      'Download your e-EPIC voter ID from voters.eci.gov.in.',
      'Find your polling booth at electoralsearch.eci.gov.in.',
      'Add your election date to your calendar using VoteWise!'
    ]
  };
}

/**
 * Renders the eligibility result into #eligibility-result.
 * Shows green card for eligible, red for not eligible, with AI-personalised message.
 * @param {{eligible: boolean, reason: string, nextSteps: string[]}} result
 * @param {Object} formData - Original form data for AI message generation
 * @returns {Promise<void>}
 */
async function renderEligibilityResult(result, formData) {
  const container = document.getElementById('eligibility-result');
  if (!container) { return; }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const stepsHtml = result.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('');
  const cardClass = result.eligible ? 'eligibility-eligible' : 'eligibility-ineligible';
  const icon = result.eligible ? '✅' : '❌';
  requestAnimationFrame(() => {
    container.innerHTML = `
      <div class="eligibility-result-card ${cardClass}" role="alert" aria-live="polite">
        <div class="eligibility-result-header">
          <span class="eligibility-icon" aria-hidden="true">${icon}</span>
          <h3 class="eligibility-result-title">${result.eligible ? 'You Are Eligible to Vote!' : 'Not Yet Eligible'}</h3>
        </div>
        <p class="eligibility-reason">${esc(result.reason)}</p>
        ${result.nextSteps.length ? `<div class="eligibility-next-steps"><h4>Next Steps:</h4><ul>${stepsHtml}</ul></div>` : ''}
        <div id="eligibility-ai-message" class="eligibility-ai-message" aria-live="polite">
          <span class="ai-loading">🤖 Generating personalised message…</span>
        </div>
      </div>`;
    container.removeAttribute('hidden');
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  // Fetch and display AI personalised message
  try {
    const aiMsg = await generateEligibilityMessage(result.eligible, formData);
    const aiDiv = document.getElementById('eligibility-ai-message');
    requestAnimationFrame(() => {
      if (aiDiv) { aiDiv.innerHTML = `<p class="ai-message-text">🤖 <em>${esc(aiMsg)}</em></p>`; }
    });
  } catch (e) {
    gcpLog('WARNING', 'AI eligibility message failed', { error: e.message });
  }
}

/** @type {number|null} - Debounce timer for eligibility submit */
let eligibilityDebounceTimer = null;

/**
 * Handles eligibility form submission with 300ms debounce.
 * Sanitizes all inputs, validates, checks eligibility, and renders result.
 * @returns {void}
 */
function handleEligibilitySubmit() {
  clearTimeout(eligibilityDebounceTimer);
  eligibilityDebounceTimer = setTimeout(async () => {
    const dob = document.getElementById('elig-dob')?.value || '';
    const isCitizen = document.getElementById('elig-citizen')?.value === 'yes';
    const state = document.getElementById('elig-state')?.value || '';
    const hasAddress = document.getElementById('elig-address')?.value === 'yes';
    const isInPrison = document.getElementById('elig-prison')?.value === 'yes';
    const sSanitize = typeof sanitizeInput === 'function' ? sanitizeInput : (s) => s;
    const sanitizedState = sSanitize(state);
    const validState = typeof validateStateCode === 'function' ? validateStateCode(sanitizedState) : true;
    if (!validState && sanitizedState) {
      showToast('Please select a valid Indian state.', 'warning');
      return;
    }
    const formData = { dob, isCitizen, state: sanitizedState, hasAddress, isInPrison };
    const result = checkEligibility(formData);
    gcpLog('INFO', 'Eligibility check performed', { eligible: result.eligible, state: sanitizedState });
    await renderEligibilityResult(result, formData);
    updateFirebaseStats('eligibility_check', { eligible: result.eligible });
    localStorage.setItem('vw_state', sanitizedState);
  }, 300);
}

/**
 * Initializes the eligibility checker by populating the state dropdown
 * and attaching the submit button event listener.
 * @returns {void}
 */
function initEligibilityChecker() {
  const stateSelect = document.getElementById('elig-state');
  if (stateSelect) {
    INDIAN_STATES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      stateSelect.appendChild(opt);
    });
  }
  const submitBtn = document.getElementById('elig-submit');
  if (submitBtn) { submitBtn.addEventListener('click', handleEligibilitySubmit); }
  const form = document.getElementById('eligibility-form');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); handleEligibilitySubmit(); });
  }
  gcpLog('INFO', 'Eligibility checker initialized', {});
}

// ============ TIMELINE MANAGER ============

/** @type {Object} - Local fallback election timeline data keyed by state name */
const ELECTION_TIMELINE_DATA = {
  'Maharashtra': {
    nextElectionYear: 2029, electionType: 'Lok Sabha',
    phases: [
      { phase: 1, month: 'April 2029' }, { phase: 2, month: 'May 2029' }
    ],
    keyDates: {
      registrationDeadline: '45 days before polling date',
      nominationStart: '28 days before polling date',
      pollingDate: 'April–May 2029 (approximate)',
      resultDate: 'June 2029 (approximate)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'Delhi': {
    nextElectionYear: 2025, electionType: 'Vidhan Sabha',
    phases: [{ phase: 1, month: 'February 2025' }],
    keyDates: {
      registrationDeadline: 'January 15, 2025',
      nominationStart: 'January 18, 2025',
      pollingDate: 'February 5, 2025',
      resultDate: 'February 8, 2025'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'Bihar': {
    nextElectionYear: 2025, electionType: 'Vidhan Sabha',
    phases: [
      { phase: 1, month: 'October 2025' }, { phase: 2, month: 'October 2025' },
      { phase: 3, month: 'November 2025' }
    ],
    keyDates: {
      registrationDeadline: 'September 2025 (approx)',
      nominationStart: 'September 2025 (approx)',
      pollingDate: 'October–November 2025',
      resultDate: 'November 2025'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'Tamil Nadu': {
    nextElectionYear: 2026, electionType: 'Vidhan Sabha',
    phases: [{ phase: 1, month: 'April 2026' }],
    keyDates: {
      registrationDeadline: 'March 2026 (approx)',
      nominationStart: 'March 2026 (approx)',
      pollingDate: 'April 2026 (approx)',
      resultDate: 'May 2026 (approx)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'West Bengal': {
    nextElectionYear: 2026, electionType: 'Vidhan Sabha',
    phases: [
      { phase: 1, month: 'March 2026' }, { phase: 2, month: 'April 2026' },
      { phase: 3, month: 'April 2026' }, { phase: 4, month: 'April 2026' },
      { phase: 5, month: 'April 2026' }, { phase: 6, month: 'April 2026' },
      { phase: 7, month: 'May 2026' }, { phase: 8, month: 'May 2026' }
    ],
    keyDates: {
      registrationDeadline: 'February 2026 (approx)',
      nominationStart: 'February 2026 (approx)',
      pollingDate: 'March–May 2026 (8 phases)',
      resultDate: 'May 2026 (approx)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'Uttar Pradesh': {
    nextElectionYear: 2027, electionType: 'Vidhan Sabha',
    phases: [
      { phase: 1, month: 'February 2027' }, { phase: 2, month: 'February 2027' },
      { phase: 3, month: 'February 2027' }, { phase: 4, month: 'February 2027' },
      { phase: 5, month: 'March 2027' }, { phase: 6, month: 'March 2027' },
      { phase: 7, month: 'March 2027' }
    ],
    keyDates: {
      registrationDeadline: 'January 2027 (approx)',
      nominationStart: 'January 2027 (approx)',
      pollingDate: 'February–March 2027 (7 phases)',
      resultDate: 'March 2027 (approx)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  },
  'default': {
    nextElectionYear: 2029, electionType: 'Lok Sabha',
    phases: [
      { phase: 1, month: 'April 2029' }, { phase: 2, month: 'April 2029' },
      { phase: 3, month: 'May 2029' }, { phase: 4, month: 'May 2029' },
      { phase: 5, month: 'May 2029' }, { phase: 6, month: 'May 2029' },
      { phase: 7, month: 'June 2029' }
    ],
    keyDates: {
      registrationDeadline: '45 days before polling',
      nominationStart: '28 days before polling',
      pollingDate: 'April–June 2029 (approximate)',
      resultDate: 'June 2029 (approximate)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq'
  }
};

/**
 * Loads election timeline for a state — tries Cloud Function first, falls back to local data.
 * @param {string} state - Indian state name
 * @param {string} electionType - 'Lok Sabha'|'Vidhan Sabha'|'Local Body'
 * @returns {Promise<Object>} Timeline data object
 */
async function loadTimeline(state, electionType) {
  try {
    const cfData = await callGetElectionTimeline(state, electionType);
    if (cfData && cfData.keyDates) { return cfData; }
  } catch (e) {
    gcpLog('WARNING', 'CF timeline failed, using local', { error: e.message });
  }
  return ELECTION_TIMELINE_DATA[state] || ELECTION_TIMELINE_DATA['default'];
}

/**
 * Renders the election timeline as a horizontal stepper with date cards.
 * Each date card has an "Add to Calendar" button via calendar.js.
 * @param {Object} timeline - Timeline data object from loadTimeline
 * @param {string} state - Selected state name for display
 * @returns {void}
 */
function renderTimeline(timeline, state) {
  const container = document.getElementById('timeline-container');
  if (!container) { return; }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const phases = timeline.phases || [];
  const phasesHtml = phases.map((p, i) => `
    <div class="timeline-step ${i === 0 ? 'timeline-step-active' : ''}">
      <div class="timeline-node" aria-label="Phase ${p.phase}">
        <span class="timeline-phase-num">${p.phase}</span>
      </div>
      <div class="timeline-label">
        <span class="timeline-phase-title">Phase ${p.phase}</span>
        <span class="timeline-phase-date">${esc(p.month || '')}</span>
      </div>
    </div>
    ${i < phases.length - 1 ? '<div class="timeline-connector" aria-hidden="true"></div>' : ''}
  `).join('');

  const kd = timeline.keyDates || {};
  const keyDateEntries = [
    { label: '📋 Registration Deadline', date: kd.registrationDeadline, key: 'registration' },
    { label: '📄 Nomination Start', date: kd.nominationStart, key: 'nomination' },
    { label: '🗳️ Polling Date', date: kd.pollingDate, key: 'polling' },
    { label: '📊 Result Declaration', date: kd.resultDate, key: 'result' }
  ];

  const dateCardsHtml = keyDateEntries.map((entry) => `
    <div class="timeline-date-card" id="timeline-card-${entry.key}">
      <div class="timeline-date-label">${esc(entry.label)}</div>
      <div class="timeline-date-value">${esc(entry.date || 'TBA')}</div>
      <button class="btn btn-outline btn-sm timeline-cal-btn"
        onclick='addToGoogleCalendar({title:"🗳️ ${esc(entry.label)} - ${esc(state)}",startDate:"${timeline.nextElectionYear || 2029}-04-01",description:"${esc(entry.label)} for ${esc(state)} elections."})'
        aria-label="Add ${esc(entry.label)} to Google Calendar">
        📅 Add to Calendar
      </button>
    </div>
  `).join('');

  const nextYear = timeline.nextElectionYear || 2029;
  requestAnimationFrame(() => {
    container.innerHTML = `
      <h3 class="timeline-heading">🗺️ Election Timeline — ${esc(state)}</h3>
      <p class="timeline-subheading">Approximate schedule for ${esc(timeline.electionType || 'Next Election')} ${nextYear}</p>
      <div class="timeline-stepper" role="list" aria-label="Election phases">${phasesHtml}</div>
      <div class="timeline-date-cards">${dateCardsHtml}</div>
      <div class="timeline-footer">
        <a href="${esc(timeline.eciFaqUrl || 'https://eci.gov.in')}" target="_blank" rel="noopener" class="btn btn-outline">
          🔗 Official ECI Info
        </a>
      </div>`;
    gcpLog('INFO', 'Timeline rendered', { state, phases: phases.length });
  });
}

/** @type {number|null} - Countdown interval reference */
let countdownInterval = null;

/**
 * Renders a live countdown timer showing days until the target election date.
 * Updates every minute via setInterval.
 * @param {string} targetDate - Target date string (YYYY-MM-DD or descriptive)
 * @returns {void}
 */
function renderCountdown(targetDate) {
  const el = document.getElementById('election-countdown');
  if (!el) { return; }
  if (countdownInterval) { clearInterval(countdownInterval); }
  const target = new Date(targetDate);
  if (isNaN(target.getTime())) {
    el.textContent = 'Election date to be announced by ECI';
    return;
  }
  const update = () => {
    const now = new Date();
    const diff = target - now;
    if (diff <= 0) { el.textContent = 'Election day is here! 🗳️'; clearInterval(countdownInterval); return; }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    el.textContent = `⏳ ${days} days, ${hours} hours until next election`;
  };
  update();
  countdownInterval = setInterval(update, 60000);
}

/** @type {number|null} - Debounce timer for state change */
let timelineDebounceTimer = null;

/**
 * Handles state/election-type dropdown change — debounced 300ms.
 * Loads and renders timeline for selected state.
 * @returns {void}
 */
function handleStateChange() {
  clearTimeout(timelineDebounceTimer);
  timelineDebounceTimer = setTimeout(async () => {
    const state = document.getElementById('timeline-state')?.value || 'Maharashtra';
    const electionType = document.getElementById('timeline-type')?.value || 'Lok Sabha';
    localStorage.setItem('vw_state', state);
    const timeline = await loadTimeline(state, electionType);
    renderTimeline(timeline, state);
    const year = timeline.nextElectionYear || 2029;
    renderCountdown(`${year}-04-15`);
    updateFirebaseStats('timeline_viewed', { state, electionType });
    gcpLog('INFO', 'Timeline state changed', { state, electionType });
  }, 300);
}

/**
 * Initializes the timeline manager: populates dropdowns, loads default timeline.
 * @returns {void}
 */
function initTimelineManager() {
  const stateSelect = document.getElementById('timeline-state');
  if (stateSelect) {
    const allStates = Object.keys(ELECTION_TIMELINE_DATA).filter((k) => k !== 'default');
    INDIAN_STATES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (s === 'Maharashtra') { opt.selected = true; }
      stateSelect.appendChild(opt);
    });
    stateSelect.addEventListener('change', handleStateChange);
  }
  const typeSelect = document.getElementById('timeline-type');
  if (typeSelect) { typeSelect.addEventListener('change', handleStateChange); }
  loadTimeline('Maharashtra', 'Lok Sabha').then((t) => {
    renderTimeline(t, 'Maharashtra');
    renderCountdown(`${t.nextElectionYear || 2029}-04-15`);
  });
  gcpLog('INFO', 'Timeline manager initialized', {});
}

// ============ GLOSSARY ENGINE ============

/**
 * @typedef {Object} GlossaryTerm
 * @property {string} term - The election term name
 * @property {string} definition - Short 1-2 sentence definition
 * @property {string} category - Category: 'process'|'institution'|'document'|'law'
 */

/** @type {GlossaryTerm[]} */
const GLOSSARY_TERMS = [
  { term: 'ECI', definition: 'Election Commission of India — the constitutional body responsible for administering elections in India. Established under Article 324 of the Constitution.', category: 'institution' },
  { term: 'EPIC', definition: 'Electoral Photo Identity Card — the official voter ID card issued by ECI to every registered voter. Also available as a downloadable e-EPIC.', category: 'document' },
  { term: 'EVM', definition: 'Electronic Voting Machine — a standalone electronic device used to cast and count votes in Indian elections. EVMs are not connected to the internet and cannot be remotely tampered with.', category: 'process' },
  { term: 'VVPAT', definition: 'Voter Verifiable Paper Audit Trail — a machine attached to the EVM that prints a paper slip showing the voter\'s chosen party symbol for 7 seconds, allowing voters to verify their choice.', category: 'process' },
  { term: 'NOTA', definition: 'None of the Above — an option on the EVM ballot that allows voters to reject all candidates. Introduced by the Supreme Court in 2013 via Form 49MA.', category: 'process' },
  { term: 'Form 6', definition: 'The application form for new voter registration in India. Filed at the local Electoral Registration Officer or online via nvsp.in.', category: 'document' },
  { term: 'NVSP', definition: 'National Voters\' Service Portal (nvsp.in) — the official ECI portal for voter registration, EPIC download, electoral roll search, and election-related services.', category: 'institution' },
  { term: 'MCC', definition: 'Model Code of Conduct — a set of guidelines issued by ECI that governs the conduct of political parties and candidates from the date of election announcement until results.', category: 'law' },
  { term: 'Constituency', definition: 'A geographical unit that elects one representative. Lok Sabha has 543 constituencies (parliamentary). Each state\'s assembly has Vidhan Sabha constituencies.', category: 'process' },
  { term: 'Lok Sabha', definition: 'The lower house of India\'s Parliament, also called the House of the People. It has 543 elected members who serve 5-year terms. The Lok Sabha exercises supreme legislative authority.', category: 'institution' },
  { term: 'Vidhan Sabha', definition: 'The lower house (legislative assembly) of each Indian state. Members are elected directly by voters in the state\'s assembly constituencies for a 5-year term.', category: 'institution' },
  { term: 'Rajya Sabha', definition: 'The upper house of India\'s Parliament, known as the Council of States. Members are elected by state legislative assemblies and serve 6-year terms. Not directly elected by citizens.', category: 'institution' },
  { term: 'Returning Officer', definition: 'The district-level government official appointed by ECI to oversee and administer elections in a specific constituency, including accepting nominations and declaring results.', category: 'institution' },
  { term: 'Nomination', definition: 'The formal process by which a candidate declares their intention to contest an election by filing a nomination paper (with a security deposit) before the Returning Officer.', category: 'process' },
  { term: 'Scrutiny', definition: 'The examination of nomination papers by the Returning Officer to verify that all legal requirements are met and the candidate is eligible to contest the election.', category: 'process' },
  { term: 'Affidavit', definition: 'A sworn legal declaration filed by every election candidate disclosing their criminal record, assets, liabilities, and educational qualifications. Publicly available on ECI website.', category: 'document' },
  { term: 'Exit Poll', definition: 'A survey conducted with voters immediately after they leave polling booths to gauge voting patterns. Exit polls cannot be published until the last phase of voting ends.', category: 'process' },
  { term: 'Electoral Roll', definition: 'The official list of all registered voters in a constituency, maintained and updated by ECI. Also called the voters\' list. Your name must appear here to vote.', category: 'document' },
  { term: 'Delimitation', definition: 'The process of redrawing the boundaries of electoral constituencies based on census population data. Carried out by the Delimitation Commission periodically.', category: 'process' },
  { term: 'By-election', definition: 'An election held to fill a single vacant seat in Parliament or a state legislature between general elections, caused by death, resignation, or disqualification of the sitting member.', category: 'process' },
  { term: 'Hung Parliament', definition: 'A situation where no single party or pre-election coalition wins a majority of seats (272+ in Lok Sabha). Leads to coalition negotiations and potential President\'s Rule.', category: 'law' },
  { term: 'Confidence Vote', definition: 'A vote in the legislature to determine whether the government retains the confidence (majority support) of elected members. Losing a confidence vote can bring down the government.', category: 'law' },
  { term: 'Whip', definition: 'A directive issued by a political party to its legislators instructing them how to vote on a particular bill or motion. Defying a whip can lead to disqualification under anti-defection law.', category: 'law' },
  { term: 'Anti-Defection Law', definition: 'Enshrined in the Tenth Schedule of the Constitution, this law disqualifies a legislator who switches political parties or defies their party whip without permission.', category: 'law' },
  { term: 'President\'s Rule', definition: 'Also called Article 356 — the takeover of a state government by the Central Government when constitutional governance breaks down in the state. The Governor administers the state.', category: 'law' },
  { term: 'Booth Capturing', definition: 'The illegal act of seizing control of a polling booth by force, stuffing ballot boxes, or preventing legitimate voters from casting their votes. A serious cognizable offence.', category: 'law' },
  { term: 'Postal Ballot', definition: 'A facility allowing certain voters (military personnel, election officials on duty, senior citizens, disabled voters) to cast their vote by post without physically visiting the booth.', category: 'process' },
  { term: 'Overseas Voter', definition: 'An Indian citizen living abroad (NRI) who can register as an overseas voter in their home constituency and vote in person when visiting India on election day.', category: 'process' },
  { term: 'Form 49MA', definition: 'The legal provision that governs the NOTA option on EVMs. It was introduced following a 2013 Supreme Court judgement allowing voters to formally reject all candidates.', category: 'document' },
  { term: 'Model Code of Conduct', definition: 'A comprehensive set of ECI guidelines covering election campaign conduct, party manifestos, use of government resources, and official announcements. Comes into force immediately upon election schedule announcement.', category: 'law' }
];

/**
 * Renders glossary term cards into #glossary-container.
 * Each card has term name, category badge, definition, and Ask AI button.
 * @param {GlossaryTerm[]} terms - Array of glossary terms to render
 * @returns {void}
 */
function renderGlossary(terms) {
  const container = document.getElementById('glossary-container');
  if (!container) { return; }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  if (!terms.length) {
    requestAnimationFrame(() => { container.innerHTML = '<p class="glossary-empty">No terms found. Try a different search.</p>'; });
    return;
  }
  const html = terms.map((t) => `
    <div class="glossary-card" id="glossary-term-${esc(t.term.replace(/\s+/g, '-').toLowerCase())}">
      <div class="glossary-card-header">
        <h3 class="glossary-term-name">${esc(t.term)}</h3>
        <span class="glossary-category-badge glossary-cat-${esc(t.category)}">${esc(t.category)}</span>
      </div>
      <p class="glossary-definition">${esc(t.definition)}</p>
      <button class="btn btn-outline btn-sm" onclick="handleAskAIAboutTerm('${esc(t.term)}')" aria-label="Ask AI more about ${esc(t.term)}">
        🤖 Ask AI more about this
      </button>
    </div>
  `).join('');
  requestAnimationFrame(() => {
    container.innerHTML = html;
    const countEl = document.getElementById('glossary-count');
    if (countEl) { countEl.textContent = `Showing ${terms.length} of ${GLOSSARY_TERMS.length} terms`; }
  });
}

/** @type {number|null} - Debounce timer for glossary search */
let glossaryDebounceTimer = null;

/**
 * Filters glossary terms by search query (case-insensitive, matches term and definition).
 * Debounced by 200ms. Calls renderGlossary with filtered results.
 * @param {string} query - Search query string
 * @returns {void}
 */
function filterGlossary(query) {
  clearTimeout(glossaryDebounceTimer);
  glossaryDebounceTimer = setTimeout(() => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? GLOSSARY_TERMS.filter((t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q))
      : GLOSSARY_TERMS;
    renderGlossary(filtered);
  }, 200);
}

/**
 * Filters glossary terms by the first letter of the term name.
 * @param {string} letter - Single uppercase letter for alphabetical filtering
 * @returns {void}
 */
function filterGlossaryByLetter(letter) {
  const filtered = letter === 'ALL'
    ? GLOSSARY_TERMS
    : GLOSSARY_TERMS.filter((t) => t.term.toUpperCase().startsWith(letter));
  renderGlossary(filtered);
  // Clear search input when filtering by letter
  const searchInput = document.getElementById('glossary-search');
  if (searchInput) { searchInput.value = ''; }
}

/**
 * Opens the AI chat panel and pre-fills it with a question about a glossary term.
 * @param {string} term - The glossary term to ask about
 * @returns {void}
 */
function handleAskAIAboutTerm(term) {
  openChatPanel();
  const input = document.getElementById('chat-input');
  const panelInput = document.getElementById('panel-chat-input');
  const msg = `Explain "${term}" in simple terms as it relates to Indian elections.`;
  if (input) {
    input.value = msg;
    input.focus();
  } else if (panelInput) {
    panelInput.value = msg;
    panelInput.focus();
  }
  gcpLog('INFO', 'Ask AI about glossary term', { term });
}

/**
 * Initializes the glossary: renders all terms, attaches search listener,
 * generates A-Z index buttons, and attaches letter filter listeners.
 * @returns {void}
 */
function initGlossary() {
  renderGlossary(GLOSSARY_TERMS);
  const searchInput = document.getElementById('glossary-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterGlossary(e.target.value));
  }
  // Build A-Z index
  const azContainer = document.getElementById('glossary-az-index');
  if (azContainer) {
    const letters = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
    const azHtml = letters.map((l) => `
      <button class="az-btn" onclick="filterGlossaryByLetter('${l}')" aria-label="Filter by letter ${l}">${l}</button>
    `).join('');
    azContainer.innerHTML = azHtml;
  }
  gcpLog('INFO', 'Glossary initialized', { termCount: GLOSSARY_TERMS.length });
}

// ============ UI & RENDERING LAYER ============

/** @type {Set<string>} - Tracks which tabs have been initialized */
const initializedTabs = new Set();

/**
 * Initializes tab navigation for all 6 VoteWise tabs.
 * Implements lazy initialization — charts only render when stats tab is first opened.
 * Saves active tab to localStorage and restores on reload.
 * @returns {void}
 */
function initTabs() {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  /**
   * Activates a tab and its corresponding panel.
   * @param {string} tabId - The tab ID to activate
   */
  function activateTab(tabId) {
    tabs.forEach((t) => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle('tab-active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });
    panels.forEach((p) => {
      const isActive = p.id === `panel-${tabId}`;
      p.classList.toggle('panel-active', isActive);
      p.setAttribute('aria-hidden', String(!isActive));
      if (isActive) { p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
    });
    localStorage.setItem('vw_active_tab', tabId);
    // Lazy init
    if (!initializedTabs.has(tabId)) {
      initializedTabs.add(tabId);
      if (tabId === 'stats') {
        setTimeout(() => {
          if (typeof renderTurnoutDonut === 'function') { renderTurnoutDonut('chart-donut'); }
          if (typeof renderStateRegistrationBar === 'function') { renderStateRegistrationBar('chart-bar'); }
          if (typeof renderHistoricalTurnoutLine === 'function') { renderHistoricalTurnoutLine('chart-line'); }
          if (typeof renderPhaseScheduleColumn === 'function') { renderPhaseScheduleColumn('chart-column'); }
          if (typeof generateUsageReport === 'function') { generateUsageReport(); }
        }, 100);
      }
    }
    gcpLog('INFO', 'Tab activated', { tabId });
    updateFirebaseStats('section_viewed', { section: tabId });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(tab.dataset.tab); }
    });
  });

  // Restore saved tab or default to guide
  const savedTab = localStorage.getItem('vw_active_tab') || 'guide';
  activateTab(savedTab);
}

/**
 * Initializes dark mode based on localStorage preference.
 * Attaches toggle listener to #dark-mode-toggle button.
 * @returns {void}
 */
function initDarkMode() {
  const isDark = localStorage.getItem('vw_dark_mode') === 'true';
  document.body.classList.toggle('dark-mode', isDark);
  const btn = document.getElementById('dark-mode-toggle');
  if (btn) {
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.addEventListener('click', () => {
      const nowDark = document.body.classList.toggle('dark-mode');
      localStorage.setItem('vw_dark_mode', String(nowDark));
      btn.setAttribute('aria-label', nowDark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.textContent = nowDark ? '☀️' : '🌙';
      gcpLog('INFO', 'Dark mode toggled', { isDark: nowDark });
    });
  }
}

/**
 * Initializes the language switcher buttons in the header.
 * On language selection: calls translatePage, saves preference, updates button states.
 * Debounced at 500ms to avoid rapid API calls.
 * @returns {void}
 */
function initLanguageSwitcher() {
  const langBtns = document.querySelectorAll('[data-lang]');
  let langSwitchTimer = null;

  langBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      clearTimeout(langSwitchTimer);
      langSwitchTimer = setTimeout(async () => {
        const lang = btn.dataset.lang;
        if (!lang || (typeof validateLanguageCode === 'function' && !validateLanguageCode(lang))) { return; }
        // Update button states
        langBtns.forEach((b) => {
          b.classList.toggle('lang-active', b.dataset.lang === lang);
          b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
        });
        localStorage.setItem('vw_language', lang);
        gcpLog('INFO', 'Language switched', { language: lang });
        updateFirebaseStats('language_switch', { language: lang });
        showToast(`Language changed to ${lang.toUpperCase()}`, 'info');
        // Translate page content
        const apiKey = (typeof CONFIG !== 'undefined') ? CONFIG.TRANSLATE_API_KEY : '';
        if (typeof translatePage === 'function') {
          await translatePage(lang, apiKey);
        }
      }, 500);
    });
  });

  // Set initial active state from saved preference
  const savedLang = localStorage.getItem('vw_language') || 'en';
  langBtns.forEach((b) => {
    b.classList.toggle('lang-active', b.dataset.lang === savedLang);
    b.setAttribute('aria-pressed', String(b.dataset.lang === savedLang));
  });
}

/**
 * Shows a non-blocking toast notification to the user.
 * @param {string} message - The message to display in the toast
 * @param {'success'|'error'|'info'|'warning'} [type='info'] - Toast style type
 * @returns {void}
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) { return; }
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span aria-hidden="true">${icons[type] || 'ℹ️'}</span> ${esc(message)}`;
  requestAnimationFrame(() => {
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-visible'); }, 10);
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => { if (toast.parentNode) { toast.parentNode.removeChild(toast); } }, 300);
    }, 3000);
  });
}

/**
 * Shows a loading spinner inside a DOM element, preserving its original content.
 * Sets aria-busy="true" for accessibility.
 * @param {string} elementId - ID of the element to show loading state in
 * @returns {string} The original innerHTML before showing spinner
 */
function showLoading(elementId) {
  const el = document.getElementById(elementId);
  if (!el) { return ''; }
  const original = el.innerHTML;
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = '<span class="spinner" aria-label="Loading" role="status"></span>';
  return original;
}

/**
 * Hides the loading spinner and restores original content to a DOM element.
 * @param {string} elementId - ID of the element to restore
 * @param {string} originalContent - The original innerHTML to restore
 * @returns {void}
 */
function hideLoading(elementId, originalContent) {
  const el = document.getElementById(elementId);
  if (!el) { return; }
  el.setAttribute('aria-busy', 'false');
  el.innerHTML = originalContent || '';
}

/**
 * Initializes the Share button using the Web Share API with clipboard fallback.
 * @returns {void}
 */
function initShareButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) { return; }
  btn.addEventListener('click', async () => {
    const shareData = {
      title: 'VoteWise — AI Election Literacy Assistant',
      text: 'Learn everything about Indian elections with AI! Check out VoteWise.',
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        gcpLog('INFO', 'Page shared via Web Share API', {});
      } else {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard!', 'success');
        gcpLog('INFO', 'URL copied to clipboard', {});
      }
    } catch (err) {
      gcpLog('WARNING', 'Share failed', { error: err.message });
    }
  });
}

/**
 * Initializes global keyboard shortcuts:
 * - Ctrl+Shift+T: Run test suite
 * - Ctrl+Shift+D: Toggle dark mode
 * @returns {void}
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === CONSTANTS.TEST_SHORTCUT_KEY) {
      e.preventDefault();
      gcpLog('INFO', 'Test shortcut triggered', {});
      runTestSuite();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      gcpLog('INFO', 'Dark mode shortcut triggered', {});
      document.getElementById('dark-mode-toggle')?.click();
    }
    if (e.key === 'Escape') {
      if (isChatOpen) { closeChat(); }
      const modal = document.getElementById('test-modal');
      if (modal && !modal.hasAttribute('hidden')) { modal.setAttribute('hidden', ''); }
    }
  });
  gcpLog('INFO', 'Keyboard shortcuts initialized', {});
}

/**
 * Traps keyboard focus within a given element (e.g., modal or chat panel).
 * Cycles Tab and Shift+Tab through all focusable elements inside the container.
 * @param {HTMLElement} element - The container element to trap focus within
 * @returns {Function} Cleanup function to remove the event listener
 */
function trapFocus(element) {
  const focusable = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) { return () => {}; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  const handler = (e) => {
    if (e.key !== 'Tab') { return; }
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  element.addEventListener('keydown', handler);
  return () => element.removeEventListener('keydown', handler);
}

/**
 * Initializes the skip-to-main-content accessibility link.
 * Ensures clicking #skip-link moves focus to #main-content.
 * @returns {void}
 */
function initSkipLink() {
  const skipLink = document.getElementById('skip-link');
  const main = document.getElementById('main-content');
  if (skipLink && main) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      main.setAttribute('tabindex', '-1');
      main.focus();
    });
  }
}

// ============ AI CHAT ASSISTANT ============

/** @type {Array<{role: string, content: string}>} - Chat conversation history */
let chatHistory = [];

/** @type {boolean} - Whether the chat panel is currently open */
let isChatOpen = false;

/** @type {boolean} - Whether the AI is currently generating a response */
let isTyping = false;

/** @type {Function|null} - Cleanup fn for chat focus trap */
let chatFocusTrapCleanup = null;

/**
 * @constant {string[]} QUICK_QUESTIONS - Pre-filled quick question options for the chat.
 */
const QUICK_QUESTIONS = [
  'Am I eligible to vote?',
  'How do I register online?',
  'What is NOTA?',
  'What documents do I need on election day?',
  'Explain EVM in simple terms',
  'What is the Model Code of Conduct?',
  'How do I find my polling booth?'
];

/** @type {boolean} - Whether quick questions have been rendered */
let quickQuestionsRendered = false;

/**
 * Opens the AI chat panel, sets aria attributes, traps focus, renders quick questions.
 * @returns {void}
 */
function openChatPanel() {
  isChatOpen = true;
  const panel = document.getElementById('chat-panel');
  const fab = document.getElementById('chat-fab');
  if (panel) {
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
    chatFocusTrapCleanup = trapFocus(panel);
    if (!quickQuestionsRendered) { renderQuickQuestions(); quickQuestionsRendered = true; }
    setTimeout(() => { document.getElementById('chat-input')?.focus(); }, 100);
  }
  if (fab) { fab.setAttribute('aria-expanded', 'true'); }
  gcpLog('INFO', 'Chat panel opened', {});
}

// Alias used by election steps and glossary
const openChat = openChatPanel;

/**
 * Closes the AI chat panel and returns focus to the FAB button.
 * @returns {void}
 */
function closeChat() {
  isChatOpen = false;
  const panel = document.getElementById('chat-panel');
  const fab = document.getElementById('chat-fab');
  if (panel) {
    panel.setAttribute('hidden', '');
    panel.setAttribute('aria-hidden', 'true');
    if (chatFocusTrapCleanup) { chatFocusTrapCleanup(); chatFocusTrapCleanup = null; }
  }
  if (fab) { fab.setAttribute('aria-expanded', 'false'); fab.focus(); }
  gcpLog('INFO', 'Chat panel closed', {});
}

/**
 * Toggles the chat panel open/closed.
 * @returns {void}
 */
function toggleChat() {
  if (isChatOpen) { closeChat(); } else { openChatPanel(); }
}

/**
 * Renders the QUICK_QUESTIONS array as clickable chip buttons in the chat panel.
 * Chips pre-fill and send a question when clicked.
 * @returns {void}
 */
function renderQuickQuestions() {
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const html = QUICK_QUESTIONS.map((q) => `
    <button class="quick-question-chip" onclick="sendChatMessage('${esc(q)}')" aria-label="Ask: ${esc(q)}">
      ${esc(q)}
    </button>
  `).join('');

  const container = document.getElementById('quick-questions-container');
  const panelContainer = document.getElementById('panel-quick-questions');
  
  requestAnimationFrame(() => { 
    if (container) { container.innerHTML = html; }
    if (panelContainer) { panelContainer.innerHTML = html; }
  });
}

/**
 * Appends a chat message to the #chat-history element.
 * User messages appear right-aligned; assistant messages left-aligned with a Copy button.
 * Trims chatHistory to CONSTANTS.CHAT_HISTORY_LIMIT.
 * @param {'user'|'assistant'} role - Message sender role
 * @param {string} content - Message text content
 * @returns {void}
 */
function appendChatMessage(role, content) {
  chatHistory.push({ role, content });
  if (chatHistory.length > CONSTANTS.CHAT_HISTORY_LIMIT) {
    chatHistory = chatHistory.slice(-CONSTANTS.CHAT_HISTORY_LIMIT);
  }

  const isUser = role === 'user';
  const msgId = `msg-${Date.now()}`;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;

  /**
   * Simple markdown parser for bold and line breaks.
   * Applied after HTML escaping for security.
   */
  const formatMarkdown = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold: **text** -> <b>text</b>
      .replace(/\*(.*?)\*/g, '<i>$1</i>')   // Italics: *text* -> <i>text</i>
      .replace(/\n/g, '<br>');               // Newlines -> <br>
  };
  
  const copyBtn = role === 'assistant'
    ? '<button class="chat-copy-btn" onclick="navigator.clipboard.writeText(this.closest(\'.chat-message\').querySelector(\'.chat-content\').innerText).then(()=>showToast(\'Copied!\',\'success\'))" aria-label="Copy response">📋</button>'
    : '';

  const html = `
    <div class="chat-message chat-${role}" id="${msgId}" role="article" aria-label="${isUser ? 'Your question' : 'VoteWise answer'}">
      <div class="chat-avatar" aria-hidden="true">${isUser ? '👤' : '🗳️'}</div>
      <div class="chat-bubble">
        <p class="chat-content">${formatMarkdown(esc(content))}</p>
        ${copyBtn}
      </div>
    </div>`;

  const container = document.getElementById('chat-history');
  const panelContainer = document.getElementById('panel-chat-history');

  requestAnimationFrame(() => {
    if (container) {
      container.insertAdjacentHTML('beforeend', html);
      container.scrollTop = container.scrollHeight;
    }
    if (panelContainer) {
      panelContainer.insertAdjacentHTML('beforeend', html);
      panelContainer.scrollTop = panelContainer.scrollHeight;
    }
  });
}

/**
 * Shows an animated typing indicator (3 bouncing dots) in the chat history.
 * @returns {void}
 */
function showTypingIndicator() {
  isTyping = true;
  const indicator = document.createElement('div');
  indicator.id = 'typing-indicator';
  indicator.className = 'chat-message chat-assistant typing-indicator';
  indicator.setAttribute('aria-label', 'VoteWise is thinking');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = `
    <div class="chat-avatar" aria-hidden="true">🗳️</div>
    <div class="chat-bubble typing-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>`;
  const indicatorHtml = indicator.outerHTML;

  const historyEl = document.getElementById('chat-history');
  const panelHistoryEl = document.getElementById('panel-chat-history');

  requestAnimationFrame(() => {
    if (historyEl) {
      historyEl.insertAdjacentHTML('beforeend', indicatorHtml);
      historyEl.scrollTop = historyEl.scrollHeight;
    }
    if (panelHistoryEl) {
      panelHistoryEl.insertAdjacentHTML('beforeend', indicatorHtml);
      panelHistoryEl.scrollTop = panelHistoryEl.scrollHeight;
    }
  });
}

/**
 * Removes the typing indicator from the chat history.
 * @returns {void}
 */
function hideTypingIndicator() {
  isTyping = false;
  requestAnimationFrame(() => {
    const indicators = document.querySelectorAll('.typing-indicator');
    indicators.forEach(ind => ind.remove());
  });
}

/** @type {number|null} - Debounce timer for chat input */
let chatDebounceTimer = null;

/**
 * Main function to send a chat message to the AI assistant.
 * Sanitizes input, shows typing indicator, calls Cloud Function or Gemini,
 * appends response, updates Firebase stats. Handles rate limiting and errors.
 * @param {string} [question] - Optional question text; if not provided, reads from input field
 * @returns {Promise<void>}
 */
async function sendChatMessage(question) {
  if (isTyping) { return; }
  const inputEl = document.getElementById('chat-input');
  const panelInputEl = document.getElementById('panel-chat-input');
  
  let rawInput = question;
  if (!rawInput) {
    if (inputEl && inputEl.value.trim()) {
      rawInput = inputEl.value;
    } else if (panelInputEl && panelInputEl.value.trim()) {
      rawInput = panelInputEl.value;
    } else {
      rawInput = '';
    }
  }

  const sanitized = typeof sanitizeInput === 'function'
    ? sanitizeInput(rawInput)
    : rawInput.substring(0, CONSTANTS.MAX_INPUT_LENGTH);

  if (!sanitized || sanitized.trim().length < 2) {
    showToast('Please enter a question.', 'warning');
    return;
  }

  const sendBtn = document.getElementById('chat-send');
  const panelSendBtn = document.getElementById('panel-chat-send');
  const originalBtnContent = sendBtn ? sendBtn.innerHTML : (panelSendBtn ? panelSendBtn.innerHTML : '➤');
  
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="spinner"></span>'; }
  if (panelSendBtn) { panelSendBtn.disabled = true; panelSendBtn.innerHTML = '<span class="spinner"></span>'; }
  if (inputEl) { inputEl.value = ''; }
  if (panelInputEl) { panelInputEl.value = ''; }

  appendChatMessage('user', sanitized);
  showTypingIndicator();

  const language = localStorage.getItem('vw_language') || 'en';
  const state = document.getElementById('timeline-state')?.value || 'India';

  gcpLog('INFO', 'Chat message sent', { length: sanitized.length, language, state });

  try {
    const response = await callAskElectionAI(sanitized, language, state);
    hideTypingIndicator();
    const answer = (response && response.answer) ? response.answer : 'Sorry, I could not get an answer. Please try again.';
    appendChatMessage('assistant', answer);

    const count = parseInt(localStorage.getItem('vw_questions_count') || '0') + 1;
    localStorage.setItem('vw_questions_count', String(count));
    updateFirebaseStats('question_asked', { topic: 'general' });
  } catch (err) {
    hideTypingIndicator();
    appendChatMessage('assistant', 'I encountered an error. Please check your connection or visit eci.gov.in for official information.');
    gcpLog('ERROR', 'Chat message failed', { error: err.message });
  } finally {
    hideTypingIndicator();
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalBtnContent; }
    if (panelSendBtn) { panelSendBtn.disabled = false; panelSendBtn.innerHTML = originalBtnContent; }
  }
}

/**
 * Handles keydown events on the chat input field.
 * Sends message on Enter (without Shift). Debounced at 150ms.
 * @param {KeyboardEvent} event - The keyboard event from the input field
 * @returns {void}
 */
function handleChatKeypress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    clearTimeout(chatDebounceTimer);
    chatDebounceTimer = setTimeout(() => { sendChatMessage(); }, 150);
  }
}

/**
 * Initializes the AI chat assistant — attaches all event listeners.
 * @returns {void}
 */
function initChatAssistant() {
  const fab = document.getElementById('chat-fab');
  const closeBtn = document.getElementById('chat-close');
  
  const sendBtn = document.getElementById('chat-send');
  const inputEl = document.getElementById('chat-input');
  
  const panelSendBtn = document.getElementById('panel-chat-send');
  const panelInputEl = document.getElementById('panel-chat-input');

  if (fab) { fab.addEventListener('click', toggleChat); }
  if (closeBtn) { closeBtn.addEventListener('click', closeChat); }
  
  if (sendBtn) { sendBtn.addEventListener('click', () => sendChatMessage()); }
  if (inputEl) { inputEl.addEventListener('keydown', handleChatKeypress); }
  
  if (panelSendBtn) { panelSendBtn.addEventListener('click', () => sendChatMessage()); }
  if (panelInputEl) { panelInputEl.addEventListener('keydown', handleChatKeypress); }

  renderQuickQuestions();
  quickQuestionsRendered = true;
  gcpLog('INFO', 'Chat assistant initialized', {});
}

// ============ TEST SUITE RUNNER ============

/**
 * Dynamically loads and runs the VoteWise test suite.
 * Renders results in a modal overlay with pass/fail statistics.
 * Falls back to console output if module import fails.
 * @returns {Promise<void>}
 */
async function runTestSuite() {
  gcpLog('INFO', 'Test suite triggered via keyboard shortcut', {});
  showToast('Running test suite...', 'info');
  try {
    // Attempt dynamic import of test module
    const testModule = await import('./tests/votewise.test.js').catch(() => null);
    if (testModule && typeof testModule.runAllTests === 'function') {
      const results = testModule.runAllTests();
      showTestModal(results);
    } else {
      // Run inline tests if import unavailable
      const inlineResults = runInlineTests();
      showTestModal(inlineResults);
    }
  } catch (err) {
    gcpLog('WARNING', 'Test module import failed, running inline', { error: err.message });
    const inlineResults = runInlineTests();
    showTestModal(inlineResults);
  }
}

/**
 * Runs a minimal inline test set as fallback when the test module cannot be imported.
 * @returns {{total: number, passed: number, failed: number, suites: Object[]}}
 */
function runInlineTests() {
  const suites = [];
  let totalPassed = 0;
  let totalFailed = 0;

  const run = (suiteName, tests) => {
    let passed = 0; let failed = 0;
    tests.forEach(({ name, fn }) => {
      try { fn(); passed++; totalPassed++; }
      catch (e) { failed++; totalFailed++; }
    });
    suites.push({ name: suiteName, passed, failed, total: passed + failed });
  };

  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => s;
  const san = typeof sanitizeInput === 'function' ? sanitizeInput : (s) => s;

  run('Input Sanitization', [
    { name: 'strips HTML tags', fn: () => { if (san('<script>xss</script>').includes('<script>')) { throw new Error(); } } },
    { name: 'limits to 500 chars', fn: () => { if (san('a'.repeat(600)).length > 500) { throw new Error(); } } },
    { name: 'returns empty for non-string', fn: () => { if (san(null) !== '') { throw new Error(); } } }
  ]);
  run('HTML Escaping', [
    { name: 'escapes ampersand', fn: () => { if (!esc('&').includes('&amp;')) { throw new Error(); } } },
    { name: 'escapes less-than', fn: () => { if (!esc('<').includes('&lt;')) { throw new Error(); } } }
  ]);
  run('Eligibility Checker', [
    { name: 'rejects age under 18', fn: () => {
      const r = checkEligibility({ dob: '2020-01-01', isCitizen: true, state: 'Maharashtra', hasAddress: true, isInPrison: false });
      if (r.eligible) { throw new Error(); }
    }},
    { name: 'approves valid voter', fn: () => {
      const r = checkEligibility({ dob: '1990-01-01', isCitizen: true, state: 'Maharashtra', hasAddress: true, isInPrison: false });
      if (!r.eligible) { throw new Error(); }
    }}
  ]);
  const results = { total: totalPassed + totalFailed, passed: totalPassed, failed: totalFailed, suites };
  localStorage.setItem('votewise_test_results', JSON.stringify(results));
  return results;
}

/**
 * Creates and displays a modal overlay showing test suite results.
 * Includes a summary table with suite-level pass/fail counts.
 * @param {{total: number, passed: number, failed: number, suites: Object[]}} results - Test results
 * @returns {void}
 */
function showTestModal(results) {
  const existing = document.getElementById('test-modal');
  if (existing) { existing.parentNode.removeChild(existing); }

  const pct = results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0;
  const statusColor = pct >= 80 ? '#2E7D32' : pct >= 60 ? '#FF6F00' : '#C62828';
  const rowsHtml = (results.suites || []).map((s) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${s.name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;color:#2E7D32">${s.passed}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;color:#C62828">${s.failed}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${s.total}</td>
    </tr>`).join('');

  const modal = document.createElement('div');
  modal.id = 'test-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'test-modal-title');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h2 id="test-modal-title" style="margin:0;color:#1A237E;font-size:1.4rem">🧪 VoteWise Test Results</h2>
        <button onclick="document.getElementById('test-modal').remove()" aria-label="Close test results" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#616161">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;text-align:center">
        <div style="background:#F3F4F6;border-radius:8px;padding:16px">
          <div style="font-size:2rem;font-weight:700;color:#1A237E">${results.total}</div>
          <div style="color:#616161;font-size:0.85rem">Total Tests</div>
        </div>
        <div style="background:#E8F5E9;border-radius:8px;padding:16px">
          <div style="font-size:2rem;font-weight:700;color:#2E7D32">${results.passed}</div>
          <div style="color:#616161;font-size:0.85rem">Passed</div>
        </div>
        <div style="background:${results.failed > 0 ? '#FFEBEE' : '#E8F5E9'};border-radius:8px;padding:16px">
          <div style="font-size:2rem;font-weight:700;color:${results.failed > 0 ? '#C62828' : '#2E7D32'}">${results.failed}</div>
          <div style="color:#616161;font-size:0.85rem">Failed</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:2.5rem;font-weight:800;color:${statusColor}">${pct}%</div>
        <div style="color:#616161">Pass Rate</div>
      </div>
      ${rowsHtml ? `<table style="width:100%;border-collapse:collapse;font-size:0.9rem">
        <thead><tr style="background:#F3F4F6">
          <th style="padding:8px 12px;text-align:left">Suite</th>
          <th style="padding:8px 12px;text-align:center;color:#2E7D32">Passed</th>
          <th style="padding:8px 12px;text-align:center;color:#C62828">Failed</th>
          <th style="padding:8px 12px;text-align:center">Total</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>` : ''}
      <p style="margin-top:16px;color:#9E9E9E;font-size:0.8rem;text-align:center">Press Escape or click ✕ to close</p>
    </div>`;
  document.body.appendChild(modal);
  trapFocus(modal);
  modal.querySelector('button').focus();
  gcpLog('INFO', 'Test modal shown', { total: results.total, passed: results.passed, pct });
}

// ============ INITIALIZATION ============

/**
 * Callback for Firebase stats subscription — updates live stat counters in the UI.
 * @param {Object} statsData - Stats snapshot from Firebase /stats/ node
 * @returns {void}
 */
function renderLiveStats(statsData) {
  requestAnimationFrame(() => {
    const visitorEl = document.getElementById('live-visitor-count');
    const questionsEl = document.getElementById('total-questions-count');
    const sessionsEl = document.getElementById('total-sessions-count');
    if (visitorEl && statsData.totalSessions) {
      visitorEl.textContent = statsData.totalSessions.toLocaleString('en-IN');
    }
    if (questionsEl && statsData.totalQuestions) {
      questionsEl.textContent = statsData.totalQuestions.toLocaleString('en-IN');
    }
    if (sessionsEl && statsData.totalSessions) {
      sessionsEl.textContent = statsData.totalSessions.toLocaleString('en-IN');
    }
  });
}

/**
 * Main application initialization function.
 * Orchestrates all module inits in dependency order with full error handling.
 * Records performance timing from votewise-init-start to votewise-init-end.
 * @returns {Promise<void>}
 */
async function initApp() {
  try {
    gcpLog('INFO', 'VoteWise app initializing', { version: '1.0.0' });

    // 1. Firebase
    initFirebase();

    // 2. Detect and apply saved language
    const savedLang = localStorage.getItem('vw_language') ||
      (typeof detectBrowserLanguage === 'function' ? detectBrowserLanguage() : 'en');
    localStorage.setItem('vw_language', savedLang);

    // 3. Accessibility
    initSkipLink();

    // 4. Theme
    initDarkMode();

    // 5. Navigation
    initTabs();

    // 6. Language switcher
    initLanguageSwitcher();

    // 7. Share button
    initShareButton();

    // 8. Keyboard shortcuts
    initKeyboardShortcuts();

    // 9. Election guide
    initElectionGuide();

    // 10. Eligibility checker
    initEligibilityChecker();

    // 11. Timeline manager
    initTimelineManager();

    // 12. Glossary
    initGlossary();

    // 13. Chat assistant
    initChatAssistant();

    // 14. Restore step progress
    loadStepProgress();
    updateProgressBar();

    // 15. Firebase live stats subscription
    subscribeToStats(renderLiveStats);

    // 16. Save session to Firebase
    await saveSessionToFirebase({
      language: savedLang,
      timestamp: Date.now(),
      questionsAsked: 0
    });
    updateFirebaseStats('session_start');

    // 17. Performance measurement
    performance.mark('votewise-init-end');
    performance.measure('votewise-init', 'votewise-init-start', 'votewise-init-end');
    const measures = performance.getEntriesByName('votewise-init');
    const initDuration = measures.length ? Math.round(measures[0].duration) : 0;

    gcpLog('INFO', 'VoteWise app initialized successfully', {
      initDurationMs: initDuration,
      language: savedLang,
      version: '1.0.0'
    });

    showToast('VoteWise loaded successfully! 🗳️', 'success');

  } catch (err) {
    gcpLog('ERROR', 'App initialization failed', { error: err.message });
    showToast('App loaded with reduced functionality. Some features may be unavailable.', 'warning');
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', initApp);

// ============ TEST SHORTCUT ============

/**
 * Global keyboard shortcut handler for test suite and dark mode.
 * Ctrl+Shift+T → run tests | Ctrl+Shift+D → toggle dark mode
 */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === CONSTANTS.TEST_SHORTCUT_KEY) {
    e.preventDefault();
    runTestSuite();
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    document.getElementById('dark-mode-toggle')?.click();
  }
});
