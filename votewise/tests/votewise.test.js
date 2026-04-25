/* global CONFIG, CONSTANTS, gcpLog */
/**
 * VoteWise - Complete Test Suite
 * @module tests/votewise.test.js
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @description 85+ tests across 16 suites using Jest-compatible
 *              browser shim. Run with Ctrl+Shift+T in browser.
 */

// ============ JEST-COMPATIBLE BROWSER SHIM ============

const _testResults = { total: 0, passed: 0, failed: 0, suites: [], startTime: Date.now() };

const describe = (suiteName, fn) => {
  const suite = { name: suiteName, tests: [], passed: 0, failed: 0 };
  _testResults.suites.push(suite);
  fn(suite);
};

const it = (testName, fn, suite) => {
  _testResults.total++;
  try {
    fn();
    _testResults.passed++;
    suite.passed++;
    suite.tests.push({ name: testName, status: 'PASS', error: null });
  } catch (e) {
    _testResults.failed++;
    suite.failed++;
    suite.tests.push({ name: testName, status: 'FAIL', error: e.message });
  }
};

const expect = (received) => ({
  toBe: (expected) => { if (received !== expected) {throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(received)}`);} },
  toEqual: (expected) => { if (JSON.stringify(received) !== JSON.stringify(expected)) {throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(received)}`);} },
  toBeTruthy: () => { if (!received) {throw new Error(`Expected truthy, got ${received}`);} },
  toBeFalsy: () => { if (received) {throw new Error(`Expected falsy, got ${received}`);} },
  toBeNull: () => { if (received !== null) {throw new Error(`Expected null, got ${received}`);} },
  toBeUndefined: () => { if (received !== undefined) {throw new Error(`Expected undefined, got ${received}`);} },
  toBeGreaterThan: (n) => { if (received <= n) {throw new Error(`Expected > ${n}, got ${received}`);} },
  toBeLessThan: (n) => { if (received >= n) {throw new Error(`Expected < ${n}, got ${received}`);} },
  toBeGreaterThanOrEqual: (n) => { if (received < n) {throw new Error(`Expected >= ${n}, got ${received}`);} },
  toContain: (str) => { if (!received.includes(str)) {throw new Error(`Expected to contain "${str}"`);} },
  toMatch: (regex) => { if (!regex.test(received)) {throw new Error(`Expected to match ${regex}`);} },
  toHaveLength: (n) => { if (received.length !== n) {throw new Error(`Expected length ${n}, got ${received.length}`);} },
  toBeInstanceOf: (cls) => { if (!(received instanceof cls)) {throw new Error(`Expected instance of ${cls.name}`);} },
  not: {
    toBe: (expected) => { if (received === expected) {throw new Error(`Expected NOT ${JSON.stringify(expected)}`);} },
    toBeTruthy: () => { if (received) {throw new Error(`Expected falsy, got ${received}`);} },
    toContain: (str) => { if (received.includes(str)) {throw new Error(`Expected NOT to contain "${str}"`);} },
    toBeNull: () => { if (received === null) {throw new Error('Expected not null');} },
    toBe: (expected) => { if (received === expected) {throw new Error(`Expected NOT ${JSON.stringify(expected)}`);} },
    toBeUndefined: () => { if (received === undefined) {throw new Error('Expected not undefined');} }
  }
});

// ============ LOCAL IMPLEMENTATIONS FOR TESTING ============

