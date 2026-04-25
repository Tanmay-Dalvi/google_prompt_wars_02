# Security Policy — VoteWise

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability in VoteWise, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email: **security@votewise.example.com** (replace with actual contact)
2. Include: description, steps to reproduce, potential impact, and suggested fix
3. We will acknowledge within **48 hours** and provide a fix timeline within **7 days**

### Scope

In scope:
- XSS vulnerabilities in user input handling
- CSP bypass vectors
- Firebase security rule misconfigurations
- API key exposure in client-side code
- Insecure direct object references in Cloud Functions

Out of scope:
- Denial of service attacks
- Social engineering attacks on users
- Issues in third-party dependencies already reported upstream

## Security Measures Implemented

| Measure | Implementation |
|---------|----------------|
| Content Security Policy | meta tag + nginx header |
| Input Sanitization | `security.js` — strips `<script>`, `javascript:`, `eval()`, `onerror` |
| HTML Escaping | `escapeHtml()` used on all dynamic DOM insertions |
| Rate Limiting | 30 Gemini API calls max, 2-second cooldown |
| XSS Protection | `X-XSS-Protection: 1; mode=block` via nginx |
| Frame Options | `X-Frame-Options: DENY` — no iframing allowed |
| HSTS | `Strict-Transport-Security` in nginx production config |
| No inline JS | Zero inline scripts in index.html |
| Permissions Policy | Camera, microphone, geolocation denied |

## Dependency Security

Run `npm audit` to check for known vulnerabilities in Cloud Functions dependencies:

```bash
cd functions && npm audit --audit-level=high
```

The CI pipeline runs security audits on every push (see `.github/workflows/ci.yml`).
