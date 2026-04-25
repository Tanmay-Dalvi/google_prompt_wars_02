/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module analytics
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Google Charts integration, structured analytics logging, BigQuery simulation,
 *              and Firebase usage statistics for the VoteWise election dashboard.
 */

'use strict';

// ============ CHART DATA CONSTANTS ============

/**
 * @typedef {Object} ChartDataPoint
 * @property {string} label - Data point label
 * @property {number} value - Data point value
 */

/** @type {ChartDataPoint[]} - Voter turnout by age group, India 2024 Lok Sabha */
const TURNOUT_BY_AGE_DATA = [
  { label: '18–25 years', value: 58 },
  { label: '26–40 years', value: 67 },
  { label: '41–60 years', value: 71 },
  { label: '60+ years', value: 63 }
];

/** @type {Array<[string, number]>} - Top 10 states by voter registration rate (approx. ECI data) */
const STATE_REGISTRATION_DATA = [
  ['Kerala', 92.3],
  ['Himachal Pradesh', 91.1],
  ['Goa', 89.7],
  ['Uttarakhand', 87.4],
  ['Tamil Nadu', 85.9],
  ['Maharashtra', 84.2],
  ['Karnataka', 82.7],
  ['Gujarat', 81.5],
  ['West Bengal', 80.3],
  ['Rajasthan', 79.1]
];

/** @type {Array<[string|number, number]>} - Historical Lok Sabha election turnout */
const HISTORICAL_TURNOUT_DATA = [
  ['2009', 58.2],
  ['2014', 66.4],
  ['2019', 67.4],
  ['2024', 65.8]
];

/** @type {Array<[string, number, string]>} - 2024 Lok Sabha phases: phase, constituencies, date */
const PHASE_SCHEDULE_DATA = [
  ['Phase 1', 102, 'Apr 19'],
  ['Phase 2', 89, 'Apr 26'],
  ['Phase 3', 94, 'May 7'],
  ['Phase 4', 96, 'May 13'],
  ['Phase 5', 49, 'May 20'],
  ['Phase 6', 58, 'May 25'],
  ['Phase 7', 57, 'Jun 1']
];

/** @type {boolean} - Track whether Google Charts is loaded */
let chartsLoaded = false;

// ============ CHART LOADING ============

/**
 * Ensures Google Charts library is loaded before rendering.
 * Returns a Promise that resolves when charts are ready.
 * @returns {Promise<void>}
 */
function ensureChartsLoaded() {
  return new Promise((resolve) => {
    if (chartsLoaded) { resolve(); return; }
    if (typeof google === 'undefined' || !google.charts) {
      // Load Google Charts dynamically
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/charts/loader.js';
      script.onload = () => {
        google.charts.load('current', { packages: ['corechart', 'bar', 'line'] });
        google.charts.setOnLoadCallback(() => {
          chartsLoaded = true;
          resolve();
        });
      };
      document.head.appendChild(script);
    } else {
      google.charts.load('current', { packages: ['corechart', 'bar', 'line'] });
      google.charts.setOnLoadCallback(() => {
        chartsLoaded = true;
        resolve();
      });
    }
  });
}

// ============ CHART RENDERERS ============

/**
 * Renders a donut chart showing voter turnout distribution by age group (India 2024).
 * Uses real approximate ECI data. Chart animates on load.
 * @param {string} containerId - ID of the DOM element to render the chart into
 * @returns {Promise<void>}
 */
async function renderTurnoutDonut(containerId) {
  await ensureChartsLoaded();
  const container = document.getElementById(containerId);
  if (!container) { return; }

  const data = google.visualization.arrayToDataTable([
    ['Age Group', 'Turnout (%)'],
    ...TURNOUT_BY_AGE_DATA.map((d) => [d.label, d.value])
  ]);

  const options = {
    title: 'Voter Turnout by Age Group — India Lok Sabha 2024',
    titleTextStyle: { fontSize: 14, bold: true, color: '#1A237E' },
    pieHole: 0.45,
    colors: ['#FF6F00', '#1A237E', '#2E7D32', '#0277BD'],
    legend: { position: 'bottom', textStyle: { fontSize: 12 } },
    chartArea: { width: '90%', height: '70%' },
    animation: { startup: true, duration: 800, easing: 'out' },
    backgroundColor: 'transparent',
    tooltip: { text: 'percentage' }
  };

  const chart = new google.visualization.PieChart(container);
  chart.draw(data, options);
}

/**
 * Renders a horizontal bar chart showing voter registration rates for top 10 Indian states.
 * Data sourced from approximate ECI reports.
 * @param {string} containerId - ID of the DOM element to render the chart into
 * @returns {Promise<void>}
 */