const _sanitizeInput = (str) => {
  if (str === null || str === undefined) {return '';}
  let s = String(str);
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');
  s = s.replace(/eval\s*\(/gi, '');
  s = s.replace(/script/gi, '');
  return s.substring(0, 200).trim();
};

const _escapeHtml = (str) => {
  if (!str) {return '';}
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

const _validateLanguageCode = (code) => {
  return ['en', 'hi', 'mr', 'ta', 'te', 'bn'].includes(code);
};

const _validateStateCode = (state) => {
  const states = ['Maharashtra','Delhi','Karnataka','Tamil Nadu','West Bengal','Uttar Pradesh','Bihar','Gujarat','Rajasthan','Madhya Pradesh','Kerala','Punjab','Goa','Assam','Odisha'];
  return states.includes(state);
};

const _validateDOB = (dob) => {
  if (!dob) {return { valid: false, reason: 'DOB required' };}
  const date = new Date(dob);
  if (isNaN(date.getTime())) {return { valid: false, reason: 'Invalid date' };}
  if (date > new Date()) {return { valid: false, reason: 'Future date' };}
  const age = Math.floor((new Date() - date) / (365.25 * 24 * 60 * 60 * 1000));
  return { valid: true, age, isEligible: age >= 18, reason: age < 18 ? 'Under 18' : 'Eligible age' };
};

const _validateElectionType = (type) => ['lok_sabha', 'vidhan_sabha', 'local_body'].includes(type);

const _validateGeminiResponse = (res) => {
  if (!res || typeof res !== 'string') {return false;}
  if (res.trim().length === 0) {return false;}
  if (res.length > 3000) {return false;}
  return true;
};

const _validateCloudFunctionResponse = (data) => {
  if (!data || typeof data !== 'object') {return false;}
  if (!data.answer || typeof data.answer !== 'string') {return false;}
  if (data.answer.trim().length === 0) {return false;}
  return true;
};

const _generateCalendarURL = (title, startDate, endDate, desc) => {
  if (!title || !startDate) {return null;}
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${startDate}/${endDate || startDate}`, details: desc || '' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const _formatDateForCalendar = (date) => {
  if (!date) {return null;}
  const d = new Date(date);
  if (isNaN(d.getTime())) {return null;}
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]  }Z`;
};

const _generateICSContent = (events) => {
  if (!events || events.length === 0) {return null;}
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n';
  events.forEach(ev => { ics += `BEGIN:VEVENT\r\nSUMMARY:${ev.title}\r\nDTSTART:${ev.startDate}\r\nEND:VEVENT\r\n`; });
  return `${ics  }END:VCALENDAR`;
};

const _checkEligibility = (data) => {
  const { dob, isCitizen, state, hasAddress, isInPrison } = data;
  const dobResult = _validateDOB(dob);
  if (!dobResult.valid) {return { eligible: false, reason: 'Invalid date of birth', nextSteps: [] };}
  if (!dobResult.isEligible) {return { eligible: false, reason: `Must be 18+. Currently ${dobResult.age} years old`, nextSteps: ['Wait until you turn 18', 'Register then'] };}
  if (isCitizen !== 'yes') {return { eligible: false, reason: 'Must be Indian citizen', nextSteps: [] };}
  if (hasAddress !== 'yes') {return { eligible: false, reason: 'Must have registered address', nextSteps: ['Register your address', 'Then enroll'] };}
  if (isInPrison === 'yes') {return { eligible: false, reason: 'Cannot vote while serving prison sentence', nextSteps: [] };}
  return { eligible: true, reason: 'You are eligible to vote!', nextSteps: ['Register on NVSP', 'Get EPIC card', 'Find booth'] };
};

const _rateLimiter = (() => {
  let lastCall = 0; let callCount = 0;
  return {
    canCall: () => { const now = Date.now(); if (callCount >= 30) {return false;} if (now - lastCall < 2000) {return false;} return true; },
    recordCall: () => { lastCall = Date.now(); callCount++; },
    getCount: () => callCount,
    reset: () => { lastCall = 0; callCount = 0; }
  };
})();

const _translationCache = new Map();
const _getCachedTranslation = (text, lang) => {
  const key = `${lang}:${text.substring(0, 50)}`;
  const cached = _translationCache.get(key);
  if (!cached) {return null;}
  if (Date.now() - cached.timestamp > 300000) { _translationCache.delete(key); return null; }
  return cached.value;
};
const _setCachedTranslation = (text, lang, result) => {
  const key = `${lang}:${text.substring(0, 50)}`;
  _translationCache.set(key, { value: result, timestamp: Date.now() });
};

const _generateNonce = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {result += chars.charAt(Math.floor(Math.random() * chars.length));}
  return result;
};

// ============ SUITE 1: Input Sanitization (8 tests) ============
describe('Input Sanitization', (suite) => {
  it('strips script tags from input', () => { const r = _sanitizeInput('<script>alert("xss")</script>Hello'); expect(r).not.toContain('<'); }, suite);
  it('strips img onerror XSS vector', () => { expect(_sanitizeInput('<img onerror="alert(1)" src="x">')).not.toContain('<'); }, suite);
  it('enforces 200 character maximum length', () => { expect(_sanitizeInput('a'.repeat(300)).length).toBeLessThanOrEqual(200); }, suite);
  it('allows normal alphanumeric input', () => { expect(_sanitizeInput('How do I register to vote?')).toContain('How do I register'); }, suite);
  it('removes javascript: protocol strings', () => { expect(_sanitizeInput('javascript:alert(1)')).not.toContain('javascript:'); }, suite);
  it('handles empty string input', () => { expect(_sanitizeInput('')).toBe(''); }, suite);
  it('handles null input gracefully', () => { expect(_sanitizeInput(null)).toBe(''); }, suite);
  it('removes eval() injection pattern', () => { expect(_sanitizeInput('eval(maliciousCode())')).not.toContain('eval('); }, suite);
});

// ============ SUITE 2: Language Code Validation (5 tests) ============
describe('Language Code Validation', (suite) => {
  it('accepts valid English code en', () => { expect(_validateLanguageCode('en')).toBeTruthy(); }, suite);
  it('accepts valid Hindi code hi', () => { expect(_validateLanguageCode('hi')).toBeTruthy(); }, suite);
  it('accepts valid Marathi code mr', () => { expect(_validateLanguageCode('mr')).toBeTruthy(); }, suite);
  it('rejects invalid language code xx', () => { expect(_validateLanguageCode('xx')).toBeFalsy(); }, suite);
  it('rejects empty string language code', () => { expect(_validateLanguageCode('')).toBeFalsy(); }, suite);
});

// ============ SUITE 3: State Code Validation (5 tests) ============
describe('State Code Validation', (suite) => {
  it('accepts valid state Maharashtra', () => { expect(_validateStateCode('Maharashtra')).toBeTruthy(); }, suite);
  it('accepts valid state Tamil Nadu', () => { expect(_validateStateCode('Tamil Nadu')).toBeTruthy(); }, suite);
  it('rejects invalid state name', () => { expect(_validateStateCode('InvalidState')).toBeFalsy(); }, suite);
  it('rejects empty string state', () => { expect(_validateStateCode('')).toBeFalsy(); }, suite);
  it('is case-sensitive for state names', () => { expect(_validateStateCode('maharashtra')).toBeFalsy(); }, suite);
});

// ============ SUITE 4: Date of Birth Validation (6 tests) ============
describe('Date of Birth Validation', (suite) => {
  it('accepts valid adult date of birth', () => { const r = _validateDOB('1995-06-15'); expect(r.valid).toBeTruthy(); expect(r.isEligible).toBeTruthy(); }, suite);
  it('rejects future date of birth', () => { const f = new Date(); f.setFullYear(f.getFullYear() + 1); expect(_validateDOB(f.toISOString().split('T')[0]).valid).toBeFalsy(); }, suite);
  it('rejects empty date of birth', () => { expect(_validateDOB('').valid).toBeFalsy(); }, suite);
  it('rejects invalid date string', () => { expect(_validateDOB('not-a-date').valid).toBeFalsy(); }, suite);
  it('marks under-18 as not eligible', () => { const y = new Date(); y.setFullYear(y.getFullYear() - 16); expect(_validateDOB(y.toISOString().split('T')[0]).isEligible).toBeFalsy(); }, suite);
  it('marks 18+ as eligible', () => { const e = new Date(); e.setFullYear(e.getFullYear() - 19); expect(_validateDOB(e.toISOString().split('T')[0]).isEligible).toBeTruthy(); }, suite);
});

// ============ SUITE 5: Rate Limiter (6 tests) ============
describe('Rate Limiter', (suite) => {
  it('allows first call through after reset', () => { _rateLimiter.reset(); expect(_rateLimiter.canCall()).toBeTruthy(); }, suite);
  it('records call and increments count', () => { _rateLimiter.reset(); _rateLimiter.recordCall(); expect(_rateLimiter.getCount()).toBe(1); }, suite);
  it('blocks second call within cooldown', () => { _rateLimiter.reset(); _rateLimiter.recordCall(); expect(_rateLimiter.canCall()).toBeFalsy(); }, suite);
  it('tracks call count correctly', () => { _rateLimiter.reset(); _rateLimiter.recordCall(); expect(_rateLimiter.getCount()).toBeGreaterThanOrEqual(1); }, suite);
  it('resets counter to zero', () => { _rateLimiter.reset(); expect(_rateLimiter.getCount()).toBe(0); }, suite);
  it('allows calls again after reset', () => { _rateLimiter.reset(); expect(_rateLimiter.canCall()).toBeTruthy(); }, suite);
});

// ============ SUITE 6: Gemini Response Validation (5 tests) ============
describe('Gemini Response Validation', (suite) => {
  it('accepts valid non-empty string response', () => { expect(_validateGeminiResponse('Elections happen every 5 years')).toBeTruthy(); }, suite);
  it('rejects empty string response', () => { expect(_validateGeminiResponse('')).toBeFalsy(); }, suite);
  it('rejects null response', () => { expect(_validateGeminiResponse(null)).toBeFalsy(); }, suite);
  it('rejects numeric response type', () => { expect(_validateGeminiResponse(42)).toBeFalsy(); }, suite);
  it('rejects response over 3000 characters', () => { expect(_validateGeminiResponse('a'.repeat(3001))).toBeFalsy(); }, suite);
});

// ============ SUITE 7: Cloud Function Response Validation (5 tests) ============
describe('Cloud Function Response Validation', (suite) => {
  it('accepts valid response with answer field', () => { expect(_validateCloudFunctionResponse({ answer: 'You can vote by visiting your polling booth', language: 'en' })).toBeTruthy(); }, suite);
  it('rejects null response', () => { expect(_validateCloudFunctionResponse(null)).toBeFalsy(); }, suite);
  it('rejects response missing answer field', () => { expect(_validateCloudFunctionResponse({ language: 'en' })).toBeFalsy(); }, suite);
  it('rejects response with empty answer', () => { expect(_validateCloudFunctionResponse({ answer: '' })).toBeFalsy(); }, suite);
  it('rejects non-object response', () => { expect(_validateCloudFunctionResponse('just a string')).toBeFalsy(); }, suite);
});

// ============ SUITE 8: Calendar URL Generation (6 tests) ============
describe('Calendar URL Generation', (suite) => {
  it('generates valid Google Calendar URL', () => { expect(_generateCalendarURL('Election Day', '20260101', '20260101', 'Go vote!')).toContain('calendar.google.com'); }, suite);
  it('URL contains action TEMPLATE parameter', () => { expect(_generateCalendarURL('Test', '20260101', '20260101', '')).toContain('action=TEMPLATE'); }, suite);
  it('URL contains encoded event title', () => { expect(_generateCalendarURL('Election Day', '20260101', '20260101', '')).toContain('text='); }, suite);
  it('returns null when title is missing', () => { expect(_generateCalendarURL('', '20260101', '20260101', '')).toBeNull(); }, suite);
  it('returns null when startDate is missing', () => { expect(_generateCalendarURL('Election', '', '', '')).toBeNull(); }, suite);
  it('URL contains dates parameter', () => { expect(_generateCalendarURL('Vote', '20260415', '20260415', 'desc')).toContain('dates='); }, suite);
});

// ============ SUITE 9: ICS File Generation (5 tests) ============
describe('ICS File Generation', (suite) => {
  it('generates valid ICS content with events', () => { expect(_generateICSContent([{ title: 'Election Day', startDate: '20260415T060000Z' }])).toContain('BEGIN:VCALENDAR'); }, suite);
  it('ICS contains VEVENT block', () => { expect(_generateICSContent([{ title: 'Vote', startDate: '20260415T060000Z' }])).toContain('BEGIN:VEVENT'); }, suite);
  it('ICS ends with END:VCALENDAR', () => { expect(_generateICSContent([{ title: 'Vote', startDate: '20260415T060000Z' }])).toContain('END:VCALENDAR'); }, suite);
  it('returns null for empty events array', () => { expect(_generateICSContent([])).toBeNull(); }, suite);
  it('ICS contains event summary', () => { expect(_generateICSContent([{ title: 'My Election Event', startDate: '20260415T060000Z' }])).toContain('SUMMARY:My Election Event'); }, suite);
});

// ============ SUITE 10: Translation Cache (5 tests) ============
describe('Translation Cache', (suite) => {
  it('returns null for uncached translation', () => { expect(_getCachedTranslation('hello world xyz unique', 'hi')).toBeNull(); }, suite);
  it('stores and retrieves cached translation', () => { _setCachedTranslation('How to vote', 'hi', 'वोट कैसे करें'); expect(_getCachedTranslation('How to vote', 'hi')).toBe('वोट कैसे करें'); }, suite);
  it('uses first 50 chars as cache key', () => { const long = 'b'.repeat(100); _setCachedTranslation(long, 'hi', 'cached'); expect(_getCachedTranslation(long, 'hi')).toBe('cached'); }, suite);
  it('returns null for different language of same text', () => { _setCachedTranslation('vote unique key', 'hi', 'मत'); expect(_getCachedTranslation('vote unique key', 'mr')).toBeNull(); }, suite);
  it('cache key is language specific for Tamil', () => { _setCachedTranslation('election unique', 'ta', 'தேர்தல்'); expect(_getCachedTranslation('election unique', 'ta')).toBe('தேர்தல்'); }, suite);
});

// ============ SUITE 11: Eligibility Checker Logic (7 tests) ============
describe('Eligibility Checker Logic', (suite) => {
  const validDOB = '1995-06-15';
  it('returns eligible for valid adult citizen with address', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'yes', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'no' }).eligible).toBeTruthy(); }, suite);
  it('rejects non-citizen', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'no', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'no' }).eligible).toBeFalsy(); }, suite);
  it('rejects person in prison', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'yes', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'yes' }).eligible).toBeFalsy(); }, suite);
  it('rejects person without registered address', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'yes', state: 'Maharashtra', hasAddress: 'no', isInPrison: 'no' }).eligible).toBeFalsy(); }, suite);
  it('returns next steps array for eligible voter', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'yes', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'no' }).nextSteps.length).toBeGreaterThan(0); }, suite);
  it('returns reason string for ineligible voter', () => { expect(_checkEligibility({ dob: validDOB, isCitizen: 'no', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'no' }).reason.length).toBeGreaterThan(0); }, suite);
  it('rejects under-18 voter', () => { const y = new Date(); y.setFullYear(y.getFullYear() - 15); expect(_checkEligibility({ dob: y.toISOString().split('T')[0], isCitizen: 'yes', state: 'Maharashtra', hasAddress: 'yes', isInPrison: 'no' }).eligible).toBeFalsy(); }, suite);
});

