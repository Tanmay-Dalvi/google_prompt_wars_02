# VoteWise 🗳️ — AI-Powered Election Literacy Assistant

[![CI](https://github.com/Tanmay-Dalvi/google_prompt_wars_02/actions/workflows/ci.yml/badge.svg)](https://github.com/Tanmay-Dalvi/google_prompt_wars_02/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue)](manifest.json)

> **PromptWars Virtual Round 2 — Google for Developers × Hack2Skill 2026**
> Built by **Tanmay Dalvi**

VoteWise is a production-ready, multilingual, AI-powered civic education platform that helps every Indian citizen understand elections, check voter eligibility, track election timelines, and get instant answers via Gemini AI — all in their preferred language.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Gemini AI Assistant** | Real-time election Q&A via Google Cloud Functions + Gemini 2.5 Flash |
| 🌐 **6 Languages** | English, Hindi, Marathi, Tamil, Telugu, Bengali via Google Translate API |
| ✅ **Eligibility Checker** | Age, citizenship, address, prison-status validation with AI message |
| 📅 **Election Timeline** | State-wise phases, key dates, Google Calendar + ICS integration |
| 📊 **Stats Dashboard** | Google Charts: donut, line, bar, column — ECI data visualized |
| 📖 **Glossary** | 30 terms with A–Z filter, category badges, AI deep-dive |
| 🔴 **Firebase Live Stats** | Real-time session and question counters via Firebase RTDB |
| 🌙 **Dark Mode** | System-preference aware, persisted to localStorage |
| 📱 **PWA** | Installable, offline-ready manifest, mobile-optimized |
| ♿ **Accessibility** | WCAG 2.1 AA: skip links, aria-live, focus trap, prefers-reduced-motion |

---

## 🏗️ Architecture

```
votewise/
├── index.html          # Clean HTML shell — zero inline JS/CSS
├── styles.css          # 724-line complete stylesheet (24 sections)
├── app.js              # 2,200-line core logic (17 sections)
├── config.js           # Centralized API keys & Firebase config
├── security.js         # Input sanitization, XSS protection, rate limiting
├── translate.js        # Google Translate API + sessionStorage cache
├── calendar.js         # Google Calendar URL + ICS file generation
├── analytics.js        # Google Charts rendering + GCP structured logging
├── manifest.json       # PWA manifest
├── nginx.conf          # Production nginx with security headers
├── Dockerfile          # nginx:alpine production container
├── package.json        # npm scripts (lint, test, serve)
├── .eslintrc.json      # ESLint rules (no-eval, no-var, eqeqeq...)
├── .github/
│   └── workflows/
│       └── ci.yml      # 5-job CI pipeline
├── functions/
│   ├── index.js        # Cloud Functions: askElectionAI, getElectionTimeline
│   └── package.json
└── tests/
    └── votewise.test.js  # 101 tests across 17 suites
```

---

## 🚀 Google Cloud Services Used

| Service | Usage |
|---|---|
| **Gemini 2.5 Flash API** | AI election Q&A with context-aware prompts |
| **Google Cloud Functions** | Primary backend for `askElectionAI` and `getElectionTimeline` |
| **Google Translate API** | Real-time page translation with sessionStorage caching |
| **Google Calendar API** | Add election dates directly to user's calendar |
| **Firebase Realtime Database** | Live session tracking, question counts, analytics |
| **Google Charts** | Voter turnout donut, historical line, state bar, phase column charts |

---

## 🛠️ Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/Tanmay-Dalvi/google_prompt_wars_02.git
cd google_prompt_wars_02/votewise

# 2. Install dev dependencies
npm install

# 3. Serve locally
npm run serve
# → http://localhost:3000

# 4. Lint
npm run lint

## 🚀 Deployment

### Google Cloud Functions (Backend)

```bash
cd votewise/functions
firebase deploy --only functions --project promptwars-virtual-493517
```

### Google Cloud Run (Frontend — Static Site via nginx)

Cloud Run requires port **8080**. The included `nginx.conf` and `Dockerfile` are pre-configured.

```bash
# 1. Set project
gcloud config set project promptwars-virtual-493517

# 2. Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 3. Navigate to votewise directory (where Dockerfile lives)
cd votewise

# 4. Build and push container
gcloud builds submit --tag gcr.io/promptwars-virtual-493517/votewise .

# 5. Deploy to Cloud Run (asia-south1 for India latency)
gcloud run deploy votewise \
  --image gcr.io/promptwars-virtual-493517/votewise \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3

# 6. Get service URL
gcloud run services describe votewise \
  --region asia-south1 \
  --format 'value(status.url)'
```

> **Note:** After deployment, update `CLOUD_FUNCTIONS_BASE_URL` in `config.js` if the Cloud Functions URL differs.


---

## 🐳 Docker

```bash
docker build -t votewise:latest .
docker run -p 8080:80 votewise:latest
# → http://localhost:8080
```

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for our vulnerability reporting policy.

Key security measures:
- **Content Security Policy** (meta tag + nginx header)
- **Input sanitization** — strips HTML, `javascript:`, `eval()`, `onerror` patterns
- **Rate limiting** — 30 calls max, 2s cooldown on Gemini API
- **HTML escaping** — all dynamic content escaped before DOM insertion
- **XSS protection** — `escapeHtml()` used on every user-controlled string
- **nginx hardening** — X-Frame-Options DENY, X-Content-Type-Options nosniff

---

## ♿ Accessibility

- WCAG 2.1 AA compliant
- Skip navigation link
- All interactive elements have `aria-label`
- Live regions for dynamic content (`aria-live="polite"`)
- Focus trap in modal and chat panel
- `prefers-reduced-motion` media query
- Keyboard navigable (Tab, Shift+Tab, Enter, Escape)

---

## 🧪 Testing

101 tests across 17 suites:

| Suite | Tests |
|---|---|
| Input Sanitization | 8 |
| Language Code Validation | 5 |
| Eligibility Checker Logic | 7 |
| DOM Accessibility | 7 |
| Security Headers | 6 |
| Calendar URL Generation | 6 |
| ... 10 more suites | 51 |

**Run in browser:** `Ctrl+Shift+T`

---

## 📄 License

MIT © 2026 Tanmay Dalvi — see [LICENSE](LICENSE)