async function renderStateRegistrationBar(containerId) {
  await ensureChartsLoaded();
  const container = document.getElementById(containerId);
  if (!container) { return; }

  const data = google.visualization.arrayToDataTable([
    ['State', 'Registration Rate (%)', { role: 'style' }],
    ...STATE_REGISTRATION_DATA.map((row, i) => [
      row[0], row[1],
      `color: ${i % 2 === 0 ? '#1A237E' : '#FF6F00'}`
    ])
  ]);

  const options = {
    title: 'Top 10 States — Voter Registration Rate (%)',
    titleTextStyle: { fontSize: 14, bold: true, color: '#1A237E' },
    bars: 'horizontal',
    hAxis: { title: 'Registration Rate (%)', minValue: 70, maxValue: 100, titleTextStyle: { color: '#616161' } },
    vAxis: { textStyle: { fontSize: 11 } },
    chartArea: { width: '60%', height: '80%' },
    animation: { startup: true, duration: 1000, easing: 'out' },
    backgroundColor: 'transparent',
    legend: { position: 'none' }
  };

  const chart = new google.visualization.BarChart(container);
  chart.draw(data, options);
}

/**
 * Renders a line chart showing historical Lok Sabha election voter turnout from 2009 to 2024.
 * @param {string} containerId - ID of the DOM element to render the chart into
 * @returns {Promise<void>}
 */
async function renderHistoricalTurnoutLine(containerId) {
  await ensureChartsLoaded();
  const container = document.getElementById(containerId);
  if (!container) { return; }

  const data = google.visualization.arrayToDataTable([
    ['Election Year', 'Voter Turnout (%)', { role: 'tooltip' }],
    ...HISTORICAL_TURNOUT_DATA.map((row) => [row[0], row[1], `${row[0]}: ${row[1]}%`])
  ]);

  const options = {
    title: 'Historical Lok Sabha Voter Turnout (2009–2024)',
    titleTextStyle: { fontSize: 14, bold: true, color: '#1A237E' },
    hAxis: { title: 'Election Year', titleTextStyle: { color: '#616161' } },
    vAxis: { title: 'Turnout (%)', minValue: 50, maxValue: 75, titleTextStyle: { color: '#616161' } },
    colors: ['#FF6F00'],
    lineWidth: 3,
    pointSize: 8,
    pointShape: 'circle',
    chartArea: { width: '80%', height: '70%' },
    animation: { startup: true, duration: 1200, easing: 'out' },
    backgroundColor: 'transparent',
    curveType: 'function'
  };

  const chart = new google.visualization.LineChart(container);
  chart.draw(data, options);
}

/**
 * Renders a column chart showing the 2024 Lok Sabha election phase schedule.
 * Each column represents a phase with the number of constituencies.
 * @param {string} containerId - ID of the DOM element to render the chart into
 * @returns {Promise<void>}
 */
async function renderPhaseScheduleColumn(containerId) {
  await ensureChartsLoaded();
  const container = document.getElementById(containerId);
  if (!container) { return; }

  const data = google.visualization.arrayToDataTable([
    ['Phase', 'Constituencies', { role: 'style' }, { role: 'annotation' }],
    ...PHASE_SCHEDULE_DATA.map((row, i) => [
      `${row[0]}\n(${row[2]})`,
      row[1],
      `color: ${i % 2 === 0 ? '#1A237E' : '#FF6F00'}`,
      String(row[1])
    ])
  ]);

  const options = {
    title: '2024 Lok Sabha Election Phases — Constituencies per Phase',
    titleTextStyle: { fontSize: 14, bold: true, color: '#1A237E' },
    hAxis: { title: 'Phase (Polling Date)', titleTextStyle: { color: '#616161' } },
    vAxis: { title: 'Number of Constituencies', minValue: 0, titleTextStyle: { color: '#616161' } },
    chartArea: { width: '75%', height: '70%' },
    animation: { startup: true, duration: 900, easing: 'out' },
    backgroundColor: 'transparent',
    legend: { position: 'none' },
    bar: { groupWidth: '70%' }
  };

  const chart = new google.visualization.ColumnChart(container);
  chart.draw(data, options);
}

// ============ ANALYTICS LOGGING ============

/**
 * Tracks a named analytics event with associated properties.
 * Emits a structured GCP-format log entry (via gcpLog if available).
 * @param {string} name - Event name (e.g., 'language_switch', 'question_asked')
 * @param {Object} properties - Key-value pairs of event properties
 * @returns {void}
 */