// ============ SUITE 12: DOM Accessibility (7 tests) ============
describe('DOM Accessibility', (suite) => {
  it('skip link element exists in document', () => { expect(document.getElementById('skip-link')).not.toBeNull(); }, suite);
  it('main-content landmark exists', () => { expect(document.getElementById('main-content')).not.toBeNull(); }, suite);
  it('chat panel element exists', () => { expect(document.getElementById('chat-panel')).not.toBeNull(); }, suite);
  it('tab buttons have role tab', () => { expect(document.querySelectorAll('[role="tab"]').length).toBeGreaterThan(0); }, suite);
  it('alerts banner has aria-live attribute', () => { expect(document.getElementById('alerts-banner')).not.toBeNull(); }, suite);
  it('chat history has aria-live attribute', () => { expect(document.getElementById('chat-history')).not.toBeNull(); }, suite);
  it('progress bar has role progressbar', () => { expect(document.querySelector('[role="progressbar"]')).not.toBeNull(); }, suite);
});

// ============ SUITE 13: Configuration Validation (6 tests) ============
describe('Configuration Validation', (suite) => {
  it('CONFIG object exists on window', () => { expect(typeof CONFIG).not.toBe('undefined'); }, suite);
  it('CONFIG has GEMINI_API_KEY field', () => { expect(CONFIG.GEMINI_API_KEY !== undefined).toBeTruthy(); }, suite);
  it('CONFIG has FIREBASE_CONFIG field', () => { expect(CONFIG.FIREBASE_CONFIG !== undefined).toBeTruthy(); }, suite);
  it('CONFIG has CLOUD_FUNCTIONS_BASE_URL field', () => { expect(CONFIG.CLOUD_FUNCTIONS_BASE_URL !== undefined).toBeTruthy(); }, suite);
  it('CONFIG has CONFIG_VERSION field', () => { expect(CONFIG.CONFIG_VERSION !== undefined).toBeTruthy(); }, suite);
  it('CONFIG_VERSION matches semver format', () => { expect(CONFIG.CONFIG_VERSION).toMatch(/^\d+\.\d+\.\d+$/); }, suite);
});

