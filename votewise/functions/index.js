/**
 * VoteWise - AI-Powered Election Literacy Assistant
 * @module functions/index
 * @version 1.0.0
 * @author Tanmay Dalvi
 * @license MIT
 * @description Firebase Cloud Functions backend for VoteWise.
 *              Provides secure API proxying for Gemini AI and election timeline data.
 */

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const fetch = require('node-fetch');

// ============ CONSTANTS ============
const VALID_LANGUAGE_CODES = ['en', 'hi', 'mr', 'ta', 'te', 'bn'];
const VALID_ELECTION_TYPES = ['Lok Sabha', 'Vidhan Sabha', 'Local Body'];
const MAX_QUESTION_LENGTH = 500;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const GEMINI_SYSTEM_PROMPT = `You are VoteWise, an expert on Indian elections and the Election Commission of India (ECI).
Help citizens understand voting processes, their rights, voter registration steps, and election timelines.
Answer in simple, clear language accessible to first-time voters and rural citizens.
If asked in Hindi, Marathi, Tamil, Telugu, or Bengali, respond in that language.
Always cite ECI guidelines when relevant. Keep answers under 4 sentences unless a step-by-step explanation is needed.
Never give political opinions or endorse any party or candidate.
Key topics: EPIC (Voter ID), Form 6 (registration), NVSP portal, EVM, VVPAT, NOTA, Model Code of Conduct, electoral roll, polling booth.`;

const VALID_INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
  'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli',
  'Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
];

// ============ UTILITIES ============

function sanitizeInput(str, maxLen = MAX_QUESTION_LENGTH) {
  if (typeof str !== 'string') { return ''; }
  let s = str.replace(/<[^>]*>/g, '');
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');
  s = s.replace(/\0/g, '');
  return s.trim().substring(0, maxLen);
}

function gcpLog(severity, message, data = {}) {
  console.log(JSON.stringify({ // eslint-disable-line no-console -- Cloud Functions writes console.log to Cloud Logging as structured JSON
    severity, message,
    timestamp: new Date().toISOString(),
    service: 'votewise-functions',
    version: '1.0.0',
    ...data
  }));
}

function setCORSHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

function getTimelineForState(state, electionType) {
  const stateElections = {
    'Bihar':          { approximateYear: 2025, phases: 3 },
    'Delhi':          { approximateYear: 2025, phases: 1 },
    'West Bengal':    { approximateYear: 2026, phases: 8 },
    'Tamil Nadu':     { approximateYear: 2026, phases: 1 },
    'Kerala':         { approximateYear: 2026, phases: 1 },
    'Assam':          { approximateYear: 2026, phases: 3 },
    'Uttar Pradesh':  { approximateYear: 2027, phases: 7 },
    'Punjab':         { approximateYear: 2027, phases: 1 },
    'Goa':            { approximateYear: 2027, phases: 1 },
    'Uttarakhand':    { approximateYear: 2027, phases: 1 },
    'Gujarat':        { approximateYear: 2027, phases: 2 },
    'Himachal Pradesh': { approximateYear: 2027, phases: 1 }
  };

  const base = {
    state, electionType,
    nextElection: {
      approximateYear: 2029,
      phases: electionType === 'Lok Sabha' ? 7 : 1,
      multiPhase: electionType === 'Lok Sabha'
    },
    keyDates: {
      registrationDeadline: 'January 15, 2029 (approximate)',
      nominationStart:      'March 1, 2029 (approximate)',
      nominationEnd:        'March 14, 2029 (approximate)',
      scrutinyDate:         'March 15, 2029 (approximate)',
      withdrawalDeadline:   'March 17, 2029 (approximate)',
      mccActivation:        'March 2, 2029 (on announcement)',
      pollingDate:          'April–May 2029 (phase-wise)',
      resultDate:           'June 2029 (approximate)'
    },
    eciFaqUrl: 'https://eci.gov.in/faq',
    nvspUrl: 'https://www.nvsp.in',
    voterHelpline: '1950',
    phases: [{ phase: 1, date: 'April 2029 (approx)', states: [state] }]
  };

  if (electionType === 'Vidhan Sabha' && stateElections[state]) {
    base.nextElection.approximateYear = stateElections[state].approximateYear;
    base.nextElection.phases = stateElections[state].phases;
  }
  return base;
}