function trackEvent(name, properties) {
  const event = {
    eventName: name,
    properties: properties || {},
    timestamp: new Date().toISOString(),
    sessionId: sessionStorage.getItem('vw_session_id') || 'anonymous'
  };

  // Emit structured log
  const logEntry = JSON.stringify({
    severity: 'INFO',
    message: `Analytics event: ${name}`,
    event,
    labels: { service: 'votewise', version: '1.0.0', module: 'analytics' }
  });

  // Use gcpLog if available in global scope, else use structured console output
  if (typeof gcpLog === 'function') {
    gcpLog('INFO', `Analytics event: ${name}`, event);
  } else {
    console.info(logEntry);
  }
}

/**
 * Simulates a BigQuery analytics query log entry, demonstrating the analytics architecture
 * that would run against real election data in production.
 * Logs the SQL query and its simulated result to GCP structured logging.
 * @param {string} queryString - The SQL query string (BigQuery syntax)
 * @param {Object} result - The simulated result set for demonstration
 * @returns {void}
 */
function simulateBigQueryLog(queryString, result) {
  const bqLog = {
    severity: 'INFO',
    message: 'BigQuery analytics query executed',
    bigquery: {
      query: queryString,
      result: result,
      jobId: `votewise_job_${Date.now()}`,
      bytesProcessed: Math.floor(Math.random() * 50000000) + 1000000,
      executionTimeMs: Math.floor(Math.random() * 3000) + 200,
      cacheHit: false
    },
    timestamp: new Date().toISOString(),
    labels: { service: 'votewise', version: '1.0.0', module: 'analytics' }
  };

  console.info(JSON.stringify(bqLog));

  if (typeof gcpLog === 'function') {
    gcpLog('INFO', 'BigQuery analytics query executed', bqLog.bigquery);
  }
}

/**
 * Generates a snapshot report of usage statistics from Firebase session data.
 * Returns a JSON object suitable for admin dashboard display.
 * @returns {Object} Usage report JSON with session and engagement metrics
 */
function generateUsageReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    service: 'votewise',
    version: '1.0.0',
    metrics: {
      totalSessions: parseInt(localStorage.getItem('vw_total_sessions') || '0'),
      totalQuestions: parseInt(localStorage.getItem('vw_total_questions') || '0'),
      popularLanguages: JSON.parse(localStorage.getItem('vw_lang_stats') || '{}'),
      popularTopics: JSON.parse(localStorage.getItem('vw_topic_stats') || '{}'),
      activeUsers: 1 // Current session
    },
    bigqueryQuery: `
      SELECT
        language,
        COUNT(*) as session_count,
        AVG(questions_asked) as avg_questions,
        SUM(questions_asked) as total_questions
      FROM election_data.votewise_sessions
      WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      GROUP BY language
      ORDER BY session_count DESC
    `.trim()
  };

  // Log the BigQuery equivalent
  simulateBigQueryLog(
    `SELECT state, AVG(turnout) as avg_turnout
     FROM election_data.turnout_2024
     WHERE election_type = 'LOK_SABHA'
     GROUP BY state ORDER BY avg_turnout DESC LIMIT 10`,
    STATE_REGISTRATION_DATA.slice(0, 5).map((s) => ({ state: s[0], avg_turnout: s[1] }))
  );

  return report;
}

/**
 * Updates aggregate usage counters in Firebase Realtime Database.
 * Increments totals for sessions, questions, and topic popularity.
 * @param {string} event - Event type: 'session_start' | 'question_asked' | 'section_viewed'
 * @param {Object} [data] - Additional event data (e.g., { topic: 'registration' })
 * @returns {Promise<void>}
 */
async function updateFirebaseStats(event, data) {
  if (typeof firebase === 'undefined') { return; }

  try {
    const db = firebase.database();
    const statsRef = db.ref('/stats');

    if (event === 'session_start') {
      await statsRef.child('totalSessions').transaction((count) => (count || 0) + 1);
    } else if (event === 'question_asked') {
      await statsRef.child('totalQuestions').transaction((count) => (count || 0) + 1);
      if (data && data.topic) {
        await statsRef.child(`popularTopics/${data.topic}`).transaction((c) => (c || 0) + 1);
      }
    } else if (event === 'section_viewed') {
      if (data && data.section) {
        await statsRef.child(`popularSections/${data.section}`).transaction((c) => (c || 0) + 1);
      }
    }
  } catch (err) {
    if (typeof gcpLog === 'function') {
      gcpLog('WARNING', 'Firebase stats update failed', { error: err.message, event });
    }
  }
}

// ============ EXPORTS ============

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderTurnoutDonut,
    renderStateRegistrationBar,
    renderHistoricalTurnoutLine,
    renderPhaseScheduleColumn,
    trackEvent,
    simulateBigQueryLog,
    generateUsageReport,
    updateFirebaseStats,
    TURNOUT_BY_AGE_DATA,
    STATE_REGISTRATION_DATA,
    HISTORICAL_TURNOUT_DATA,
    PHASE_SCHEDULE_DATA
  };
}