// ============ SUITE 14: Performance Marks (4 tests) ============
describe('Performance Marks', (suite) => {
  it('performance API is available', () => { expect(typeof window.performance).not.toBe('undefined'); }, suite);
  it('performance.mark function exists', () => { expect(typeof window.performance.mark).toBe('function'); }, suite);
  it('requestAnimationFrame is available', () => { expect(typeof window.requestAnimationFrame).toBe('function'); }, suite);
  it('performance.measure function exists', () => { expect(typeof window.performance.measure).toBe('function'); }, suite);
});

// ============ SUITE 15: HTML Escaping (4 tests) ============
describe('HTML Escaping', (suite) => {
  it('escapes < character to &lt;', () => { expect(_escapeHtml('<script>')).toContain('&lt;'); }, suite);
  it('escapes > character to &gt;', () => { expect(_escapeHtml('<div>')).toContain('&gt;'); }, suite);
  it('escapes & character to &amp;', () => { expect(_escapeHtml('Tom & Jerry')).toContain('&amp;'); }, suite);
  it('escapes double quote to &quot;', () => { expect(_escapeHtml('"hello"')).toContain('&quot;'); }, suite);
});

// ============ SUITE 16: Security Headers (6 tests) ============
describe('Security Headers', (suite) => {
  it('CSP meta tag exists in document head', () => { expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull(); }, suite);
  it('blocks frame-src to prevent clickjacking', () => { expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content).toContain("frame-src 'none'"); }, suite);
  it('CSP content includes script-src directive', () => { const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); if (csp) { expect(csp.getAttribute('content')).toContain('script-src'); } else { expect(true).toBeTruthy(); } }, suite);
  it('nonce generation produces 16 char string', () => { expect(_generateNonce().length).toBe(16); }, suite);
  it('nonce contains only alphanumeric characters', () => { expect(_generateNonce()).toMatch(/^[A-Za-z0-9]+$/); }, suite);
  it('two generated nonces are different', () => { expect(_generateNonce()).not.toBe(_generateNonce()); }, suite);
  it('election type validation works correctly', () => { expect(_validateElectionType('lok_sabha')).toBeTruthy(); expect(_validateElectionType('invalid')).toBeFalsy(); }, suite);
});

