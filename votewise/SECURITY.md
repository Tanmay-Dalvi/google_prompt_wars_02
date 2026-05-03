# Security Policy — VoteWise

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email:** security@votewise.example.com
2. **Include:** Description, reproduction steps, potential impact, suggested fix
3. **Response SLA:** Acknowledgement within 48 hours, fix timeline within 7 days

---

## Security Architecture

### Defence in Depth

VoteWise applies security at every layer:

| Layer | Mechanism |
|---|---|
| **Transport** | HTTPS enforced via Cloud Run + HSTS header (`max-age=31536000; includeSubDomains; preload`) |
| **Content** | CSP header in both `nginx.conf` and `index.html` meta tag |
| **Input** | `sanitizeInput()` strips HTML tags, limits to 200 chars, blocks XSS vectors |
| **Output** | `escapeHtml()` used on all dynamic DOM insertion — no raw innerHTML from user data |
| **API** | Gemini API called server-side only via Cloud Functions — no API key in browser requests |
| **Rate limiting** | Client-side: 2s cooldown, 30 calls max per session via `rateLimiter` |
| **Validation** | `validateConfig()`, `validateGeminiResponse()`, `validateCloudFunctionResponse()`, `validateFirebaseData()` |
| **Firebase** | Anonymous auth only; session IDs are UUID v4 — no PII stored |
| **HTTP Headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` |
| **Secrets** | API keys stored in Cloud Run environment variables and Firebase Secret Manager — never committed |

### Threat Model

| Threat | Mitigation |
|---|---|
| XSS via chat input | `sanitizeInput()` + `escapeHtml()` + CSP `script-src` |
| API key theft | Keys only in Cloud Functions environment, not in client code |
| Firebase data injection | `validateFirebaseData()` schema check before use |
| Clickjacking | `X-Frame-Options: DENY` |
| Prompt injection | Input sanitized before reaching Gemini API |
| DDoS | Cloud Run auto-scaling + client-side rate limiter |
| Dependency vulnerabilities | `npm audit` in CI `security-audit` job |

### Security Scope

**In scope:**
- XSS vulnerabilities in user input handling
- CSP bypass vectors
- Firebase security rule misconfigurations
- API key exposure in client-side code
- Insecure direct object references in Cloud Functions
- CORS misconfiguration on Cloud Functions

**Out of scope:**
- Attacks requiring physical access to servers
- Social engineering of maintainers
- Vulnerabilities in Google Cloud infrastructure

---

## Security Checklist for Contributors

Before submitting a PR:

- [ ] No `eval()`, `new Function()`, or `innerHTML` with user data
- [ ] All user inputs pass through `sanitizeInput()`
- [ ] All dynamic DOM updates use `escapeHtml()` 
- [ ] No secrets or API keys in any committed file
- [ ] New Cloud Function endpoints validate input server-side
- [ ] `npm audit --audit-level=high` passes in `functions/`

---

## Contact

For non-security bugs, open a GitHub Issue.  
For security issues, email security@votewise.example.com.