// ============ FUNCTION 1: askElectionAI ============

exports.askElectionAI = onRequest(
  { secrets: ['GEMINI_API_KEY'], cors: true, region: 'asia-south1' },
  async (req, res) => {
    setCORSHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' }); return;
    }

    const { question, language = 'en', userState = 'India' } = req.body || {};

    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Missing required field: question' }); return;
    }

    const sanitizedQuestion = sanitizeInput(question);
    if (sanitizedQuestion.length < 3) {
      res.status(400).json({ error: 'Question too short.' }); return;
    }

    const sanitizedLang  = VALID_LANGUAGE_CODES.includes(language) ? language : 'en';
    const sanitizedState = VALID_INDIAN_STATES.includes(userState) ? userState : 'India';

    gcpLog('INFO', 'askElectionAI received', {
      questionLength: sanitizedQuestion.length,
      language: sanitizedLang, userState: sanitizedState
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      gcpLog('ERROR', 'GEMINI_API_KEY secret not set');
      res.status(500).json({ error: 'Server configuration error.' }); return;
    }

    const langNames = { 'hi': 'Hindi', 'mr': 'Marathi', 'ta': 'Tamil', 'te': 'Telugu', 'bn': 'Bengali', 'en': 'English' };
    const targetLangName = langNames[sanitizedLang] || 'English';
    const langInstruction = `CRITICAL: You MUST respond ONLY in ${targetLangName}. Do not use any other language. `;
    const stateCtx = sanitizedState !== 'India'
      ? `The user is from ${sanitizedState}. ` : '';
    const prompt = `${langInstruction}${stateCtx}User question: ${sanitizedQuestion}`;

    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: apiKey });

      const geminiRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: GEMINI_SYSTEM_PROMPT,
            temperature: 0.3,
            maxOutputTokens: 512,
            topP: 0.8,
            topK: 40
        }
      });

      const answer = geminiRes.text;

      if (!answer || answer.trim().length === 0) {
        res.status(500).json({ error: 'No response from AI. Please rephrase.' }); return;
      }

      gcpLog('INFO', 'askElectionAI success', { responseLength: answer.length });
      res.status(200).json({
        answer: answer.substring(0, 3000),
        language: sanitizedLang,
        confidence: 0.92,
        timestamp: new Date().toISOString(),
        source: 'gemini-2.5-flash'
      });

    } catch (err) {
      gcpLog('ERROR', 'Unexpected error in askElectionAI', { error: err.message });
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

// ============ FUNCTION 2: getElectionTimeline ============

exports.getElectionTimeline = onRequest(
  { cors: true, region: 'asia-south1' },
  async (req, res) => {
    setCORSHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' }); return;
    }

    const { state, electionType } = req.body || {};

    if (!state || !VALID_INDIAN_STATES.includes(state)) {
      res.status(400).json({ error: 'Invalid or missing state.', validStates: VALID_INDIAN_STATES }); return;
    }
    if (!electionType || !VALID_ELECTION_TYPES.includes(electionType)) {
      res.status(400).json({ error: `Invalid election type. Must be one of: ${VALID_ELECTION_TYPES.join(', ')}` }); return;
    }

    gcpLog('INFO', 'getElectionTimeline received', { state, electionType });

    try {
      const timeline = getTimelineForState(state, electionType);
      gcpLog('INFO', 'getElectionTimeline success', { state, nextYear: timeline.nextElection.approximateYear });
      res.status(200).json({ success: true, data: timeline, timestamp: new Date().toISOString() });
    } catch (err) {
      gcpLog('ERROR', 'Error in getElectionTimeline', { error: err.message });
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);