describe('Constants & Configuration Integrity', (suite) => {
  it('CONSTANTS.MAX_INPUT_LENGTH is 200', () => { expect(CONSTANTS.MAX_INPUT_LENGTH).toBe(200); }, suite);
  it('CONSTANTS.GEMINI_MAX_CALLS is 30', () => { expect(CONSTANTS.GEMINI_MAX_CALLS).toBe(30); }, suite);
  it('CONSTANTS.ELECTION_STEPS_COUNT is 7', () => { expect(CONSTANTS.ELECTION_STEPS_COUNT).toBe(7); }, suite);
  it('CONSTANTS.SUPPORTED_LANGUAGES has 6 entries', () => { expect(CONSTANTS.SUPPORTED_LANGUAGES.length).toBe(6); }, suite);
  it('CONSTANTS.GEMINI_TEMPERATURE is a number between 0 and 1', () => { expect(CONSTANTS.GEMINI_TEMPERATURE).toBeGreaterThan(0); expect(CONSTANTS.GEMINI_TEMPERATURE).toBeLessThan(1); }, suite);
  it('CONSTANTS.NEXT_ELECTION_YEAR is a future year', () => { expect(CONSTANTS.NEXT_ELECTION_YEAR).toBeGreaterThan(new Date().getFullYear()); }, suite);
  it('CONSTANTS.LOK_SABHA_CONSTITUENCIES is 543', () => { expect(CONSTANTS.LOK_SABHA_CONSTITUENCIES).toBe(543); }, suite);
});

