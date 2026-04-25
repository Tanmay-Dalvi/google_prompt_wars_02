/* global gcpLog */
/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module calendar
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Google Calendar API integration for VoteWise.
 *              Generates calendar event URLs, ICS files, and election reminders.
 */

'use strict';
// ============ CALENDAR CONSTANTS ============

/** @constant {string} GOOGLE_CALENDAR_BASE_URL - Base URL for Google Calendar event creation */
const GOOGLE_CALENDAR_BASE_URL = 'https://calendar.google.com/calendar/render?action=TEMPLATE';

/**
 * @typedef {Object} ElectionEvent
 * @property {string} title - Event title
 * @property {string} startDate - Start date in YYYY-MM-DD format
 * @property {string} endDate - End date in YYYY-MM-DD format
 * @property {string} description - Event description
 * @property {string} location - Event location (optional)
 */

// ============ DATE FORMATTING ============

/**
 * Formats a JavaScript Date object or date string to YYYYMMDD format for Google Calendar URLs.
 * @param {Date|string} date - The date to format
 * @returns {string} Date formatted as YYYYMMDD (e.g., '20241120')
 * @throws {TypeError} If date is invalid
 */
function formatDateForCalendar(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return '';
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// ============ CALENDAR URL GENERATION ============

/**
 * Builds a Google Calendar event creation URL with pre-filled event details.
 * @param {string} title - The event title
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format (can be same as startDate for single-day)
 * @param {string} description - Detailed event description (HTML-stripped)
 * @returns {string} Full Google Calendar URL ready to open in browser
 */
function generateCalendarURL(title, startDate, endDate, description) {
  const start = formatDateForCalendar(startDate);
  const end = formatDateForCalendar(endDate || startDate);
  // For all-day events, end date must be the day after
  const endForCalendar = end || start;

  const params = new URLSearchParams({
    text: title || 'Election Day',
    dates: `${start}/${endForCalendar}`,
    details: description || generateVotingChecklist(),
    sf: 'true',
    output: 'xml'
  });

  return `${GOOGLE_CALENDAR_BASE_URL}&${params.toString()}`;
}

/**
 * Opens Google Calendar in a new tab with pre-filled election event details.
 * Includes 7-day and 1-day reminder metadata in the description.
 * @param {ElectionEvent} electionEvent - Election event data object
 * @returns {void}
 */
function addToGoogleCalendar(electionEvent) {
  if (!electionEvent || !electionEvent.startDate) {
    gcpLog('WARNING', 'addToGoogleCalendar called with invalid event', { event: electionEvent });
    return;
  }
  gcpLog('INFO', 'Opening Google Calendar for election event', { state: electionEvent.state, type: electionEvent.electionType });

  const title = electionEvent.title || `🗳️ Election Day - ${electionEvent.state || ''} ${electionEvent.electionType || ''}`;
  const description = `${electionEvent.description || ''}\n\n${generateVotingChecklist()}\n\n⏰ Reminders: Set for 7 days before and 1 day before election.\n\nFor official info: https://eci.gov.in`;

  const url = generateCalendarURL(
    title,
    electionEvent.startDate,
    electionEvent.endDate || electionEvent.startDate,
    description
  );

  window.open(url, '_blank', 'noopener,noreferrer');
}

// ============ ICS FILE GENERATION ============

/**
 * Generates an ICS (iCalendar) formatted string for one or more election events.
 * ICS files can be opened by any calendar application (Apple Calendar, Outlook, etc.)
 * @param {ElectionEvent[]} events - Array of election event objects
 * @returns {string} ICS file content as a string
 */
function generateICSContent(events) {
  if (!Array.isArray(events) || events.length === 0) {
    gcpLog('WARNING', 'generateICSContent called with empty events array');
    return '';
  }
  gcpLog('INFO', 'Generating ICS file', { eventCount: events.length });

  const now = new Date();
  const dtStamp = `${formatDateForCalendar(now)  }T${ 
    String(now.getUTCHours()).padStart(2, '0') 
  }${String(now.getUTCMinutes()).padStart(2, '0') 
  }${String(now.getUTCSeconds()).padStart(2, '0')  }Z`;

  const eventStrings = events.map((event, idx) => {
    const start = formatDateForCalendar(event.startDate);
    const end = formatDateForCalendar(event.endDate || event.startDate);
    const title = (event.title || 'Election Day').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const desc = (event.description || generateVotingChecklist())
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .substring(0, 500);

    return [
      'BEGIN:VEVENT',
      `UID:votewise-event-${idx}-${Date.now()}@votewise.app`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc}`,
      'LOCATION:India',
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Election in 7 days - VoteWise Reminder',
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:Election tomorrow! - VoteWise Reminder',
      'END:VALARM',
      'END:VEVENT'
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VoteWise//Election Literacy Assistant//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VoteWise Election Reminders',
    'X-WR-TIMEZONE:Asia/Kolkata',
    ...eventStrings,
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Triggers a download of an ICS file in the user's browser.
 * Used as a fallback when Google Calendar API is unavailable.
 * @param {ElectionEvent[]} events - Array of election events to include in the ICS
 * @param {string} filename - Desired filename for the downloaded ICS file
 * @returns {void}
 */
function downloadICSFile(events, filename) {
  const content = generateICSContent(events);
  if (!content) { return; }

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'votewise-election-reminders.ics';
  link.setAttribute('aria-label', 'Download election calendar file');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Adds multiple election dates to Google Calendar at once.
 * Opens one tab per event (browser may prompt for popup permission).
 * As an alternative, triggers an ICS download with all events.
 * @param {ElectionEvent[]} timeline - Array of election events from the timeline
 * @returns {void}
 */
function addAllElectionDates(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) { return; }
  // Download ICS file with all dates (more reliable than opening multiple tabs)
  downloadICSFile(timeline, 'votewise-all-election-dates.ics');
}

// ============ CHECKLIST GENERATOR ============

/**
 * Generates a formatted voter preparation checklist string for use in calendar event descriptions.
 * @returns {string} Multi-line checklist string for inclusion in calendar events
 */
function generateVotingChecklist() {
  return [
    '✅ VoteWise Voter Preparation Checklist:',
    '',
    '📋 Before Election Day:',
    '• Check your name on the electoral roll (voters.eci.gov.in)',
    '• Download your e-EPIC voter ID from nvsp.in',
    '• Find your polling booth number (check your Voter ID or ECI website)',
    '• Note the booth address and opening hours (typically 7 AM - 6 PM)',
    '',
    '📄 Documents to Carry:',
    '• Voter ID card (EPIC) OR any ONE approved ID:',
    '  - Aadhaar Card, PAN Card, Passport, Driving License,',
    '    Bank Passbook with photo, or any official government ID',
    '',
    '🗳️ At the Polling Booth:',
    '• Queue at your designated booth',
    '• Get your finger inked (indelible ink mark)',
    '• Vote using the EVM — your vote is completely secret',
    '• Check the VVPAT slip to verify your choice',
    '',
    '📞 Voter Helpline: 1950',
    '🌐 Official Website: https://eci.gov.in',
    '',
    'Generated by VoteWise — AI-Powered Election Literacy Assistant'
  ].join('\n');
}

// ============ EXPORTS ============

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateCalendarURL,
    addToGoogleCalendar,
    generateICSContent,
    downloadICSFile,
    formatDateForCalendar,
    addAllElectionDates,
    generateVotingChecklist
  };
}