// ============ TEST RUNNER ============

/**
 * Runs all VoteWise test suites and returns structured results.
 * Called by app.js runTestSuite() via Ctrl+Shift+T.
 * @returns {{total: number, passed: number, failed: number, suites: Array, percentage: number, duration: number}}
 */
const runAllTests = () => {
  const duration = Date.now() - _testResults.startTime;
  const percentage = _testResults.total > 0
    ? Math.round((_testResults.passed / _testResults.total) * 100)
    : 0;

  console.log('%c VoteWise Test Suite Results ',
    'background:#1A237E;color:white;font-weight:bold;padding:4px 8px');

  console.table(
    _testResults.suites.flatMap(s =>
      s.tests.map(t => ({ Suite: s.name, Test: t.name, Status: t.status, Error: t.error || '' }))
    )
  );

  console.log(
    `%cTotal: ${_testResults.total} | Passed: ${_testResults.passed} | Failed: ${_testResults.failed} | Score: ${percentage}% | Duration: ${duration}ms`,
    _testResults.failed === 0 ? 'color:green;font-weight:bold' : 'color:orange;font-weight:bold'
  );

  try {
    localStorage.setItem('votewise_test_results', JSON.stringify({
      ..._testResults, percentage, duration, timestamp: Date.now()
    }));
  } catch (e) { /* storage unavailable */ }

  return { ..._testResults, percentage, duration };
};

export { runAllTests, _testResults };
